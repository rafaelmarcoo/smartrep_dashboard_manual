import { runWorkoutSync } from "@/lib/sync-workouts";

export async function POST() {
  try {
    const result = await runWorkoutSync();
    return Response.json(result);
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unknown error";

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
