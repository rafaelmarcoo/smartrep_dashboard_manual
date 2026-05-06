import { connection } from "next/server";

import { DashboardShell } from "@/app/dashboard-shell";
import { getDashboardData } from "@/lib/dashboard-data";

export default async function HomePage() {
  await connection();
  const initialData = await getDashboardData();
  return <DashboardShell initialData={initialData} />;
}
