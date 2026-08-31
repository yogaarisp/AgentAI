import { NextRequest, NextResponse } from "next/server";
import { loadModelSettings, mergeIncoming } from "@/lib/model-settings";
import { callDirectLlm } from "@/lib/llm-direct";

export const dynamic = "force-dynamic";

/**
 * POST { slot: "primary" | agentId, provider, baseUrl, apiKey?, model }
 * apiKey kosong → pakai key tersimpan (untuk slot tersebut).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slot = String(body.slot || "primary");
    const current = loadModelSettings();

    let candidate = current.primary;
    if (slot !== "primary") {
      // merge dulu agar edit yang belum disimpan tetap ikut dites
      const merged = mergeIncoming(current, {
        perAgent: { [slot]: body },
      });
      candidate = merged.perAgent[slot];
    } else {
      const apiKey = String(body.apiKey || "") || current.primary.apiKey;
      candidate = {
        provider: body.provider === "openai-compatible" ? "openai-compatible" : "gemini",
        baseUrl: String(body.baseUrl || current.primary.baseUrl),
        apiKey,
        model: String(body.model || current.primary.model),
      };
    }

    const result = await callDirectLlm(candidate, {
      task: "Reply with exactly: OK",
      agentName: "Connection Test",
      timeoutMs: 30_000,
    });
    return NextResponse.json({ success: true, reply: result.text, model: result.model });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Test koneksi gagal";
    return NextResponse.json({ success: false, error: msg }, { status: 200 });
  }
}
