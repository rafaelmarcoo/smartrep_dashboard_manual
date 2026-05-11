import { generateWorkoutCoaching } from "@/lib/ai-coaching";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { publishServerTelemetry } from "@/lib/thingsboard";

type SetCompletePayload = {
  external_session_id?: string;
  external_set_id?: string;
  set_number?: number;
  exercise?: string;
  reps?: number;
  bad_reps?: number;
  form_score?: number;
  angle_data?: unknown;
  started_at?: string | null;
  ended_at?: string | null;
};

function numericOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SetCompletePayload;

    if (!payload.external_session_id || !payload.external_set_id || !payload.exercise) {
      return Response.json(
        { ok: false, error: "Missing set completion identifiers." },
        { status: 400 }
      );
    }

    const reps = numericOrNull(payload.reps);
    const badReps = numericOrNull(payload.bad_reps);
    const formScore = numericOrNull(payload.form_score);
    const endedAt = payload.ended_at ?? new Date().toISOString();

    const coachingSummary = await generateWorkoutCoaching({
      kind: "set",
      exercise: payload.exercise,
      reps,
      badReps,
      formScore,
      angleData: payload.angle_data ?? [],
    });

    const { error } = await supabaseAdmin.from("workout_sets").upsert(
      {
        external_set_id: payload.external_set_id,
        external_session_id: payload.external_session_id,
        set_number: payload.set_number,
        exercise: payload.exercise,
        reps,
        bad_reps: badReps,
        form_score: formScore,
        angle_data: payload.angle_data ?? [],
        coaching_summary: coachingSummary,
        started_at: payload.started_at ?? null,
        ended_at: endedAt,
        set_status: "completed",
        source_device: "SmartRep-Pi1-Camera",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_set_id" }
    );

    if (error) throw error;

    let thingsboardPublished = true;
    try {
      await publishServerTelemetry({
        latest_set_ai_feedback: coachingSummary,
      });
    } catch (publishError) {
      thingsboardPublished = false;
      console.error("Set feedback ThingsBoard publish failed:", publishError);
    }

    return Response.json({
      ok: true,
      coaching_summary: coachingSummary,
      thingsboard_published: thingsboardPublished,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Set completion failed",
      },
      { status: 500 }
    );
  }
}
