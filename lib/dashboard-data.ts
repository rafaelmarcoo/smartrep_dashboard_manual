import { supabasePublic } from "@/lib/supabase-public";

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
  session_status?: string | null;
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
  angle_data: string | number | boolean | Record<string, unknown> | unknown[] | null;
  coaching_summary: string | null;
  started_at: string | null;
  ended_at: string | null;
  set_status?: string | null;
};

export type DashboardData = {
  activeWorkout: WorkoutSession | null;
  activeSet: WorkoutSet | null;
  completedSessions: CompletedSession[];
  equipment: EquipmentStatus[];
  latestWorkout: WorkoutSession | null;
  recentWorkouts: WorkoutSession[];
  recentSets: WorkoutSet[];
};

const WORKOUT_SESSION_FIELDS =
  "id, external_session_id, exercise, sets, reps_per_set, bad_reps, form_score, coaching_summary, started_at, ended_at, session_status";

const WORKOUT_SET_FIELDS =
  "id, external_set_id, external_session_id, set_number, exercise, reps, bad_reps, form_score, angle_data, coaching_summary, started_at, ended_at, set_status";

export async function getDashboardData(): Promise<DashboardData> {
  const [
    equipmentResult,
    completedSessionsResult,
    activeWorkoutResult,
    activeSetResult,
    latestWorkoutResult,
    recentWorkoutsResult,
    recentSetsResult,
  ] = await Promise.all([
    supabasePublic.from("equipment_status").select("*").order("equipment_name"),
    supabasePublic
      .from("equipment_sessions")
      .select("id, equipment_name, ended_at, duration_seconds")
      .eq("session_status", "completed")
      .order("ended_at", { ascending: false })
      .limit(10),
    supabasePublic
      .from("workout_sessions")
      .select(WORKOUT_SESSION_FIELDS)
      .eq("session_status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabasePublic
      .from("workout_sets")
      .select(WORKOUT_SET_FIELDS)
      .in("set_status", ["countdown", "active", "processing_feedback"])
      .order("set_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabasePublic
      .from("workout_sessions")
      .select(WORKOUT_SESSION_FIELDS)
      .eq("session_status", "completed")
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabasePublic
      .from("workout_sessions")
      .select(WORKOUT_SESSION_FIELDS)
      .eq("session_status", "completed")
      .order("ended_at", { ascending: false })
      .limit(5),
    supabasePublic
      .from("workout_sets")
      .select(WORKOUT_SET_FIELDS)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (equipmentResult.error) {
    throw new Error(`Failed to load equipment status: ${equipmentResult.error.message}`);
  }

  if (completedSessionsResult.error) {
    throw new Error(
      `Failed to load completed sessions: ${completedSessionsResult.error.message}`
    );
  }

  if (activeWorkoutResult.error) {
    throw new Error(`Failed to load active workout: ${activeWorkoutResult.error.message}`);
  }

  if (activeSetResult.error) {
    throw new Error(`Failed to load active set: ${activeSetResult.error.message}`);
  }

  if (latestWorkoutResult.error) {
    throw new Error(`Failed to load latest workout: ${latestWorkoutResult.error.message}`);
  }

  if (recentWorkoutsResult.error) {
    throw new Error(`Failed to load recent workouts: ${recentWorkoutsResult.error.message}`);
  }

  if (recentSetsResult.error) {
    throw new Error(`Failed to load workout sets: ${recentSetsResult.error.message}`);
  }

  return {
    activeWorkout: (activeWorkoutResult.data ?? null) as WorkoutSession | null,
    activeSet: (activeSetResult.data ?? null) as WorkoutSet | null,
    equipment: (equipmentResult.data ?? []) as EquipmentStatus[],
    completedSessions: (completedSessionsResult.data ?? []) as CompletedSession[],
    latestWorkout: (latestWorkoutResult.data ?? null) as WorkoutSession | null,
    recentWorkouts: (recentWorkoutsResult.data ?? []) as WorkoutSession[],
    recentSets: (recentSetsResult.data ?? []) as WorkoutSet[],
  };
}
