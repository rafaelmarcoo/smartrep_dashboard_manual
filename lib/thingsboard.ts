const TB_BASE_URL = process.env.TB_BASE_URL!;
const TB_API_KEY = process.env.TB_API_KEY!;
const TB_PI1_DEVICE_ID = process.env.TB_PI1_DEVICE_ID!;

const SESSION_EVENT_KEYS = [
  "event",
  "equipment",
  "session_id",
  "start_time",
  "end_time",
  "session_duration_s",
] as const;

const WORKOUT_EVENT_KEYS = [
  "event",
  "session_id",
  "exercise",
  "sets",
  "reps_per_set",
  "bad_reps",
  "form_score",
  "start_time",
  "end_time",
  "coaching_summary",
  "feedback",
] as const;

function tbHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Authorization": `ApiKey ${TB_API_KEY}`,
  };
}

export async function getLatestAvailability() {
  const keys = [
    "dumbbell_left",
    "dumbbell_right",
    "foam_roller",
    "chair",
  ].join(",");

  const url =
    `${TB_BASE_URL}/api/plugins/telemetry/DEVICE/${TB_PI1_DEVICE_ID}` +
    `/values/timeseries?keys=${encodeURIComponent(keys)}`;

  const res = await fetch(url, {
    headers: tbHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ThingsBoard latest fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function getHistoricalSessionEvents(startTs: number, endTs: number) {
  const keys = SESSION_EVENT_KEYS.join(",");

  const url =
    `${TB_BASE_URL}/api/plugins/telemetry/DEVICE/${TB_PI1_DEVICE_ID}` +
    `/values/timeseries?keys=${encodeURIComponent(keys)}` +
    `&startTs=${startTs}&endTs=${endTs}&limit=1000`;

  const res = await fetch(url, {
    headers: tbHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ThingsBoard historical fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function getHistoricalWorkoutEvents(startTs: number, endTs: number) {
  const keys = WORKOUT_EVENT_KEYS.join(",");

  const url =
    `${TB_BASE_URL}/api/plugins/telemetry/DEVICE/${TB_PI1_DEVICE_ID}` +
    `/values/timeseries?keys=${encodeURIComponent(keys)}` +
    `&startTs=${startTs}&endTs=${endTs}&limit=1000`;

  const res = await fetch(url, {
    headers: tbHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ThingsBoard workout fetch failed: ${res.status} ${text}`);
  }

  return res.json();
}

export function getPi1DeviceId() {
  return TB_PI1_DEVICE_ID;
}

export function getSessionEventKeys() {
  return [...SESSION_EVENT_KEYS];
}

export function getWorkoutEventKeys() {
  return [...WORKOUT_EVENT_KEYS];
}
