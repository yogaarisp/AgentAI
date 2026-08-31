import { NextResponse } from "next/server";
import { getActivityLog } from "@/lib/activity-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, activities: getActivityLog() });
}
