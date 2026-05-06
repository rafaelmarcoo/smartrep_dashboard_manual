import {
  DEFAULT_COUNTDOWN_SECONDS,
  SUPPORTED_WORKOUT_EXERCISES,
  WORKOUT_COMMANDS,
  type WorkoutExercise,
} from "@/lib/workout-contract";
import { sendWorkoutRpcCommand } from "@/lib/thingsboard";

function isoNow() {
  return new Date().toISOString();
}

export function isSupportedWorkoutExercise(value: string): value is WorkoutExercise {
  return (SUPPORTED_WORKOUT_EXERCISES as readonly string[]).includes(value);
}

export async function startWorkoutSession(exercise: WorkoutExercise) {
  const sessionId = crypto.randomUUID();
  const payload = {
    command: WORKOUT_COMMANDS.startSession,
    session_id: sessionId,
    exercise,
    issued_at: isoNow(),
    source: "dashboard",
  } as const;

  await sendWorkoutRpcCommand(WORKOUT_COMMANDS.startSession, payload);
  return payload;
}

export async function startWorkoutSet(
  sessionId: string,
  setNumber: number,
  countdownSeconds = DEFAULT_COUNTDOWN_SECONDS
) {
  const payload = {
    command: WORKOUT_COMMANDS.startSet,
    session_id: sessionId,
    set_number: setNumber,
    countdown_s: countdownSeconds,
    issued_at: isoNow(),
  } as const;

  await sendWorkoutRpcCommand(WORKOUT_COMMANDS.startSet, payload);
  return payload;
}

export async function endWorkoutSet(sessionId: string) {
  const payload = {
    command: WORKOUT_COMMANDS.endSet,
    session_id: sessionId,
    issued_at: isoNow(),
  } as const;

  await sendWorkoutRpcCommand(WORKOUT_COMMANDS.endSet, payload);
  return payload;
}

export async function endWorkoutSession(sessionId: string) {
  const payload = {
    command: WORKOUT_COMMANDS.endSession,
    session_id: sessionId,
    issued_at: isoNow(),
  } as const;

  await sendWorkoutRpcCommand(WORKOUT_COMMANDS.endSession, payload);
  return payload;
}
