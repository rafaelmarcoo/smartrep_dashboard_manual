import {
  cancelWorkoutSession,
  endWorkoutSession,
  endWorkoutSet,
  startWorkoutSession,
  startWorkoutSet,
} from "@/lib/workout-control";

type ControlRequest = {
  action?: string;
  exercise?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ControlRequest;

    switch (body.action) {
      case "start_session":
        return Response.json(await startWorkoutSession(body.exercise));
      case "start_set":
        return Response.json(await startWorkoutSet());
      case "end_set":
        return Response.json(await endWorkoutSet());
      case "end_session":
        return Response.json(await endWorkoutSession());
      case "cancel_session":
        return Response.json(await cancelWorkoutSession());
      default:
        return Response.json(
          { ok: false, error: "Unknown workout control action." },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Workout control failed",
      },
      { status: 500 }
    );
  }
}
