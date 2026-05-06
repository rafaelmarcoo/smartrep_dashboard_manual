"use client";

import { useState } from "react";

import { LiveSync } from "@/app/live-sync";
import type { DashboardData, WorkoutSession, WorkoutSet } from "@/lib/dashboard-data";

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

function formatExerciseName(name: string) {
  return name.replaceAll("_", " ");
}

function formatWorkoutValue(value: WorkoutSession["reps_per_set"]) {
  if (value === null || value === undefined) return "Not captured";

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatSetValue(value: WorkoutSet["angle_data"]) {
  if (value === null || value === undefined) return "Not captured";
  if (Array.isArray(value)) return `${value.length} reps captured`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function sendWorkoutControl(action: string, exercise?: string) {
  const res = await fetch("/api/workouts/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, exercise }),
  });

  const payload = (await res.json()) as { ok?: boolean; error?: string };

  if (!res.ok || !payload.ok) {
    throw new Error(payload.error ?? "Workout control failed");
  }

  return payload;
}

export function DashboardShell({ initialData }: { initialData: DashboardData }) {
  const [dashboardData, setDashboardData] = useState(initialData);
  const [activeView, setActiveView] = useState<"availability" | "workouts">("availability");
  const [selectedExercise, setSelectedExercise] = useState<"bicep_curl" | "squat">("bicep_curl");
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(
    initialData.latestWorkout?.id ?? null
  );
  const [controlError, setControlError] = useState<string | null>(null);
  const [isSendingControl, setIsSendingControl] = useState(false);
  const occupiedCount = dashboardData.equipment.filter(
    (item) => item.current_status === "occupied"
  ).length;
  const availableCount = dashboardData.equipment.length - occupiedCount;
  const activeWorkout = dashboardData.activeWorkout;
  const activeSet = dashboardData.activeSet;
  const selectedWorkout =
    dashboardData.recentWorkouts.find((session) => session.id === selectedWorkoutId) ??
    dashboardData.recentWorkouts[0] ??
    dashboardData.latestWorkout;

  async function handleControl(action: string) {
    setControlError(null);
    setIsSendingControl(true);

    try {
      await sendWorkoutControl(
        action,
        action === "start_session" ? selectedExercise : undefined
      );
      const res = await fetch("/api/dashboard/availability");
      const payload = (await res.json()) as ({ ok: true } & DashboardData) | { error?: string };

      if (!res.ok || !("ok" in payload) || payload.ok !== true) {
        throw new Error(("error" in payload && payload.error) || "Dashboard refresh failed");
      }

      setDashboardData(payload);
      setActiveView("workouts");
    } catch (error) {
      setControlError(error instanceof Error ? error.message : "Workout control failed");
    } finally {
      setIsSendingControl(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                SmartRep Dashboard
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                SmartRep
              </h1>
              <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
                Live gym status and workout summaries.
              </p>
            </div>
            <LiveSync onData={setDashboardData} />
          </div>

          <div className="inline-grid w-full grid-cols-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveView("availability")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeView === "availability"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Availability
            </button>
            <button
              type="button"
              onClick={() => setActiveView("workouts")}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeView === "workouts"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Workout Summary
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Available</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {availableCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Occupied</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {occupiedCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Equipment</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {dashboardData.equipment.length}
              </p>
            </div>
          </div>
        </header>

        {activeView === "availability" ? (
          <>
            <section className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Availability
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                    Equipment
                  </h2>
                </div>
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
          </>
        ) : (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Workout Summary
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                  Sessions
                </h2>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Manual Control
                    </p>
                    <h3 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                      {activeWorkout
                        ? `${formatExerciseName(activeWorkout.exercise)} session active`
                        : "Ready to start a workout"}
                    </h3>
                  </div>

                  <div className="inline-grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                    {(["bicep_curl", "squat"] as const).map((exercise) => (
                      <button
                        key={exercise}
                        type="button"
                        disabled={Boolean(activeWorkout) || isSendingControl}
                        onClick={() => setSelectedExercise(exercise)}
                        className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          selectedExercise === exercise
                            ? "bg-slate-900 text-white"
                            : "text-slate-600 hover:bg-white"
                        }`}
                      >
                        {formatExerciseName(exercise)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <button
                    type="button"
                    disabled={Boolean(activeWorkout) || isSendingControl}
                    onClick={() => void handleControl("start_session")}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Start Session
                  </button>
                  <button
                    type="button"
                    disabled={!activeWorkout || Boolean(activeSet) || isSendingControl}
                    onClick={() => void handleControl("start_set")}
                    className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Start Set
                  </button>
                  <button
                    type="button"
                    disabled={!activeSet || isSendingControl}
                    onClick={() => void handleControl("end_set")}
                    className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
                  >
                    End Set
                  </button>
                  <button
                    type="button"
                    disabled={!activeWorkout || Boolean(activeSet) || isSendingControl}
                    onClick={() => void handleControl("end_session")}
                    className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    End Session
                  </button>
                  <button
                    type="button"
                    disabled={!activeWorkout || isSendingControl}
                    onClick={() => void handleControl("cancel_session")}
                    className="rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Session
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">
                    {activeWorkout
                      ? activeWorkout.external_session_id.slice(0, 8)
                      : "Not active"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Current set
                  </p>
                  <p className="mt-2 text-sm font-semibold capitalize text-slate-950">
                    {activeSet
                      ? `Set ${activeSet.set_number} - ${activeSet.set_status ?? "active"}`
                      : "No active set"}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Exercise lock
                  </p>
                  <p className="mt-2 text-sm font-semibold capitalize text-slate-950">
                    {formatExerciseName(activeWorkout?.exercise ?? selectedExercise)}
                  </p>
                </div>
              </div>

              {controlError ? (
                <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {controlError}
                </p>
              ) : null}
            </div>

            {dashboardData.recentSets.length > 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Set Feedback
                  </p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                    Recent sets
                  </h3>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {dashboardData.recentSets.map((set) => (
                    <article
                      key={set.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold capitalize text-slate-950">
                            {formatExerciseName(set.exercise)} set {set.set_number}
                          </p>
                          <p className="mt-1 text-xs capitalize text-slate-500">
                            {set.set_status ?? "completed"}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700">
                          Score {set.form_score ?? "N/A"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-xs text-slate-500">Reps</p>
                          <p className="font-semibold text-slate-950">
                            {set.reps ?? "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Bad reps</p>
                          <p className="font-semibold text-slate-950">
                            {set.bad_reps ?? "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Angles</p>
                          <p className="font-semibold text-slate-950">
                            {formatSetValue(set.angle_data)}
                          </p>
                        </div>
                      </div>

                      <p className="mt-4 text-sm leading-6 text-slate-700">
                        {set.coaching_summary ?? "Waiting for set feedback."}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedWorkout ? (
              <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
                <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="space-y-2">
                    {dashboardData.recentWorkouts.map((session) => {
                      const isActive = session.id === selectedWorkout.id;

                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => setSelectedWorkoutId(session.id)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            isActive
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <p className="font-medium capitalize">
                            {formatExerciseName(session.exercise)}
                          </p>
                          <p
                            className={`mt-1 text-sm ${
                              isActive ? "text-slate-200" : "text-slate-500"
                            }`}
                          >
                            {session.ended_at
                              ? new Date(session.ended_at).toLocaleString()
                              : "Not captured"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="space-y-2">
                    <h3 className="text-3xl font-semibold capitalize tracking-tight text-slate-950">
                      {formatExerciseName(selectedWorkout.exercise)}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Ended{" "}
                      {selectedWorkout.ended_at
                        ? new Date(selectedWorkout.ended_at).toLocaleString()
                        : "Not captured"}
                    </p>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Sets</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {selectedWorkout.sets ?? "Not captured"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Reps per set
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {formatWorkoutValue(selectedWorkout.reps_per_set)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Bad reps
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {selectedWorkout.bad_reps ?? "Not captured"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        Form score
                      </p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">
                        {selectedWorkout.form_score ?? "Not captured"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Coaching
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {selectedWorkout.coaching_summary ?? "No coaching summary captured yet."}
                    </p>
                  </div>
                </article>
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 text-sm text-slate-500 shadow-sm">
                No workout sessions have been synced yet.
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
