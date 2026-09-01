import { NextRequest, NextResponse } from "next/server";
import { loadModelSettings, mergeIncoming } from "@/lib/model-settings";

export const dynamic = "force-dynamic";

/**
 * POST { slot: "primary" | agentId, provider, baseUrl, apiKey? }
 * Mengambil daftar model dari provider:
 * - gemini           → GET {baseUrl}/v1beta/models
 * - openai-compatible → GET {baseUrl}/models (Bearer) — termasuk Nine Router
 * apiKey kosong → pakai key tersimpan untuk slot tersebut.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const slot = String(body.slot || "primary");
    const current = loadModelSettings();

    let apiKey: string;
    let baseUrl: string;
    let isGemini: boolean;

    if (slot === "primary" && !body.apiKey) {
      apiKey = current.primary.apiKey;
      baseUrl = String(body.baseUrl || current.primary.baseUrl);
      isGemini = body.provider !== "openai-compatible";
    } else if (slot === "primary") {
      apiKey = String(body.apiKey);
      baseUrl = String(body.baseUrl || current.primary.baseUrl);
      isGemini = body.provider !== "openai-compatible";
    } else {
      const merged = mergeIncoming(current, { perAgent: { [slot]: body } });
      const entry = merged.perAgent[slot];
      if (!entry?.apiKey) {
        return NextResponse.json(
          { success: false, error: "API key belum diisi untuk slot ini" },
          { status: 200 }
        );
      }
      apiKey = entry.apiKey;
      baseUrl = String(body.baseUrl || entry.baseUrl);
      isGemini = body.provider !== "openai-compatible";
    }

    if (!baseUrl) {
      return NextResponse.json({ success: false, error: "Base URL belum diisi" }, { status: 200 });
    }
    const base = baseUrl.replace(/\/+$/, "");

    let models: string[] = [];
    if (isGemini) {
      const res = await fetch(`${base}/v1beta/models?pageSize=200`, {
        headers: { "x-goog-api-key": apiKey },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: data?.error?.message || `HTTP ${res.status}` },
          { status: 200 }
        );
      }
      models = (data?.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent")
        )
        .map((m: { name: string }) => m.name.replace(/^models\//, ""))
        .filter((n: string) => n.startsWith("gemini"))
        .sort();
    } else {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: data?.error?.message || `HTTP ${res.status}` },
          { status: 200 }
        );
      }
      models = (data?.data ?? [])
        .map((m: { id?: string; name?: string }) => String(m.id ?? m.name ?? ""))
        .filter(Boolean)
        .sort();
    }

    return NextResponse.json({ success: true, models });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal memuat daftar model";
    return NextResponse.json({ success: false, error: msg }, { status: 200 });
  }
}
