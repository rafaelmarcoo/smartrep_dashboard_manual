import { DEFAULT_COUNTDOWN_SECONDS } from "@/lib/workout-contract";
import { startWorkoutSet } from "@/lib/workout-command-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      session_id?: string;
      set_number?: number;
      countdown_s?: number;
    };

    if (!body.session_id || typeof body.set_number !== "number") {
      return Response.json(
        {
          ok: false,
          error: "session_id and set_number are required.",
        },
        { status: 400 }
      );
    }

    const command = await startWorkoutSet(
      body.session_id,
      body.set_number,
      body.countdown_s ?? DEFAULT_COUNTDOWN_SECONDS
    );
    return Response.json({ ok: true, command });
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unknown error";

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
