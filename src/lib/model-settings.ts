import fs from "fs";
import path from "path";

export type ProviderKind = "gemini" | "openai-compatible";

export interface FallbackEntry {
  provider: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AgentModelSettings {
  [agentId: string]: FallbackEntry;
}

export interface ModelSettings {
  primary: FallbackEntry;
  perAgent: AgentModelSettings;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "model-settings.json");

const DEFAULT_SETTINGS: ModelSettings = {
  primary: { provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com", apiKey: "", model: "gemini-3.6-flash" },
  perAgent: {},
};

let cache: ModelSettings | null = null;

function cloneDefaults(): ModelSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function loadModelSettings(): ModelSettings {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ModelSettings>;
    cache = {
      primary: { ...cloneDefaults().primary, ...(parsed.primary ?? {}) },
      perAgent: parsed.perAgent && typeof parsed.perAgent === "object" ? parsed.perAgent : {},
    };
  } catch {
    cache = cloneDefaults();
  }
  return cache;
}

export function saveModelSettings(next: ModelSettings): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = SETTINGS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, SETTINGS_FILE);
  cache = next;
}

export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(Math.min(12, key.length - 8)) + key.slice(-4);
}

export function publicSettings(s: ModelSettings) {
  return {
    primary: { ...s.primary, apiKey: maskKey(s.primary.apiKey), hasKey: Boolean(s.primary.apiKey) },
    perAgent: Object.fromEntries(
      Object.entries(s.perAgent).map(([id, e]) => [id, { ...e, apiKey: maskKey(e.apiKey), hasKey: Boolean(e.apiKey) }])
    ),
  };
}

/** Gabungkan settings yang dikirim dari form: apiKey kosong berarti pakai yang tersimpan. */
export function mergeIncoming(
  current: ModelSettings,
  incoming: { primary?: Partial<FallbackEntry>; perAgent?: Record<string, Partial<FallbackEntry>> }
): ModelSettings {
  const next = cloneDefaults();
  const p = incoming.primary ?? {};
  next.primary = {
    provider: p.provider === "openai-compatible" ? "openai-compatible" : "gemini",
    baseUrl: (p.baseUrl || current.primary.baseUrl).replace(/\/+$/, ""),
    apiKey: p.apiKey || current.primary.apiKey,
    model: p.model || current.primary.model,
  };
  if (incoming.perAgent && typeof incoming.perAgent === "object") {
    for (const [id, e] of Object.entries(incoming.perAgent)) {
      const prev = current.perAgent[id];
      const apiKey = e.apiKey || prev?.apiKey || "";
      if (!apiKey) continue;
      next.perAgent[id] = {
        provider: e.provider === "openai-compatible" ? "openai-compatible" : "gemini",
        baseUrl: (e.baseUrl || prev?.baseUrl || "").replace(/\/+$/, ""),
        apiKey,
        model: e.model || prev?.model || "",
      };
    }
  }
  return next;
}
