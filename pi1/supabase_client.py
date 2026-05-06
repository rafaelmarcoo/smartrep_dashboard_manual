import json
import urllib.parse
import urllib.request
from datetime import datetime

from config import PI_DEVICE_ID, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL


class SupabaseClient:
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

        self.base_url = SUPABASE_URL.rstrip("/")
        self.headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _request(self, method, path, payload=None, extra_headers=None):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        headers = {**self.headers, **(extra_headers or {})}
        request = urllib.request.Request(
            f"{self.base_url}/rest/v1/{path}",
            data=data,
            headers=headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8")
            raise RuntimeError(f"Supabase {method} {path} failed: {error.code} {body}") from error

    def get_pending_command(self):
        target = urllib.parse.quote(f"eq.{PI_DEVICE_ID}", safe="=.")
        path = (
            "workout_commands"
            "?select=*"
            "&status=eq.pending"
            f"&target_device={target}"
            "&order=created_at.asc"
            "&limit=1"
        )
        rows = self._request("GET", path)
        return rows[0] if rows else None

    def mark_command_processing(self, command_id):
        now = datetime.utcnow().isoformat()
        rows = self._request(
            "PATCH",
            f"workout_commands?id=eq.{command_id}&status=eq.pending",
            {
                "status": "processing",
                "claimed_at": now,
                "updated_at": now,
            },
        )
        return bool(rows)

    def complete_command(self, command_id):
        now = datetime.utcnow().isoformat()
        self._request(
            "PATCH",
            f"workout_commands?id=eq.{command_id}",
            {
                "status": "completed",
                "completed_at": now,
                "updated_at": now,
            },
        )

    def fail_command(self, command_id, message):
        now = datetime.utcnow().isoformat()
        self._request(
            "PATCH",
            f"workout_commands?id=eq.{command_id}",
            {
                "status": "failed",
                "error_message": str(message),
                "completed_at": now,
                "updated_at": now,
            },
        )

    def update_set_status(self, external_set_id, status, started_at=None):
        payload = {
            "set_status": status,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if started_at is not None:
            payload["started_at"] = started_at

        self._request("PATCH", f"workout_sets?external_set_id=eq.{external_set_id}", payload)
