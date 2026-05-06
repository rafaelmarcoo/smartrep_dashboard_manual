import copy
import threading
import uuid
from datetime import datetime, timedelta

from config import END_TIME, EVENT, SESSION_ID, START_TIME
from mqtt_client import publish
from workout_contract import (
    COMMAND_CANCEL_SESSION,
    COMMAND_END_SESSION,
    COMMAND_END_SET,
    COMMAND_START_SESSION,
    COMMAND_START_SET,
    DEFAULT_COUNTDOWN_SECONDS,
    EVENT_WORKOUT_SESSION_CANCELLED,
    EVENT_WORKOUT_SESSION_COMPLETED,
    EVENT_WORKOUT_SESSION_STARTED,
    EVENT_WORKOUT_SET_COMPLETED,
    EVENT_WORKOUT_SET_COUNTDOWN_STARTED,
    EVENT_WORKOUT_SET_STARTED,
    FIELD_COMMAND_SOURCE,
    FIELD_COUNTDOWN_SECONDS,
    FIELD_EXERCISE,
    FIELD_ISSUED_AT,
    FIELD_SCHEDULED_START_TIME,
    FIELD_SET_ID,
    FIELD_SET_NUMBER,
    FIELD_STATE,
    SUPPORTED_EXERCISES,
    WORKOUT_STATE_COUNTDOWN,
    WORKOUT_STATE_IDLE,
    WORKOUT_STATE_SESSION_COMPLETE,
    WORKOUT_STATE_SESSION_READY,
    WORKOUT_STATE_SET_ACTIVE,
    WORKOUT_STATE_SET_REVIEW,
)

log_lock = threading.Lock()


class SessionManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._state = WORKOUT_STATE_IDLE
        self._active_session = None
        self._current_set = None
        self._completed_sets = []
        self._pending_end_set = False
        self._pending_end_session = False

    def handle_command(self, command, params):
        params = params or {}
        payload = None

        with self._lock:
            if command == COMMAND_START_SESSION:
                response, payload = self._start_session_locked(params)
            elif command == COMMAND_START_SET:
                response, payload = self._start_set_locked(params)
            elif command == COMMAND_END_SET:
                response = self._request_end_set_locked(params)
            elif command == COMMAND_END_SESSION:
                response = self._request_end_session_locked(params)
            elif command == COMMAND_CANCEL_SESSION:
                response, payload = self._cancel_session_locked(params)
            else:
                response = self._build_response(False, f"Unsupported command: {command}")

        if payload is not None:
            publish(payload)

        if command:
            log("GYM SESSION", f"COMMAND {command}: {response['message']}")

        return response

    def activate_ready_set_if_due(self):
        payload = None

        with self._lock:
            if (
                self._state == WORKOUT_STATE_COUNTDOWN
                and self._current_set is not None
                and self._current_set["scheduled_start_time"] <= datetime.utcnow()
            ):
                self._state = WORKOUT_STATE_SET_ACTIVE
                self._current_set["started_at"] = self._current_set["scheduled_start_time"]
                payload = self._build_set_started_payload_locked()

        if payload is not None:
            publish(payload)
            log(
                "GYM SESSION",
                f"SET {payload[FIELD_SET_NUMBER]} STARTED ({payload[FIELD_EXERCISE]})",
            )

    def get_workout_snapshot(self):
        with self._lock:
            if self._active_session is None:
                return None

            return {
                "state": self._state,
                "session_id": self._active_session[SESSION_ID],
                "exercise": self._active_session[FIELD_EXERCISE],
                "session_start_time": self._active_session[START_TIME],
                "current_set_number": self._current_set[FIELD_SET_NUMBER]
                if self._current_set
                else None,
                "current_set_started_at": self._current_set.get("started_at")
                if self._current_set
                else None,
                "countdown_started_at": self._current_set.get("countdown_started_at")
                if self._current_set
                else None,
                "countdown_seconds": self._current_set.get(FIELD_COUNTDOWN_SECONDS)
                if self._current_set
                else None,
                "end_set_requested": self._pending_end_set,
                "end_session_requested": self._pending_end_session,
                "completed_sets": copy.deepcopy(self._completed_sets),
            }

    def should_finalize_session(self):
        with self._lock:
            return (
                self._active_session is not None
                and self._pending_end_session
                and self._state != WORKOUT_STATE_SET_ACTIVE
            )

    def complete_active_set(self, set_summary):
        with self._lock:
            if self._active_session is None or self._state != WORKOUT_STATE_SET_ACTIVE:
                return False

            stored_summary = dict(set_summary)
            stored_summary[FIELD_SET_ID] = self._build_set_id_locked(stored_summary[FIELD_SET_NUMBER])
            self._completed_sets.append(stored_summary)
            self._current_set = None
            self._pending_end_set = False
            self._state = WORKOUT_STATE_SET_REVIEW
            payload = self._build_set_completed_payload_locked(stored_summary)

        publish(payload)
        log(
            "GYM SESSION",
            f"SET {payload[FIELD_SET_NUMBER]} COMPLETED ({payload['reps']} reps)",
        )
        return True

    def complete_session(self, final_summary):
        with self._lock:
            if self._active_session is None or not self._pending_end_session:
                return False

            payload = self._build_session_completed_payload_locked(final_summary)
            self._reset_locked()

        publish(payload)
        log(
            "GYM SESSION",
            f"SESSION COMPLETED ({payload[FIELD_EXERCISE]}, {payload['sets']} sets)",
        )
        return True

    def _start_session_locked(self, params):
        if self._active_session is not None:
            return self._build_response(False, "A workout session is already active"), None

        exercise = params.get(FIELD_EXERCISE)
        if exercise not in SUPPORTED_EXERCISES:
            return self._build_response(False, f"Unsupported exercise: {exercise}"), None

        session_id = params.get(SESSION_ID) or str(uuid.uuid4())
        started_at = datetime.utcnow()

        self._active_session = {
            SESSION_ID: session_id,
            FIELD_EXERCISE: exercise,
            START_TIME: started_at,
        }
        self._current_set = None
        self._completed_sets = []
        self._pending_end_set = False
        self._pending_end_session = False
        self._state = WORKOUT_STATE_SESSION_READY

        payload = {
            EVENT: EVENT_WORKOUT_SESSION_STARTED,
            SESSION_ID: session_id,
            FIELD_EXERCISE: exercise,
            START_TIME: started_at.isoformat(),
            FIELD_STATE: self._state,
            FIELD_ISSUED_AT: params.get(FIELD_ISSUED_AT, started_at.isoformat()),
            FIELD_COMMAND_SOURCE: params.get(FIELD_COMMAND_SOURCE, "dashboard"),
        }

        return self._build_response(True, "Workout session started", session_id=session_id), payload

    def _start_set_locked(self, params):
        if self._active_session is None:
            return self._build_response(False, "No active workout session"), None

        if self._state not in (WORKOUT_STATE_SESSION_READY, WORKOUT_STATE_SET_REVIEW):
            return self._build_response(False, f"Cannot start a set while in {self._state}"), None

        if params.get(SESSION_ID) != self._active_session[SESSION_ID]:
            return self._build_response(False, "Session id mismatch"), None

        countdown_seconds = int(params.get(FIELD_COUNTDOWN_SECONDS, DEFAULT_COUNTDOWN_SECONDS))
        set_number = len(self._completed_sets) + 1
        countdown_started_at = datetime.utcnow()
        scheduled_start_time = countdown_started_at + timedelta(seconds=countdown_seconds)

        self._current_set = {
            FIELD_SET_NUMBER: set_number,
            FIELD_COUNTDOWN_SECONDS: countdown_seconds,
            "countdown_started_at": countdown_started_at,
            "scheduled_start_time": scheduled_start_time,
        }
        self._pending_end_set = False
        self._state = WORKOUT_STATE_COUNTDOWN

        payload = {
            EVENT: EVENT_WORKOUT_SET_COUNTDOWN_STARTED,
            SESSION_ID: self._active_session[SESSION_ID],
            FIELD_EXERCISE: self._active_session[FIELD_EXERCISE],
            FIELD_SET_ID: self._build_set_id_locked(set_number),
            FIELD_SET_NUMBER: set_number,
            FIELD_COUNTDOWN_SECONDS: countdown_seconds,
            START_TIME: countdown_started_at.isoformat(),
            FIELD_SCHEDULED_START_TIME: scheduled_start_time.isoformat(),
            FIELD_STATE: self._state,
            FIELD_ISSUED_AT: params.get(FIELD_ISSUED_AT, countdown_started_at.isoformat()),
        }

        return self._build_response(True, f"Set {set_number} countdown started"), payload

    def _request_end_set_locked(self, params):
        if self._active_session is None:
            return self._build_response(False, "No active workout session")

        if params.get(SESSION_ID) != self._active_session[SESSION_ID]:
            return self._build_response(False, "Session id mismatch")

        if self._state != WORKOUT_STATE_SET_ACTIVE:
            return self._build_response(False, f"Cannot end set while in {self._state}")

        self._pending_end_set = True
        return self._build_response(True, "Active set marked for completion")

    def _request_end_session_locked(self, params):
        if self._active_session is None:
            return self._build_response(False, "No active workout session")

        if params.get(SESSION_ID) != self._active_session[SESSION_ID]:
            return self._build_response(False, "Session id mismatch")

        if self._state == WORKOUT_STATE_COUNTDOWN:
            self._current_set = None
            self._state = (
                WORKOUT_STATE_SET_REVIEW if self._completed_sets else WORKOUT_STATE_SESSION_READY
            )

        if self._state == WORKOUT_STATE_SET_ACTIVE:
            self._pending_end_set = True

        self._pending_end_session = True
        return self._build_response(True, "Workout session marked for completion")

    def _cancel_session_locked(self, params):
        if self._active_session is None:
            return self._build_response(False, "No active workout session"), None

        if params.get(SESSION_ID) != self._active_session[SESSION_ID]:
            return self._build_response(False, "Session id mismatch"), None

        payload = {
            EVENT: EVENT_WORKOUT_SESSION_CANCELLED,
            SESSION_ID: self._active_session[SESSION_ID],
            FIELD_EXERCISE: self._active_session[FIELD_EXERCISE],
            START_TIME: self._active_session[START_TIME].isoformat(),
            END_TIME: datetime.utcnow().isoformat(),
            FIELD_STATE: WORKOUT_STATE_IDLE,
            FIELD_ISSUED_AT: params.get(FIELD_ISSUED_AT, datetime.utcnow().isoformat()),
        }
        self._reset_locked()
        return self._build_response(True, "Workout session cancelled"), payload

    def _build_set_started_payload_locked(self):
        return {
            EVENT: EVENT_WORKOUT_SET_STARTED,
            SESSION_ID: self._active_session[SESSION_ID],
            FIELD_EXERCISE: self._active_session[FIELD_EXERCISE],
            FIELD_SET_ID: self._build_set_id_locked(self._current_set[FIELD_SET_NUMBER]),
            FIELD_SET_NUMBER: self._current_set[FIELD_SET_NUMBER],
            START_TIME: self._current_set["started_at"].isoformat(),
            FIELD_STATE: self._state,
        }

    def _build_set_completed_payload_locked(self, set_summary):
        return {
            EVENT: EVENT_WORKOUT_SET_COMPLETED,
            SESSION_ID: self._active_session[SESSION_ID],
            FIELD_EXERCISE: self._active_session[FIELD_EXERCISE],
            FIELD_SET_ID: set_summary[FIELD_SET_ID],
            FIELD_SET_NUMBER: set_summary[FIELD_SET_NUMBER],
            "reps": set_summary["reps"],
            "bad_reps": set_summary["bad_reps"],
            "form_score": set_summary["form_score"],
            "angle_data": set_summary["angle_data"],
            "coaching_summary": set_summary["coaching_summary"],
            START_TIME: set_summary[START_TIME],
            END_TIME: set_summary[END_TIME],
            FIELD_STATE: self._state,
        }

    def _build_session_completed_payload_locked(self, final_summary):
        return {
            EVENT: EVENT_WORKOUT_SESSION_COMPLETED,
            SESSION_ID: self._active_session[SESSION_ID],
            FIELD_EXERCISE: self._active_session[FIELD_EXERCISE],
            "sets": final_summary["sets"],
            "reps_per_set": final_summary["reps_per_set"],
            "bad_reps": final_summary["bad_reps"],
            "form_score": final_summary["form_score"],
            "coaching_summary": final_summary["coaching_summary"],
            START_TIME: self._active_session[START_TIME].isoformat(),
            END_TIME: final_summary[END_TIME],
            FIELD_STATE: WORKOUT_STATE_SESSION_COMPLETE,
        }

    def _build_set_id_locked(self, set_number):
        return f"{self._active_session[SESSION_ID]}-set-{set_number}"

    def _build_response(self, ok, message, **extra):
        payload = {"ok": ok, "message": message}
        payload.update(extra)
        return payload

    def _reset_locked(self):
        self._state = WORKOUT_STATE_IDLE
        self._active_session = None
        self._current_set = None
        self._completed_sets = []
        self._pending_end_set = False
        self._pending_end_session = False


def log(source, message):
    with log_lock:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{source}] {message}")
