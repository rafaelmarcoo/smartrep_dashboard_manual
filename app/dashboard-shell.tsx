"use client";

import { useEffect, useState } from "react";

import { LiveSync } from "@/app/live-sync";
import type {
  ActiveWorkoutSession,
  DashboardData,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/dashboard-data";
import {
  DEFAULT_COUNTDOWN_SECONDS,
  SUPPORTED_WORKOUT_EXERCISES,
  WORKOUT_EXERCISES,
  WORKOUT_STATES,
  type WorkoutExercise,
} from "@/lib/workout-contract";

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

function stateLabel(state: string) {
  switch (state) {
    case WORKOUT_STATES.sessionReady:
      return "Ready";
    case WORKOUT_STATES.countdown:
      return "Countdown";
    case WORKOUT_STATES.setActive:
      return "Set Active";
    case WORKOUT_STATES.setReview:
      return "Set Review";
    case WORKOUT_STATES.sessionComplete:
      return "Complete";
    default:
      return "Idle";
  }
}

function getSetHistory(workoutSets: WorkoutSet[], sessionId: string | null | undefined) {
  if (!sessionId) return [];

  return workoutSets
    .filter((setRow) => setRow.external_session_id === sessionId)
    .sort((a, b) => {
      const left = a.set_number ?? 0;
      const right = b.set_number ?? 0;
      return left - right;
    });
}

function getNextSetNumber(activeWorkout: ActiveWorkoutSession | null) {
  if (!activeWorkout) return 1;

  if (activeWorkout.state === WORKOUT_STATES.setReview) {
    return (activeWorkout.currentSetNumber ?? activeWorkout.lastCompletedSet?.set_number ?? 0) + 1;
  }

  if (activeWorkout.state === WORKOUT_STATES.sessionReady) {
    return 1;
  }

  return activeWorkout.currentSetNumber ?? 1;
}

function getCountdownRemainingMs(
  activeWorkout: ActiveWorkoutSession | null,
  nowMs: number | null
) {
  if (
    !activeWorkout ||
    nowMs === null ||
    activeWorkout.state !== WORKOUT_STATES.countdown ||
    !activeWorkout.countdownStartedAt
  ) {
    return null;
  }

  const countdownSeconds = activeWorkout.countdownSeconds ?? DEFAULT_COUNTDOWN_SECONDS;
  const deadline =
    new Date(activeWorkout.countdownStartedAt).getTime() + countdownSeconds * 1_000;

  return Math.max(0, deadline - nowMs);
}

async function postJson<TBody extends Record<string, unknown>>(url: string, body: TBody) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
  };

  if (!res.ok || payload.ok !== true) {
    throw new Error(payload.error ?? "Request failed");
  }
}

