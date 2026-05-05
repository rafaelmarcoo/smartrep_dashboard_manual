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
};

export type DashboardData = {
  completedSessions: CompletedSession[];
  equipment: EquipmentStatus[];
  latestWorkout: WorkoutSession | null;
  recentWorkouts: WorkoutSession[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const [
    equipmentResult,
    completedSessionsResult,
    latestWorkoutResult,
    recentWorkoutsResult,
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
      .select(
        "id, external_session_id, exercise, sets, reps_per_set, bad_reps, form_score, coaching_summary, started_at, ended_at"
      )
      .order("ended_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabasePublic
      .from("workout_sessions")
      .select(
        "id, external_session_id, exercise, sets, reps_per_set, bad_reps, form_score, coaching_summary, started_at, ended_at"
      )
      .order("ended_at", { ascending: false })
      .limit(5),
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

  return {
    equipment: (equipmentResult.data ?? []) as EquipmentStatus[],
    completedSessions: (completedSessionsResult.data ?? []) as CompletedSession[],
    latestWorkout: (latestWorkoutResult.data ?? null) as WorkoutSession | null,
    recentWorkouts: (recentWorkoutsResult.data ?? []) as WorkoutSession[],
  };
}
