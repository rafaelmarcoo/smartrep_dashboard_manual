import { endWorkoutSet } from "@/lib/workout-command-server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { session_id?: string };

    if (!body.session_id) {
      return Response.json(
        {
          ok: false,
          error: "session_id is required.",
        },
        { status: 400 }
      );
    }

    const command = await endWorkoutSet(body.session_id);
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
