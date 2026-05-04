import { supabaseAdmin } from "./supabase-admin";
import {
  getHistoricalSessionEvents,
  getLatestAvailability,
  getPi1DeviceId,
} from "./thingsboard";

type TbValue = { ts: number; value: string };
type TbLatestResponse = Record<string, TbValue[] | undefined>;

const EQUIPMENT_KEYS = ["dumbbell_left", "dumbbell_right", "foam_roller", "chair"];

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

async function upsertEquipmentStatus(latest: TbLatestResponse) {
  const rows = EQUIPMENT_KEYS
    .map((equipment_name) => {
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
    .filter(Boolean);

  if (rows.length === 0) return;

  const { error } = await supabaseAdmin
    .from("equipment_status")
    .upsert(rows, { onConflict: "equipment_name" });

  if (error) throw error;
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

  await supabaseAdmin.from("raw_telemetry_log").insert({
    source_device: "SmartRep-Pi1-Sensor",
    tb_entity_id: getPi1DeviceId(),
    ts_ms: ts,
    payload: rawPayload,
  });

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

    const { error: statusError } = await supabaseAdmin
      .from("equipment_status")
      .upsert(
        {
          equipment_name: equipment,
          current_status: "occupied",
          latest_session_id: sessionId,
          last_changed_at: startedAt,
          updated_at: new Date().toISOString(),
          source_device: "SmartRep-Pi1-Sensor",
        },
        { onConflict: "equipment_name" }
      );

    if (statusError) throw statusError;
  }

  if (event === "session_end") {
    const endedAt = values.end_time ?? new Date(ts).toISOString();
    const startedAt = values.start_time ?? null;
    const durationSeconds = values.session_duration_s
      ? Number(values.session_duration_s)
      : null;

    const { error } = await supabaseAdmin
      .from("equipment_sessions")
      .update({
        ended_at: endedAt,
        started_at: startedAt,
        duration_seconds: durationSeconds,
        session_status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("external_session_id", sessionId);

    if (error) throw error;

    const { error: statusError } = await supabaseAdmin
      .from("equipment_status")
      .upsert(
        {
          equipment_name: equipment,
          current_status: "available",
          latest_session_id: sessionId,
          last_changed_at: endedAt,
          updated_at: new Date().toISOString(),
          source_device: "SmartRep-Pi1-Sensor",
        },
        { onConflict: "equipment_name" }
      );

    if (statusError) throw statusError;
  }
}

export async function runAvailabilitySync() {
  const now = Date.now();

  const { data: syncRow, error: syncReadError } = await supabaseAdmin
    .from("sync_state")
    .select("last_ts_ms")
    .eq("sync_name", "availability_pi1")
    .single();

  if (syncReadError) throw syncReadError;

  const lastTs = syncRow?.last_ts_ms ?? 0;

  const latest = await getLatestAvailability();
  await upsertEquipmentStatus(latest);

  const historical = await getHistoricalSessionEvents(lastTs, now);
  const groupedEvents = groupTelemetryByTimestamp(historical);

  for (const row of groupedEvents) {
    await applySessionEvent(row.ts, row.values);
  }

  const { error: syncWriteError } = await supabaseAdmin
    .from("sync_state")
    .update({
      last_ts_ms: now,
      updated_at: new Date().toISOString(),
    })
    .eq("sync_name", "availability_pi1");

  if (syncWriteError) throw syncWriteError;

  return {
    ok: true,
    synced_until: now,
    event_count: groupedEvents.length,
  };
}