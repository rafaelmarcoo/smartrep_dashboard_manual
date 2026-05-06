import { supabaseAdmin } from "@/lib/supabase-admin";

export const SUPPORTED_EXERCISES = ["bicep_curl", "squat"] as const;
export type SupportedExercise = (typeof SUPPORTED_EXERCISES)[number];

type WorkoutCommandType =
  | "start_session"
  | "start_set"
  | "end_set"
  | "end_session"
  | "cancel_session";

type WorkoutSessionRow = {
  external_session_id: string;
  exercise: SupportedExercise;
  session_status: "active" | "completed" | "cancelled";
};

type WorkoutSetRow = {
  external_set_id: string;
  external_session_id: string;
  set_number: number;
  exercise: SupportedExercise;
  set_status: "countdown" | "active" | "processing_feedback" | "completed" | "cancelled";
};

function isSupportedExercise(value: unknown): value is SupportedExercise {
  return SUPPORTED_EXERCISES.includes(value as SupportedExercise);
}

async function enqueueCommand({
  commandType,
  sessionId,
  setId,
  exercise,
  setNumber,
  payload = {},
}: {
  commandType: WorkoutCommandType;
  sessionId?: string | null;
  setId?: string | null;
  exercise?: SupportedExercise | null;
  setNumber?: number | null;
  payload?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin
    .from("workout_commands")
    .insert({
      command_type: commandType,
      external_session_id: sessionId ?? null,
      external_set_id: setId ?? null,
      exercise: exercise ?? null,
      set_number: setNumber ?? null,
      payload,
      status: "pending",
      target_device: process.env.PI_DEVICE_ID ?? "SmartRep-Pi1",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

export async function getActiveWorkout() {
  const { data, error } = await supabaseAdmin
    .from("workout_sessions")
    .select("external_session_id, exercise, session_status")
    .eq("session_status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<WorkoutSessionRow>();

  if (error) throw error;
  return data;
}

async function getActiveSet(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("workout_sets")
    .select("external_set_id, external_session_id, set_number, exercise, set_status")
    .eq("external_session_id", sessionId)
    .in("set_status", ["countdown", "active", "processing_feedback"])
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle<WorkoutSetRow>();

  if (error) throw error;
  return data;
}

async function getNextSetNumber(sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("workout_sets")
    .select("set_number")
    .eq("external_session_id", sessionId)
    .order("set_number", { ascending: false })
    .limit(1)
    .maybeSingle<{ set_number: number }>();

  if (error) throw error;
  return (data?.set_number ?? 0) + 1;
}

export async function startWorkoutSession(exercise: unknown) {
  if (!isSupportedExercise(exercise)) {
    throw new Error("Choose bicep_curl or squat before starting a session.");
  }

  const existing = await getActiveWorkout();
  if (existing) {
    return {
      ok: true,
      status: "already_active",
      external_session_id: existing.external_session_id,
    };
  }

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("workout_sessions").insert({
    external_session_id: sessionId,
    exercise,
    session_status: "active",
    sets: 0,
    reps_per_set: [],
    bad_reps: 0,
    form_score: null,
    coaching_summary: null,
    started_at: now,
    ended_at: null,
    source_device: "SmartRep-Dashboard",
    updated_at: now,
  });

  if (error) throw error;

  const commandId = await enqueueCommand({
    commandType: "start_session",
    sessionId,
    exercise,
    payload: { started_at: now },
  });

  return { ok: true, status: "created", external_session_id: sessionId, command_id: commandId };
}

export async function startWorkoutSet() {
  const active = await getActiveWorkout();
  if (!active) throw new Error("Start a workout session before starting a set.");

  const existingSet = await getActiveSet(active.external_session_id);
  if (existingSet) {
    return {
      ok: true,
      status: "set_already_active",
      external_session_id: existingSet.external_session_id,
      external_set_id: existingSet.external_set_id,
    };
  }

  const setNumber = await getNextSetNumber(active.external_session_id);
  const setId = `${active.external_session_id}-set-${setNumber}`;
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("workout_sets").insert({
    external_set_id: setId,
    external_session_id: active.external_session_id,
    set_number: setNumber,
    exercise: active.exercise,
    set_status: "countdown",
    source_device: "SmartRep-Dashboard",
    updated_at: now,
  });

  if (error) throw error;

  const commandId = await enqueueCommand({
    commandType: "start_set",
    sessionId: active.external_session_id,
    setId,
    exercise: active.exercise,
    setNumber,
    payload: { countdown_seconds: 3 },
  });

  return {
    ok: true,
    status: "created",
    external_session_id: active.external_session_id,
    external_set_id: setId,
    command_id: commandId,
  };
}

export async function endWorkoutSet() {
  const active = await getActiveWorkout();
  if (!active) throw new Error("No active workout session found.");

  const activeSet = await getActiveSet(active.external_session_id);
  if (!activeSet) throw new Error("No active set found.");

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("workout_sets")
    .update({ set_status: "processing_feedback", updated_at: now })
    .eq("external_set_id", activeSet.external_set_id);

  if (error) throw error;

  const commandId = await enqueueCommand({
    commandType: "end_set",
    sessionId: active.external_session_id,
    setId: activeSet.external_set_id,
    exercise: active.exercise,
    setNumber: activeSet.set_number,
  });

  return {
    ok: true,
    external_session_id: active.external_session_id,
    external_set_id: activeSet.external_set_id,
    command_id: commandId,
  };
}

export async function endWorkoutSession() {
  const active = await getActiveWorkout();
  if (!active) throw new Error("No active workout session found.");

  const activeSet = await getActiveSet(active.external_session_id);
  if (activeSet) throw new Error("End the active set before ending the session.");

  const commandId = await enqueueCommand({
    commandType: "end_session",
    sessionId: active.external_session_id,
    exercise: active.exercise,
  });

  return {
    ok: true,
    external_session_id: active.external_session_id,
    command_id: commandId,
  };
}

export async function cancelWorkoutSession() {
  const active = await getActiveWorkout();
  if (!active) throw new Error("No active workout session found.");

  const now = new Date().toISOString();
  const [sessionResult, setsResult] = await Promise.all([
    supabaseAdmin
      .from("workout_sessions")
      .update({ session_status: "cancelled", ended_at: now, updated_at: now })
      .eq("external_session_id", active.external_session_id),
    supabaseAdmin
      .from("workout_sets")
      .update({ set_status: "cancelled", ended_at: now, updated_at: now })
      .eq("external_session_id", active.external_session_id)
      .in("set_status", ["countdown", "active", "processing_feedback"]),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (setsResult.error) throw setsResult.error;

  const commandId = await enqueueCommand({
    commandType: "cancel_session",
    sessionId: active.external_session_id,
    exercise: active.exercise,
  });

  return {
    ok: true,
    external_session_id: active.external_session_id,
    command_id: commandId,
  };
}
