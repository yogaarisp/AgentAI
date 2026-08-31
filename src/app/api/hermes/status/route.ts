import { NextResponse } from "next/server";
import { getProfileStatuses } from "@/lib/hermes-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = await getProfileStatuses();
    const map: Record<string, { gateway_running: boolean; model: string }> = {};
    for (const p of profiles) {
      map[p.name] = { gateway_running: p.gateway_running, model: p.model };
    }
    return NextResponse.json({
      success: true,
      profiles: map,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Gagal mengambil status Hermes",
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  }
}
