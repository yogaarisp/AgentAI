import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST { text } → audio/mpeg dari ElevenLabs.
 * Key disimpan di env server (ELEVENLABS_API_KEY), tidak pernah ke klien.
 * Voice default: George (British male) — karakter paling dekat dengan Jarvis.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const text = String(body.text || "").slice(0, 900).trim();
  if (!text) {
    return new Response(JSON.stringify({ error: "text kosong" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY belum diisi di server" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const voiceId = String(body.voiceId || "").trim() || (process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb");

  try {
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        output_format: "mp3_44100_64",
        voice_settings: {
          stability: 0.55,        // cukup stabil tapi tetap expressive
          similarity_boost: 0.80, // tetap mirip karakter voice aslinya
          style: 0.25,            // sedikit gaya, tidak flat
          use_speaker_boost: true,
        },
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: `ElevenLabs ${upstream.status}: ${detail.slice(0, 200)}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "TTS gagal";
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
