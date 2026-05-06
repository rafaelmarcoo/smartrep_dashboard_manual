export const WORKOUT_COMMANDS = {
  startSession: "start_session",
  startSet: "start_set",
  endSet: "end_set",
  endSession: "end_session",
  cancelSession: "cancel_session",
} as const;

export const WORKOUT_EVENTS = {
  sessionStarted: "workout_session_started",
  setCountdownStarted: "workout_set_countdown_started",
  setStarted: "workout_set_started",
  setCompleted: "workout_set_completed",
  sessionCompleted: "workout_session_completed",
  sessionCancelled: "workout_session_cancelled",
} as const;

export const WORKOUT_STATES = {
  idle: "idle",
  sessionReady: "session_ready",
  countdown: "countdown",
  setActive: "set_active",
  setReview: "set_review",
  sessionComplete: "session_complete",
} as const;

export const WORKOUT_EXERCISES = {
  bicepCurl: "bicep_curl",
  squat: "squat",
} as const;

export const SUPPORTED_WORKOUT_EXERCISES = [
  WORKOUT_EXERCISES.bicepCurl,
  WORKOUT_EXERCISES.squat,
] as const;

export const DEFAULT_COUNTDOWN_SECONDS = 3;

export type WorkoutCommand =
  (typeof WORKOUT_COMMANDS)[keyof typeof WORKOUT_COMMANDS];
export type WorkoutEvent = (typeof WORKOUT_EVENTS)[keyof typeof WORKOUT_EVENTS];
export type WorkoutState = (typeof WORKOUT_STATES)[keyof typeof WORKOUT_STATES];
export type WorkoutExercise =
  (typeof SUPPORTED_WORKOUT_EXERCISES)[number];

export type StartSessionCommand = {
  command: typeof WORKOUT_COMMANDS.startSession;
  session_id: string;
  exercise: WorkoutExercise;
  issued_at: string;
  source: string;
};

export type StartSetCommand = {
  command: typeof WORKOUT_COMMANDS.startSet;
  session_id: string;
  set_number: number;
  countdown_s: number;
  issued_at: string;
};

export type EndSetCommand = {
  command: typeof WORKOUT_COMMANDS.endSet;
  session_id: string;
  issued_at: string;
};

export type EndSessionCommand = {
  command: typeof WORKOUT_COMMANDS.endSession;
  session_id: string;
  issued_at: string;
};

export type CancelSessionCommand = {
  command: typeof WORKOUT_COMMANDS.cancelSession;
  session_id: string;
  issued_at: string;
};

export type WorkoutCommandPayload =
  | StartSessionCommand
  | StartSetCommand
  | EndSetCommand
  | EndSessionCommand
  | CancelSessionCommand;
