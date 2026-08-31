import type { FallbackEntry } from "@/lib/model-settings";

export interface DirectLlmResult {
  text: string;
  provider: string;
  model: string;
}

function systemPrompt(agentName: string, agentRole?: string): string {
  return [
    `You are ${agentName}, an autonomous AI agent of the KEETECH multi-agent agency.`,
    agentRole ? `Your specialty: ${agentRole}.` : "",
    "Reply in the same language as the user's request (usually Indonesian).",
    "Be concise, technical, and action-oriented. No preamble about being an AI.",
  ]
    .filter(Boolean)
    .join(" ");
}

async function callGemini(
  cfg: FallbackEntry,
  task: string,
  agentName: string,
  agentRole: string | undefined,
  signal?: AbortSignal
): Promise<string> {
  const base = (cfg.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(agentName, agentRole) }] },
      contents: [{ role: "user", parts: [{ text: task }] }],
    }),
    signal,
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Gemini: ${msg}`);
  }
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p: { text?: string }) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini: respons kosong");
  return text;
}

async function callOpenAiCompatible(
  cfg: FallbackEntry,
  task: string,
  agentName: string,
  agentRole: string | undefined,
  signal?: AbortSignal
): Promise<string> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: systemPrompt(agentName, agentRole) },
        { role: "user", content: task },
      ],
    }),
    signal,
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`LLM: ${msg}`);
  }
  const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("LLM: respons kosong");
  return text;
}

export async function callDirectLlm(
  cfg: FallbackEntry,
  opts: { task: string; agentName: string; agentRole?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<DirectLlmResult> {
  if (!cfg.apiKey) throw new Error("API key belum diisi");
  if (!cfg.model) throw new Error("Model belum diisi");
  const { task, agentName, agentRole, signal, timeoutMs = 120_000 } = opts;
  const timeout = setTimeout(() => {
    try { signal?.dispatchEvent?.(new Event("abort")); } catch { /* noop */ }
  }, timeoutMs);
  try {
    const text =
      cfg.provider === "gemini"
        ? await callGemini(cfg, task, agentName, agentRole, signal)
        : await callOpenAiCompatible(cfg, task, agentName, agentRole, signal);
    return { text, provider: cfg.provider, model: cfg.model };
  } finally {
    clearTimeout(timeout);
  }
}
