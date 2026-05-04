import { supabasePublic } from "@/lib/supabase-public";

export type EquipmentStatus = {
  equipment_name: string;
  current_status: string;
  last_changed_at: string;
  updated_at: string;
  source_device: string;
  latest_session_id?: string | null;
};

export type CompletedSession = {
  id: string;
  equipment_name: string;
  ended_at: string | null;
  duration_seconds: string | number | null;
};

export type DashboardData = {
  completedSessions: CompletedSession[];
  equipment: EquipmentStatus[];
};

export async function getDashboardData(): Promise<DashboardData> {
  const [equipmentResult, completedSessionsResult] = await Promise.all([
    supabasePublic.from("equipment_status").select("*").order("equipment_name"),
    supabasePublic
      .from("equipment_sessions")
      .select("id, equipment_name, ended_at, duration_seconds")
      .eq("session_status", "completed")
      .order("ended_at", { ascending: false })
      .limit(10),
  ]);

  if (equipmentResult.error) {
    throw new Error(`Failed to load equipment status: ${equipmentResult.error.message}`);
  }

  if (completedSessionsResult.error) {
    throw new Error(
      `Failed to load completed sessions: ${completedSessionsResult.error.message}`
    );
  }

  return {
    equipment: (equipmentResult.data ?? []) as EquipmentStatus[],
    completedSessions: (completedSessionsResult.data ?? []) as CompletedSession[],
  };
}
