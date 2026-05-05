import { supabaseAdmin } from "./supabase-admin";
import {
  getHistoricalSessionEvents,
  getLatestAvailability,
  getPi1DeviceId,
  getSessionEventKeys,
} from "./thingsboard";

type TbValue = { ts: number; value: string };
type TbLatestResponse = Record<string, TbValue[] | undefined>;
type TelemetryGroup = { ts: number; values: Record<string, string> };
type SyncStateRow = { last_ts_ms: number };
type EquipmentStatusRow = {
  equipment_name: string;
  current_status: string;
  last_changed_at: string;
  updated_at: string;
  source_device: string;
};

const SESSION_HISTORY_LIMIT = 1000;

const EQUIPMENT_KEYS = ["dumbbell_left", "dumbbell_right", "foam_roller", "chair"];
const SHARED_DUMBBELL_SESSION = "dumbbell_pair";
const SHARED_DUMBBELL_MEMBERS = ["dumbbell_left", "dumbbell_right"] as const;

function latestValue(values?: TbValue[]) {
  if (!values || values.length === 0) return null;
  return values[0];
}

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

function isEquipmentStatusRow(
  row: EquipmentStatusRow | null
): row is EquipmentStatusRow {
  return row !== null;
}

function hasMoreHistoricalData(payload: Record<string, TbValue[] | undefined>) {
  return getSessionEventKeys().some((key) => {
    const values = payload[key];
    return Array.isArray(values) && values.length >= SESSION_HISTORY_LIMIT;
  });
}

async function fetchHistoricalSessionEvents(startTs: number, endTs: number) {
  const allEvents: TelemetryGroup[] = [];
  let cursor = startTs;

  while (cursor <= endTs) {
    const historical = (await getHistoricalSessionEvents(
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

    // Advance by 1 ms so we continue from the next batch without duplicating rows.
    cursor = latestTimestamp + 1;
  }

  return allEvents;
}

async function upsertEquipmentStatus(latest: TbLatestResponse) {
  const rows = EQUIPMENT_KEYS
    .map<EquipmentStatusRow | null>((equipment_name) => {
      const item = latestValue(latest[equipment_name]);
      if (!item) return null;

      return {
        equipment_name,
        current_status: item.value,
        last_changed_at: new Date(item.ts).toISOString(),
        updated_at: new Date().toISOString(),
        source_device: "SmartRep-Pi1-Sensor",
      };
    })
    .filter(isEquipmentStatusRow);

  if (rows.length === 0) return;

  const { error } = await supabaseAdmin
    .from("equipment_status")
    .upsert(rows, { onConflict: "equipment_name" });

  if (error) throw error;
}

async function upsertEquipmentAvailabilityStatus(
  equipment: string,
  currentStatus: "occupied" | "available",
  sessionId: string,
  changedAt: string
) {
  const { error: statusError } = await supabaseAdmin
    .from("equipment_status")
    .upsert(
      {
        equipment_name: equipment,
        current_status: currentStatus,
        latest_session_id: sessionId,
        last_changed_at: changedAt,
        updated_at: new Date().toISOString(),
        source_device: "SmartRep-Pi1-Sensor",
      },
      { onConflict: "equipment_name" }
    );

  if (statusError) throw statusError;
}

async function upsertSharedDumbbellAvailabilityStatus(
  currentStatus: "occupied" | "available",
  sessionId: string,
  changedAt: string
) {
  // The Pi now emits one shared workout session for both dumbbells,
  // so we stamp the same session id onto the left/right status rows.
  await Promise.all(
    SHARED_DUMBBELL_MEMBERS.map((equipment) =>
      upsertEquipmentAvailabilityStatus(equipment, currentStatus, sessionId, changedAt)
    )
  );
}

async function applySessionEvent(ts: number, values: Record<string, string>) {
  const event = values.event;
  const equipment = values.equipment;
  const sessionId = values.session_id;

  if (!event || !equipment || !sessionId) return;

  const rawPayload = {
    ...values,
    _ts_iso: new Date(ts).toISOString(),
  };

  const { error: rawInsertError } = await supabaseAdmin.from("raw_telemetry_log").insert({
    source_device: "SmartRep-Pi1-Sensor",
    tb_entity_id: getPi1DeviceId(),
    ts_ms: ts,
    payload: rawPayload,
  });

  if (rawInsertError) throw rawInsertError;

  if (event === "session_start") {
    const startedAt = values.start_time ?? new Date(ts).toISOString();

    const { error } = await supabaseAdmin
      .from("equipment_sessions")
      .upsert(
        {
          external_session_id: sessionId,
          equipment_name: equipment,
          started_at: startedAt,
          session_status: "active",
          source_device: "SmartRep-Pi1-Sensor",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "external_session_id" }
      );

    if (error) throw error;
    if (equipment === SHARED_DUMBBELL_SESSION) {
      await upsertSharedDumbbellAvailabilityStatus("occupied", sessionId, startedAt);
    } else {
      await upsertEquipmentAvailabilityStatus(
        equipment,
        "occupied",
        sessionId,
        startedAt
      );
    }
  }

  if (event === "session_end") {
    const endedAt = values.end_time ?? new Date(ts).toISOString();
    const startedAt = values.start_time ?? null;
    const durationSeconds = values.session_duration_s
      ? Number(values.session_duration_s)
      : null;

    const { data: updatedRows, error } = await supabaseAdmin
      .from("equipment_sessions")
      .update({
        ended_at: endedAt,
        started_at: startedAt,
        duration_seconds: durationSeconds,
        session_status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("external_session_id", sessionId)
      .select("external_session_id");

    if (error) throw error;

    if (!updatedRows || updatedRows.length === 0) {
      const { error: upsertError } = await supabaseAdmin
        .from("equipment_sessions")
        .upsert(
          {
            external_session_id: sessionId,
            equipment_name: equipment,
            started_at: startedAt,
            ended_at: endedAt,
            duration_seconds: durationSeconds,
            session_status: "completed",
            source_device: "SmartRep-Pi1-Sensor",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "external_session_id" }
        );

      if (upsertError) throw upsertError;
    }

    if (equipment === SHARED_DUMBBELL_SESSION) {
      await upsertSharedDumbbellAvailabilityStatus("available", sessionId, endedAt);
    } else {
      await upsertEquipmentAvailabilityStatus(
        equipment,
        "available",
        sessionId,
        endedAt
      );
    }
  }
}

async function updateSyncState(lastTsMs: number) {
  const { error: syncWriteError } = await supabaseAdmin
    .from("sync_state")
    .update({
      last_ts_ms: lastTsMs,
      updated_at: new Date().toISOString(),
    })
    .eq("sync_name", "availability_pi1");

  if (syncWriteError) throw syncWriteError;
}

export async function runAvailabilitySync() {
  const now = Date.now();

  const { data: syncRow, error: syncReadError } = await supabaseAdmin
    .from("sync_state")
    .select("last_ts_ms")
    .eq("sync_name", "availability_pi1")
    .single<SyncStateRow>();

  if (syncReadError) throw syncReadError;

  const lastTs = syncRow?.last_ts_ms ?? 0;

  const latest = await getLatestAvailability();
  await upsertEquipmentStatus(latest);

  const groupedEvents = await fetchHistoricalSessionEvents(lastTs, now);

  for (const row of groupedEvents) {
    await applySessionEvent(row.ts, row.values);
  }

  const latestProcessedTs = getLatestProcessedTimestamp(groupedEvents);
  await updateSyncState(latestProcessedTs ?? now);

  return {
    ok: true,
    synced_until: latestProcessedTs ?? now,
    event_count: groupedEvents.length,
  };
}
