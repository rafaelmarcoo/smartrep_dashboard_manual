import json
import urllib.request

from config import DASHBOARD_API_BASE_URL


class DashboardApi:
    def __init__(self):
        self.base_url = DASHBOARD_API_BASE_URL.rstrip("/")

    def post_set_complete(self, payload):
        return self._post("/api/pi/workouts/set-complete", payload)

    def post_session_complete(self, payload):
        return self._post("/api/pi/workouts/session-complete", payload)

    def _post(self, path, payload):
        url = f"{self.base_url}{path}"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body else None
        except Exception as error:
            raise RuntimeError(f"Dashboard POST {url} failed: {error}") from error
