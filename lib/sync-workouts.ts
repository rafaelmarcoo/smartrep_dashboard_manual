import { supabaseAdmin } from "./supabase-admin";
import {
  getHistoricalWorkoutEvents,
  getPi1DeviceId,
  getWorkoutEventKeys,
  isTrackedWorkoutEvent,
} from "./thingsboard";
import { WORKOUT_EVENTS } from "./workout-contract";

type TbValue = { ts: number; value: string };
type TelemetryGroup = { ts: number; values: Record<string, string> };
type SyncStateRow = { last_ts_ms: number };

const WORKOUT_HISTORY_LIMIT = 1000;
const WORKOUT_SYNC_NAME = "workout_sessions_pi1";

function groupTelemetryByTimestamp(payload: Record<string, TbValue[] | undefined>) {
  const grouped = new Map<number, Record<string, string>>();

  for (const [key, values] of Object.entries(payload)) {
    if (!values) continue;

    for (const item of values) {
      if (!grouped.has(item.ts)) grouped.set(item.ts, {});
      grouped.get(item.ts)![key] = item.value;
    }
  }

  return Array.from(grouped.entries())
    .map(([ts, values]) => ({ ts, values }))
    .sort((a, b) => a.ts - b.ts);
}

function getLatestProcessedTimestamp(groupedEvents: TelemetryGroup[]) {
  if (groupedEvents.length === 0) return null;
  return groupedEvents[groupedEvents.length - 1]?.ts ?? null;
}

function hasMoreHistoricalData(payload: Record<string, TbValue[] | undefined>) {
  return getWorkoutEventKeys().some((key) => {
    const values = payload[key];
    return Array.isArray(values) && values.length >= WORKOUT_HISTORY_LIMIT;
  });
}

function parseInteger(value?: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNumeric(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseJsonValue(value?: string) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeRepsPerSet(value?: string) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    const parsed = parseInteger(value);
    return parsed ?? value;
  }
}

function isRelevantWorkoutEvent(values: Record<string, string>) {
  return isTrackedWorkoutEvent(values.event) && Boolean(values.session_id);
}

async function fetchHistoricalWorkoutEvents(startTs: number, endTs: number) {
  const allEvents: TelemetryGroup[] = [];
  let cursor = startTs;

  while (cursor <= endTs) {
    const historical = (await getHistoricalWorkoutEvents(
      cursor,
      endTs
    )) as Record<string, TbValue[] | undefined>;

    const groupedEvents = groupTelemetryByTimestamp(historical);

    if (groupedEvents.length === 0) {
      return allEvents;
    }

    allEvents.push(...groupedEvents);

    const latestTimestamp = getLatestProcessedTimestamp(groupedEvents);

    if (latestTimestamp === null || !hasMoreHistoricalData(historical)) {
      return allEvents;
    }

    cursor = latestTimestamp + 1;
  }

  return allEvents;
}

async function updateSyncState(lastTsMs: number) {
  const { error: syncWriteError } = await supabaseAdmin
    .from("sync_state")
    .upsert(
      {
        sync_name: WORKOUT_SYNC_NAME,
        last_ts_ms: lastTsMs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sync_name" }
    );

  if (syncWriteError) throw syncWriteError;
}

async function insertRawWorkoutEvent(ts: number, values: Record<string, string>) {
  const rawPayload = {
    ...values,
    _ts_iso: new Date(ts).toISOString(),
  };

  const { error: rawInsertError } = await supabaseAdmin.from("raw_telemetry_log").insert({
    source_device: "SmartRep-Pi1-Camera",
    tb_entity_id: getPi1DeviceId(),
    ts_ms: ts,
    payload: rawPayload,
  });

  if (rawInsertError) throw rawInsertError;
}

async function applyWorkoutEvent(ts: number, values: Record<string, string>) {
  if (!isRelevantWorkoutEvent(values)) return false;

  await insertRawWorkoutEvent(ts, values);

  if (values.event === WORKOUT_EVENTS.setCompleted) {
    const { error } = await supabaseAdmin.from("workout_sets").upsert(
      {
        external_set_id: values.set_id,
        external_session_id: values.session_id,
        set_number: parseInteger(values.set_number),
        exercise: values.exercise,
        reps: parseInteger(values.reps),
        bad_reps: parseInteger(values.bad_reps),
        form_score: parseNumeric(values.form_score),
        angle_data: parseJsonValue(values.angle_data),
        coaching_summary: values.coaching_summary ?? values.feedback ?? null,
        started_at: values.start_time ?? null,
        ended_at: values.end_time ?? new Date(ts).toISOString(),
        source_device: "SmartRep-Pi1-Camera",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_set_id" }
    );

    if (error) throw error;
  }

  if (values.event === WORKOUT_EVENTS.sessionCompleted) {
    const { error } = await supabaseAdmin.from("workout_sessions").upsert(
      {
        external_session_id: values.session_id,
        exercise: values.exercise,
        sets: parseInteger(values.sets),
        reps_per_set: normalizeRepsPerSet(values.reps_per_set),
        bad_reps: parseInteger(values.bad_reps),
        form_score: parseNumeric(values.form_score),
        coaching_summary: values.coaching_summary ?? values.feedback ?? null,
        started_at: values.start_time ?? null,
        ended_at: values.end_time ?? new Date(ts).toISOString(),
        source_device: "SmartRep-Pi1-Camera",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_session_id" }
    );

    if (error) throw error;
  }

  return true;
}

export async function runWorkoutSync() {
  const now = Date.now();

  const { data: syncRow, error: syncReadError } = await supabaseAdmin
    .from("sync_state")
    .select("last_ts_ms")
    .eq("sync_name", WORKOUT_SYNC_NAME)
    .maybeSingle<SyncStateRow>();

  if (syncReadError) throw syncReadError;

  const lastTs = syncRow?.last_ts_ms ?? 0;
  const groupedEvents = await fetchHistoricalWorkoutEvents(lastTs, now);

  let importedCount = 0;

  for (const row of groupedEvents) {
    const inserted = await applyWorkoutEvent(row.ts, row.values);
    if (inserted) importedCount += 1;
  }

  const latestProcessedTs = getLatestProcessedTimestamp(groupedEvents);
  await updateSyncState(latestProcessedTs ?? now);

  return {
    ok: true,
    imported_count: importedCount,
    scanned_event_count: groupedEvents.length,
    synced_until: latestProcessedTs ?? now,
  };
}