export function DashboardShell({ initialData }: { initialData: DashboardData }) {
  const [dashboardData, setDashboardData] = useState(initialData);
  const [activeView, setActiveView] = useState<"availability" | "workouts">("availability");
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(
    initialData.latestWorkout?.id ?? null
  );
  const [selectedExercise, setSelectedExercise] = useState<WorkoutExercise>(
    WORKOUT_EXERCISES.bicepCurl
  );
  const [commandError, setCommandError] = useState<string | null>(null);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const occupiedCount = dashboardData.equipment.filter(
    (item) => item.current_status === "occupied"
  ).length;
  const availableCount = dashboardData.equipment.length - occupiedCount;
  const selectedWorkout =
    dashboardData.recentWorkouts.find((session) => session.id === selectedWorkoutId) ??
    dashboardData.recentWorkouts[0] ??
    dashboardData.latestWorkout;
  const selectedWorkoutSets = getSetHistory(
    dashboardData.workoutSets,
    selectedWorkout?.external_session_id
  );
  const activeWorkout = dashboardData.activeWorkout;
  const activeWorkoutSets = getSetHistory(dashboardData.workoutSets, activeWorkout?.sessionId);
  const countdownRemainingMs = getCountdownRemainingMs(activeWorkout, nowMs);

  async function handleStartSession() {
    setCommandError(null);
    setIsSendingCommand(true);

    try {
      await postJson("/api/workout/session/start", {
        exercise: selectedExercise,
      });
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Failed to start session");
    } finally {
      setIsSendingCommand(false);
    }
  }

  async function handleStartSet() {
    if (!activeWorkout) return;

    setCommandError(null);
    setIsSendingCommand(true);

    try {
      await postJson("/api/workout/set/start", {
        session_id: activeWorkout.sessionId,
        set_number: getNextSetNumber(activeWorkout),
        countdown_s: DEFAULT_COUNTDOWN_SECONDS,
      });
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Failed to start set");
    } finally {
      setIsSendingCommand(false);
    }
  }

  async function handleEndSet() {
    if (!activeWorkout) return;

    setCommandError(null);
    setIsSendingCommand(true);

    try {
      await postJson("/api/workout/set/end", {
        session_id: activeWorkout.sessionId,
      });
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Failed to end set");
    } finally {
      setIsSendingCommand(false);
    }
  }

  async function handleEndSession() {
    if (!activeWorkout) return;

    setCommandError(null);
    setIsSendingCommand(true);

    try {
      await postJson("/api/workout/session/end", {
        session_id: activeWorkout.sessionId,
      });
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Failed to end session");
    } finally {
      setIsSendingCommand(false);
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
                Live gym status, guided workout controls, and synced coaching.
              </p>
            </div>
            <LiveSync onData={setDashboardData} />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
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
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Workout</p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {activeWorkout ? stateLabel(activeWorkout.state) : "Idle"}
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Guided Workout
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Manual session control
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                Choose an exercise, trigger the session from the dashboard, and review set-level
                coaching before the next round.
              </p>
            </div>

            {activeWorkout ? (
              <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                {formatExerciseName(activeWorkout.exercise)} · {stateLabel(activeWorkout.state)}
              </div>
            ) : null}
          </div>

          {!activeWorkout ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {SUPPORTED_WORKOUT_EXERCISES.map((exercise) => {
                  const isSelected = selectedExercise === exercise;

                  return (
                    <button
                      key={exercise}
                      type="button"
                      onClick={() => setSelectedExercise(exercise)}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
                        Exercise
                      </p>
                      <p className="mt-2 text-xl font-semibold capitalize">
                        {formatExerciseName(exercise)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleStartSession}
                  disabled={isSendingCommand}
                  className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isSendingCommand ? "Starting..." : "Start Session"}
                </button>
                <p className="text-sm text-slate-500">
                  The session will appear here after the next sync from the Pi.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4 rounded-2xl bg-slate-50 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">State</p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {stateLabel(activeWorkout.state)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Current set
                    </p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {activeWorkout.currentSetNumber ?? "Waiting"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Exercise
                    </p>
                    <p className="mt-2 text-xl font-semibold capitalize text-slate-950">
                      {formatExerciseName(activeWorkout.exercise)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      Countdown
                    </p>
                    <p className="mt-2 text-xl font-semibold text-slate-950">
                      {countdownRemainingMs !== null
                        ? `${Math.ceil(countdownRemainingMs / 1000)}s`
                        : "Ready"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {(activeWorkout.state === WORKOUT_STATES.sessionReady ||
                    activeWorkout.state === WORKOUT_STATES.setReview) && (
                    <button
                      type="button"
                      onClick={handleStartSet}
                      disabled={isSendingCommand}
                      className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {isSendingCommand
                        ? "Sending..."
                        : activeWorkout.state === WORKOUT_STATES.setReview
                          ? "Start Next Set"
                          : "Start Set"}
                    </button>
                  )}

                  {activeWorkout.state === WORKOUT_STATES.setActive && (
                    <button
                      type="button"
                      onClick={handleEndSet}
                      disabled={isSendingCommand}
                      className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-300"
                    >
                      {isSendingCommand ? "Ending..." : "End Set"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleEndSession}
                    disabled={isSendingCommand}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                  >
                    {isSendingCommand ? "Sending..." : "End Session"}
                  </button>
                </div>

                <p className="text-sm text-slate-500">
                  Session started{" "}
                  {activeWorkout.startedAt
                    ? new Date(activeWorkout.startedAt).toLocaleTimeString()
                    : "recently"}
                  .
                </p>
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Between sets
                  </p>
                  <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                    Latest coaching
                  </h3>
                </div>

                {activeWorkout.lastCompletedSet ? (
                  <article className="space-y-3 rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-950">
                        Set {activeWorkout.lastCompletedSet.set_number}
                      </p>
                      <p className="text-sm text-slate-500">
                        Form score {activeWorkout.lastCompletedSet.form_score ?? "N/A"}
                      </p>
                    </div>
                    <p className="text-sm text-slate-600">
                      Reps {activeWorkout.lastCompletedSet.reps ?? "N/A"} · Bad reps{" "}
                      {activeWorkout.lastCompletedSet.bad_reps ?? "N/A"}
                    </p>
                    <p className="text-sm leading-6 text-slate-700">
                      {activeWorkout.lastCompletedSet.coaching_summary ??
                        "Coaching will appear after the first completed set."}
                    </p>
                  </article>
                ) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    Complete a set to see coaching feedback here.
                  </div>
                )}

                {activeWorkoutSets.length > 0 ? (
                  <div className="space-y-3">
                    {activeWorkoutSets.map((setRow) => (
                      <div
                        key={setRow.external_set_id}
                        className="rounded-2xl border border-slate-200 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-950">Set {setRow.set_number}</p>
                          <p className="text-sm text-slate-500">
                            {setRow.reps ?? "N/A"} reps
                          </p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          Form score {setRow.form_score ?? "N/A"} · Bad reps{" "}
                          {setRow.bad_reps ?? "N/A"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {commandError ? <p className="mt-4 text-sm text-red-600">{commandError}</p> : null}
        </section>

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

        {activeView === "availability" ? (
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
                      Final coaching
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-700">
                      {selectedWorkout.coaching_summary ?? "No coaching summary captured yet."}
                    </p>
                  </div>

                  <div className="mt-6 space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Set breakdown
                    </p>
                    {selectedWorkoutSets.length > 0 ? (
                      selectedWorkoutSets.map((setRow) => (
                        <article
                          key={setRow.external_set_id}
                          className="rounded-2xl border border-slate-200 px-4 py-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h4 className="font-medium text-slate-950">Set {setRow.set_number}</h4>
                            <p className="text-sm text-slate-500">
                              {setRow.reps ?? "N/A"} reps · Form {setRow.form_score ?? "N/A"}
                            </p>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            {setRow.coaching_summary ?? "No coaching captured for this set."}
                          </p>
                        </article>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                        No set-level data has been synced for this workout yet.
                      </div>
                    )}
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
