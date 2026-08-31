import { NextRequest, NextResponse } from "next/server";
import { loadModelSettings, saveModelSettings, mergeIncoming, publicSettings } from "@/lib/model-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, settings: publicSettings(loadModelSettings()) });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = loadModelSettings();
    const next = mergeIncoming(current, body);
    saveModelSettings(next);
    return NextResponse.json({ success: true, settings: publicSettings(next) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan settings";
    return NextResponse.json({ success: false, error: msg }, { status: 200 });
  }
}
