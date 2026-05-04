import { runAvailabilitySync } from "@/lib/sync-availability";

export async function POST() {
  try {
    const result = await runAvailabilitySync();
    return Response.json(result);
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}