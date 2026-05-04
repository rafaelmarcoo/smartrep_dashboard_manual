"use client";

import { useState } from "react";

import { LiveSync } from "@/app/live-sync";
import type { DashboardData } from "@/lib/dashboard-data";

function statusColor(status: string) {
  return status === "occupied"
    ? "border-rose-200 bg-rose-50"
    : "border-emerald-200 bg-emerald-50";
}

function formatEquipmentName(name: string) {
  return name.replaceAll("_", " ");
}

function statLabel(status: string) {
  return status === "occupied" ? "In use" : "Ready";
}

function relativeSyncTime(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();

  if (diffMs < 5_000) return "just now";

  const diffSeconds = Math.floor(diffMs / 1_000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  return `${diffMinutes}m ago`;
}

export function DashboardShell({ initialData }: { initialData: DashboardData }) {
  const [dashboardData, setDashboardData] = useState(initialData);
  const occupiedCount = dashboardData.equipment.filter(
    (item) => item.current_status === "occupied"
  ).length;
  const availableCount = dashboardData.equipment.length - occupiedCount;

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                SmartRep Dashboard
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Live availability
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Clean, live status for each piece of equipment. This screen shows current
                availability only.
              </p>
            </div>
            <LiveSync onData={setDashboardData} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Available</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {availableCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Occupied</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {occupiedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Equipment</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {dashboardData.equipment.length}
              </p>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Current Status
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                Equipment overview
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              Each card shows when the status last changed and when the row last synced.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {dashboardData.equipment.map((item) => (
              <article
                key={item.equipment_name}
                className={`rounded-3xl border p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 ${statusColor(
                  item.current_status
                )}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
                      {formatEquipmentName(item.equipment_name)}
                    </p>
                    <h3 className="text-3xl font-semibold capitalize tracking-tight text-slate-950">
                      {item.current_status}
                    </h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                    {statLabel(item.current_status)}
                  </span>
                </div>

                <div className="mt-8 space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Status since</span>
                    <span className="font-medium text-right text-slate-900">
                      {new Date(item.last_changed_at).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Last synced</span>
                    <span className="font-medium text-right text-slate-900">
                      {relativeSyncTime(item.updated_at)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-600 shadow-sm">
          <strong className="font-semibold text-slate-800">Status since</strong> shows the
          last telemetry timestamp when that item changed between <code>available</code> and{" "}
          <code>occupied</code>. <strong className="font-semibold text-slate-800">Last synced</strong>{" "}
          shows when the dashboard most recently refreshed that row from ThingsBoard.
        </section>
      </div>
    </main>
  );
}
