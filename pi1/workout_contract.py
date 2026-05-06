COMMAND_START_SESSION = "start_session"
COMMAND_START_SET = "start_set"
COMMAND_END_SET = "end_set"
COMMAND_END_SESSION = "end_session"
COMMAND_CANCEL_SESSION = "cancel_session"

EVENT_WORKOUT_SESSION_STARTED = "workout_session_started"
EVENT_WORKOUT_SET_COUNTDOWN_STARTED = "workout_set_countdown_started"
EVENT_WORKOUT_SET_STARTED = "workout_set_started"
EVENT_WORKOUT_SET_COMPLETED = "workout_set_completed"
EVENT_WORKOUT_SESSION_COMPLETED = "workout_session_completed"
EVENT_WORKOUT_SESSION_CANCELLED = "workout_session_cancelled"

WORKOUT_STATE_IDLE = "idle"
WORKOUT_STATE_SESSION_READY = "session_ready"
WORKOUT_STATE_COUNTDOWN = "countdown"
WORKOUT_STATE_SET_ACTIVE = "set_active"
WORKOUT_STATE_SET_REVIEW = "set_review"
WORKOUT_STATE_SESSION_COMPLETE = "session_complete"

FIELD_COMMAND = "command"
FIELD_COMMAND_SOURCE = "source"
FIELD_COUNTDOWN_SECONDS = "countdown_s"
FIELD_EXERCISE = "exercise"
FIELD_ISSUED_AT = "issued_at"
FIELD_SCHEDULED_START_TIME = "scheduled_start_time"
FIELD_SET_ID = "set_id"
FIELD_SET_NUMBER = "set_number"
FIELD_STATE = "state"

EXERCISE_BICEP_CURL = "bicep_curl"
EXERCISE_SQUAT = "squat"

SUPPORTED_EXERCISES = (
    EXERCISE_BICEP_CURL,
    EXERCISE_SQUAT,
)

DEFAULT_COUNTDOWN_SECONDS = 3
