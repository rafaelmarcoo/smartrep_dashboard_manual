import { getDashboardData } from "@/lib/dashboard-data";

export async function GET() {
  try {
    const data = await getDashboardData();
    return Response.json({ ok: true, ...data });
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
