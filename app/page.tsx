import { supabasePublic } from "@/lib/supabase-public";

async function getData() {
  const [{ data: equipment }, { data: activeSessions }, { data: completedSessions }] =
    await Promise.all([
      supabasePublic
        .from("equipment_status")
        .select("*")
        .order("equipment_name"),
      supabasePublic
        .from("equipment_sessions")
        .select("*")
        .eq("session_status", "active")
        .order("started_at", { ascending: false }),
      supabasePublic
        .from("equipment_sessions")
        .select("*")
        .eq("session_status", "completed")
        .order("ended_at", { ascending: false })
        .limit(10),
    ]);

  return {
    equipment: equipment ?? [],
    activeSessions: activeSessions ?? [],
    completedSessions: completedSessions ?? [],
  };
}

function statusColor(status: string) {
  return status === "occupied"
    ? "bg-red-100 text-red-700 border-red-200"
    : "bg-green-100 text-green-700 border-green-200";
}

export default async function HomePage() {
  const { equipment, activeSessions, completedSessions } = await getData();

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">SmartRep Dashboard</h1>
          <p className="text-slate-600">
            Availability-first dashboard powered by ThingsBoard → Supabase
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Live Equipment Status</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {equipment.map((item) => (
              <div
                key={item.equipment_name}
                className={`rounded-2xl border p-4 shadow-sm ${statusColor(
                  item.current_status
                )}`}
              >
                <div className="text-sm uppercase tracking-wide">
                  {item.equipment_name.replaceAll("_", " ")}
                </div>
                <div className="mt-2 text-2xl font-bold">{item.current_status}</div>
                <div className="mt-2 text-xs opacity-70">
                  Updated: {new Date(item.last_changed_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Active Sessions</h2>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              {activeSessions.length === 0 ? (
                <p className="text-slate-500">No active sessions</p>
              ) : (
                <div className="space-y-3">
                  {activeSessions.map((session) => (
                    <div key={session.id} className="rounded-xl border p-3">
                      <div className="font-medium">
                        {session.equipment_name.replaceAll("_", " ")}
                      </div>
                      <div className="text-sm text-slate-500">
                        Started:{" "}
                        {session.started_at
                          ? new Date(session.started_at).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Recent Completed Sessions</h2>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              {completedSessions.length === 0 ? (
                <p className="text-slate-500">No completed sessions yet</p>
              ) : (
                <div className="space-y-3">
                  {completedSessions.map((session) => (
                    <div key={session.id} className="rounded-xl border p-3">
                      <div className="font-medium">
                        {session.equipment_name.replaceAll("_", " ")}
                      </div>
                      <div className="text-sm text-slate-500">
                        Duration: {session.duration_seconds ?? "—"} s
                      </div>
                      <div className="text-sm text-slate-500">
                        Ended:{" "}
                        {session.ended_at
                          ? new Date(session.ended_at).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}