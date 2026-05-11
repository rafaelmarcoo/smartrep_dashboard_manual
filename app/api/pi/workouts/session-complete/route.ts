import { generateWorkoutCoaching } from "@/lib/ai-coaching";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { publishServerTelemetry } from "@/lib/thingsboard";

type SessionCompletePayload = {
  external_session_id?: string;
  exercise?: string;
  sets?: number;
  reps_per_set?: unknown;
  bad_reps?: number;
  form_score?: number;
  started_at?: string | null;
  ended_at?: string | null;
};

function numericOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SessionCompletePayload;

    if (!payload.external_session_id || !payload.exercise) {
      return Response.json(
        { ok: false, error: "Missing session completion identifiers." },
        { status: 400 }
      );
    }

    const sets = numericOrNull(payload.sets);
    const badReps = numericOrNull(payload.bad_reps);
    const formScore = numericOrNull(payload.form_score);
    const endedAt = payload.ended_at ?? new Date().toISOString();

    const coachingSummary = await generateWorkoutCoaching({
      kind: "session",
      exercise: payload.exercise,
      sets,
      repsPerSet: payload.reps_per_set ?? [],
      badReps,
      formScore,
    });

    const { error } = await supabaseAdmin.from("workout_sessions").upsert(
      {
        external_session_id: payload.external_session_id,
        exercise: payload.exercise,
        sets,
        reps_per_set: payload.reps_per_set ?? [],
        bad_reps: badReps,
        form_score: formScore,
        coaching_summary: coachingSummary,
        started_at: payload.started_at ?? null,
        ended_at: endedAt,
        session_status: "completed",
        source_device: "SmartRep-Pi1-Camera",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "external_session_id" }
    );

    if (error) throw error;

    let thingsboardPublished = true;
    try {
      await publishServerTelemetry({
        coaching_summary: coachingSummary,
        latest_session_ai_feedback: coachingSummary,
        latest_session_coaching_summary: coachingSummary,
        latest_session_id: payload.external_session_id,
        latest_session_exercise: payload.exercise,
        latest_session_feedback_at: endedAt,
      });
    } catch (publishError) {
      thingsboardPublished = false;
      console.error("Session feedback ThingsBoard publish failed:", publishError);
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
        error: error instanceof Error ? error.message : "Session completion failed",
      },
      { status: 500 }
    );
  }
}
