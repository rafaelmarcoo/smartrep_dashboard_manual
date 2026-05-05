import threading
import uuid
from datetime import datetime

from config import (
    DUMBBELL_LEFT,
    DUMBBELL_PAIR,
    DUMBBELL_RIGHT,
    END_TIME,
    EQUIPMENT_NAME,
    EVENT,
    SESSION_DURATION,
    SESSION_ID,
    START_TIME,
)
from mqtt_client import publish

log_lock = threading.Lock()


class SessionManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._active_session = None

    def update_pair_session(self, equipment_states):
        left_available = equipment_states[DUMBBELL_LEFT]
        right_available = equipment_states[DUMBBELL_RIGHT]

        # We treat the workout as one shared dumbbell session.
        # A session starts only when both dumbbells are off the rack
        # and ends only when both are back on their sensors.
        both_lifted = (not left_available) and (not right_available)
        both_returned = left_available and right_available

        with self._lock:
            if self._active_session is None and both_lifted:
                session_id = str(uuid.uuid4())
                start_time = datetime.utcnow()

                self._active_session = {
                    SESSION_ID: session_id,
                    START_TIME: start_time,
                }

                publish(
                    {
                        EVENT: "session_start",
                        EQUIPMENT_NAME: DUMBBELL_PAIR,
                        SESSION_ID: session_id,
                        START_TIME: start_time.isoformat(),
                    }
                )

                log("GYM SESSION", f"{DUMBBELL_PAIR} -> SESSION START")

            elif self._active_session is not None and both_returned:
                session = self._active_session
                end_time = datetime.utcnow()
                start_time = session[START_TIME]
                duration = (end_time - start_time).total_seconds()

                publish(
                    {
                        EVENT: "session_end",
                        EQUIPMENT_NAME: DUMBBELL_PAIR,
                        SESSION_ID: session[SESSION_ID],
                        START_TIME: start_time.isoformat(),
                        END_TIME: end_time.isoformat(),
                        SESSION_DURATION: duration,
                    }
                )

                log(
                    "GYM SESSION",
                    f"{DUMBBELL_PAIR} -> SESSION END ({duration:.1f}s)",
                )

                self._active_session = None

    def get_active_session(self):
        with self._lock:
            if self._active_session is None:
                return None

            return {
                SESSION_ID: self._active_session[SESSION_ID],
                START_TIME: self._active_session[START_TIME],
            }


def log(source, message):
    with log_lock:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{source}] {message}")
