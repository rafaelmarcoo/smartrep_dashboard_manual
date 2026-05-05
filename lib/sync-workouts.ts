import { supabaseAdmin } from "./supabase-admin";
import {
  getHistoricalWorkoutEvents,
  getPi1DeviceId,
  getWorkoutEventKeys,
} from "./thingsboard";

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

function normalizeRepsPerSet(value?: string) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    const parsed = parseInteger(value);
    return parsed ?? value;
  }
}

function isWorkoutSummary(values: Record<string, string>) {
  const exercise = values.exercise;
  const sessionId = values.session_id;
  const event = values.event;

  const looksLikeWorkoutEvent =
    event === "session_complete" || event === "workout_session_complete";

  return Boolean(exercise && sessionId && (looksLikeWorkoutEvent || values.end_time));
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

async function applyWorkoutEvent(ts: number, values: Record<string, string>) {
  if (!isWorkoutSummary(values)) return false;

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
