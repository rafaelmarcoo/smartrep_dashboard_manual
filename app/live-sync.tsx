"use client";

import { useEffect, useRef, useState } from "react";

import type { DashboardData } from "@/lib/dashboard-data";

const SYNC_INTERVAL_MS = 2_000;

type SyncState = {
  error: string | null;
  isSyncing: boolean;
  lastSyncedAt: string | null;
};

async function runSync() {
  const res = await fetch("/api/sync/availability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
  };

  if (!res.ok || !payload.ok) {
    throw new Error(payload.error ?? "Sync failed");
  }
}

async function getDashboardData() {
  const res = await fetch("/api/dashboard/availability", {
    method: "GET",
  });

  const payload = (await res.json()) as
    | ({ ok: true } & DashboardData)
    | { ok?: false; error?: string };

  if (!res.ok || payload.ok !== true) {
    throw new Error(("error" in payload && payload.error) || "Dashboard refresh failed");
  }

  return payload;
}

export function LiveSync({
  onData,
}: {
  onData: (dashboardData: DashboardData) => void;
}) {
  const isSyncingRef = useRef(false);
  const [syncState, setSyncState] = useState<SyncState>({
    error: null,
    isSyncing: false,
    lastSyncedAt: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function syncOnce() {
      if (isSyncingRef.current || document.visibilityState !== "visible") {
        return;
      }

      isSyncingRef.current = true;
      if (isMounted) {
        setSyncState((current) => ({
          ...current,
          error: null,
          isSyncing: true,
        }));
      }

      try {
        await runSync();
        const dashboardData = await getDashboardData();
        if (!isMounted) return;

        setSyncState({
          error: null,
          isSyncing: false,
          lastSyncedAt: new Date().toISOString(),
        });
        onData(dashboardData);
      } catch (error) {
        if (!isMounted) return;

        setSyncState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "Sync failed",
          isSyncing: false,
        }));
      } finally {
        isSyncingRef.current = false;
      }
    }

    void syncOnce();

    const intervalId = window.setInterval(() => {
      void syncOnce();
    }, SYNC_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [onData]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm text-slate-600 shadow-sm">
      <span
        className={`inline-flex h-2.5 w-2.5 rounded-full ${
          syncState.isSyncing ? "bg-amber-400" : "bg-emerald-500"
        }`}
      />
      <span>{syncState.isSyncing ? "Syncing live data..." : "Auto-sync every 2 seconds"}</span>
      <span className="text-slate-400">
        {syncState.lastSyncedAt
          ? `Last sync ${new Date(syncState.lastSyncedAt).toLocaleTimeString()}`
          : "Waiting for first sync"}
      </span>
      {syncState.error ? <span className="text-red-600">{syncState.error}</span> : null}
    </div>
  );
}
