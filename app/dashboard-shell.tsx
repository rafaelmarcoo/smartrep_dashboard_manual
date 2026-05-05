"use client";

import { useState } from "react";

import { LiveSync } from "@/app/live-sync";
import type { DashboardData, WorkoutSession } from "@/lib/dashboard-data";

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

export function DashboardShell({ initialData }: { initialData: DashboardData }) {
  const [dashboardData, setDashboardData] = useState(initialData);
  const [activeView, setActiveView] = useState<"availability" | "workouts">("availability");
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(
    initialData.latestWorkout?.id ?? null
  );
  const occupiedCount = dashboardData.equipment.filter(
    (item) => item.current_status === "occupied"
  ).length;
  const availableCount = dashboardData.equipment.length - occupiedCount;
  const selectedWorkout =
    dashboardData.recentWorkouts.find((session) => session.id === selectedWorkoutId) ??
    dashboardData.recentWorkouts[0] ??
    dashboardData.latestWorkout;

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
