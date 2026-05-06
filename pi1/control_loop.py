import time

from config import COMMAND_POLL_SECONDS
from dashboard_api import DashboardApi
from supabase_client import SupabaseClient
from tracker import ManualWorkoutTracker


def command_payload(command):
    payload = command.get("payload")
    return payload if isinstance(payload, dict) else {}


def run_control_loop():
    supabase = SupabaseClient()
    dashboard = DashboardApi()
    tracker = ManualWorkoutTracker()
    last_poll = 0

    try:
        while True:
            keep_running = tracker.tick(status_callback=supabase.update_set_status)
            if not keep_running:
                break

            if time.time() - last_poll < COMMAND_POLL_SECONDS:
                continue

            last_poll = time.time()
            command = supabase.get_pending_command()
            if command is None:
                continue

            command_id = command["id"]
            if not supabase.mark_command_processing(command_id):
                continue

            try:
                handle_command(command, tracker, dashboard)
                supabase.complete_command(command_id)
            except Exception as error:
                print(f"Command failed: {error}")
                supabase.fail_command(command_id, error)
    finally:
        tracker.close()


def handle_command(command, tracker, dashboard):
    command_type = command["command_type"]
    payload = command_payload(command)

    if command_type == "start_session":
        tracker.start_session(
            command["external_session_id"],
            command["exercise"],
            payload.get("started_at"),
        )
        return

    if command_type == "start_set":
        tracker.start_set(command["external_set_id"], command["set_number"])
        return

    if command_type == "end_set":
        set_payload = tracker.end_set()
        dashboard.post_set_complete(set_payload)
        tracker.confirm_set_completed()
        return

    if command_type == "end_session":
        session_payload = tracker.end_session()
        dashboard.post_session_complete(session_payload)
        return

    if command_type == "cancel_session":
        tracker.cancel_session()
        return

    raise ValueError(f"Unknown command type: {command_type}")
