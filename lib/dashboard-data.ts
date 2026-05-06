import { supabaseAdmin } from "@/lib/supabase-admin";
import { WORKOUT_EVENTS, WORKOUT_STATES } from "@/lib/workout-contract";

export type EquipmentStatus = {
  equipment_name: string;
  current_status: string;
  last_changed_at: string;
  updated_at: string;
  source_device: string;
  latest_session_id?: string | null;
};

export type CompletedSession = {
  id: string;
  equipment_name: string;
  ended_at: string | null;
  duration_seconds: string | number | null;
};

export type WorkoutSet = {
  id: string;
  external_set_id: string;
  external_session_id: string;
  set_number: number;
  exercise: string;
  reps: number | null;
  bad_reps: number | null;
  form_score: number | string | null;
  angle_data: unknown[] | Record<string, unknown> | null;
  coaching_summary: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type WorkoutSession = {
  id: string;
  external_session_id: string;
  exercise: string;
  sets: number | null;
  reps_per_set: string | number | boolean | Record<string, unknown> | unknown[] | null;
  bad_reps: number | null;
  form_score: number | string | null;
  coaching_summary: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type ActiveWorkoutSession = {
  sessionId: string;
  exercise: string;
  state: string;
  currentSetNumber: number | null;
  countdownSeconds: number | null;
  countdownStartedAt: string | null;
  scheduledStartTime: string | null;
  startedAt: string | null;
  updatedAt: string;
  lastCompletedSet: WorkoutSet | null;
};

export type DashboardData = {
  completedSessions: CompletedSession[];
  equipment: EquipmentStatus[];
  latestWorkout: WorkoutSession | null;
  recentWorkouts: WorkoutSession[];
  workoutSets: WorkoutSet[];
  activeWorkout: ActiveWorkoutSession | null;
};

type RawWorkoutEventRow = {
  ts_ms: number;
  payload: Record<string, unknown>;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function deriveActiveWorkout(
  rawEvents: RawWorkoutEventRow[],
  workoutSets: WorkoutSet[]
): ActiveWorkoutSession | null {
  const sessions = new Map<string, ActiveWorkoutSession>();
  const sorted = [...rawEvents].sort((a, b) => a.ts_ms - b.ts_ms);

  for (const row of sorted) {
    const event = asString(row.payload.event);
    const sessionId = asString(row.payload.session_id);
    const exercise = asString(row.payload.exercise);
    if (!event || !sessionId) continue;

    if (event === WORKOUT_EVENTS.sessionStarted) {
      sessions.set(sessionId, {
        sessionId,
        exercise: exercise ?? "unknown",
        state: WORKOUT_STATES.sessionReady,
        currentSetNumber: null,
        countdownSeconds: null,
        countdownStartedAt: null,
        scheduledStartTime: null,
        startedAt: asString(row.payload.start_time),
        updatedAt: new Date(row.ts_ms).toISOString(),
        lastCompletedSet: null,
      });
      continue;
    }

    const current = sessions.get(sessionId);
    if (!current) continue;

    current.updatedAt = new Date(row.ts_ms).toISOString();
    if (exercise) current.exercise = exercise;

    if (event === WORKOUT_EVENTS.setCountdownStarted) {
      current.state = WORKOUT_STATES.countdown;
      current.currentSetNumber = asNumber(row.payload.set_number);
      current.countdownSeconds = asNumber(row.payload.countdown_s);
      current.countdownStartedAt = asString(row.payload.start_time);
      current.scheduledStartTime = asString(row.payload.scheduled_start_time);
    } else if (event === WORKOUT_EVENTS.setStarted) {
      current.state = WORKOUT_STATES.setActive;
      current.currentSetNumber = asNumber(row.payload.set_number);
      current.countdownSeconds = null;
      current.countdownStartedAt = null;
      current.scheduledStartTime = null;
    } else if (event === WORKOUT_EVENTS.setCompleted) {
      current.state = WORKOUT_STATES.setReview;
      current.currentSetNumber = asNumber(row.payload.set_number);
      current.countdownSeconds = null;
      current.countdownStartedAt = null;
      current.scheduledStartTime = null;
      current.lastCompletedSet =
        workoutSets.find((setRow) => setRow.external_set_id === asString(row.payload.set_id)) ??
        null;
    } else if (event === WORKOUT_EVENTS.sessionCompleted || event === WORKOUT_EVENTS.sessionCancelled) {
      sessions.delete(sessionId);
    }
  }

  const activeSessions = Array.from(sessions.values()).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1
  );

  return activeSessions[0] ?? null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const [
    equipmentResult,
    completedSessionsResult,
    latestWorkoutResult,
    recentWorkoutsResult,
    rawWorkoutEventsResult,
  ] = await Promise.all([
    supabaseAdmin.from("equipment_status").select("*").order("equipment_name"),
    supabaseAdmin
      .from("equipment_sessions")
      .select("id, equipment_name, ended_at, duration_seconds")
      .eq("session_status", "completed")
      .order("ended_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("workout_sessions")
      .select(
        "id, external_session_id, exercise, sets, reps_per_set, bad_reps, form_score, coaching_summary, started_at, ended_at"
      )
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("workout_sessions")
      .select(
        "id, external_session_id, exercise, sets, reps_per_set, bad_reps, form_score, coaching_summary, started_at, ended_at"
      )
      .order("ended_at", { ascending: false })
      .limit(5),
    supabaseAdmin
      .from("raw_telemetry_log")
      .select("ts_ms, payload")
      .eq("source_device", "SmartRep-Pi1-Camera")
      .order("ts_ms", { ascending: false })
      .limit(200),
  ]);

  if (equipmentResult.error) {
    throw new Error(`Failed to load equipment status: ${equipmentResult.error.message}`);
  }

  if (completedSessionsResult.error) {
    throw new Error(
      `Failed to load completed sessions: ${completedSessionsResult.error.message}`
    );
  }

  if (latestWorkoutResult.error) {
    throw new Error(`Failed to load latest workout: ${latestWorkoutResult.error.message}`);
  }

  if (recentWorkoutsResult.error) {
    throw new Error(`Failed to load recent workouts: ${recentWorkoutsResult.error.message}`);
  }

  if (rawWorkoutEventsResult.error) {
    throw new Error(`Failed to load raw workout events: ${rawWorkoutEventsResult.error.message}`);
  }

  const recentWorkouts = (recentWorkoutsResult.data ?? []) as WorkoutSession[];
  const rawEvents = (rawWorkoutEventsResult.data ?? []) as RawWorkoutEventRow[];

  const sessionIdsFromRawEvents = Array.from(
    new Set(
      rawEvents
        .map((row) => asString(row.payload.session_id))
        .filter((value): value is string => Boolean(value))
    )
  );
  const recentWorkoutIds = recentWorkouts.map((session) => session.external_session_id);
  const sessionIdsForSets = Array.from(
    new Set([...recentWorkoutIds, ...sessionIdsFromRawEvents].filter(Boolean))
  );

  const workoutSetsResult =
    sessionIdsForSets.length > 0
      ? await supabaseAdmin
          .from("workout_sets")
          .select(
            "id, external_set_id, external_session_id, set_number, exercise, reps, bad_reps, form_score, angle_data, coaching_summary, started_at, ended_at"
          )
          .in("external_session_id", sessionIdsForSets)
          .order("started_at", { ascending: false })
      : { data: [], error: null };

  if (workoutSetsResult.error) {
    throw new Error(`Failed to load workout sets: ${workoutSetsResult.error.message}`);
  }

  const workoutSets = (workoutSetsResult.data ?? []) as WorkoutSet[];
  const activeWorkout = deriveActiveWorkout(rawEvents, workoutSets);

  return {
    equipment: (equipmentResult.data ?? []) as EquipmentStatus[],
    completedSessions: (completedSessionsResult.data ?? []) as CompletedSession[],
    latestWorkout: (latestWorkoutResult.data ?? null) as WorkoutSession | null,
    recentWorkouts,
    workoutSets,
    activeWorkout,
  };
}
