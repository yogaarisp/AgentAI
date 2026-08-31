interface HermesSession {
  cookie: string;
  expiresAt: number;
}

let cachedSession: HermesSession | null = null;
let loginInFlight: Promise<HermesSession> | null = null;
let rateLimitedUntil = 0;

export function clearHermesSession() {
  cachedSession = null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loginOnce(): Promise<HermesSession> {
  const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";
  const username = process.env.HERMES_USERNAME;
  const password = process.env.HERMES_PASSWORD;

  if (!username || !password) {
    throw new Error("HERMES_USERNAME / HERMES_PASSWORD belum dikonfigurasi di .env.local");
  }

  const res = await fetch(`${baseUrl}/auth/password-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider: "basic", username, password, next: "" }),
  });

  if (res.status === 429) {
    rateLimitedUntil = Date.now() + 60_000;
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs)) rateLimitedUntil = Date.now() + secs * 1000;
    }
    throw new Error("Rate limit login Hermes — tunggu ±1 menit sebelum mencoba lagi");
  }

  if (!res.ok) {
    throw new Error(`Login Hermes gagal (HTTP ${res.status})`);
  }

  const rawCookies = res.headers.getSetCookie?.() ?? [];
  const pairs = rawCookies.map((c) => c.split(";")[0]).filter((p) => p.includes("="));

  if (pairs.length === 0) {
    throw new Error("Login Hermes tidak mengembalikan cookie sesi");
  }

  rateLimitedUntil = 0;
  return {
    cookie: pairs.join("; "),
    expiresAt: Date.now() + 11 * 3600_000,
  };
}

async function performLogin(): Promise<HermesSession> {
  if (Date.now() < rateLimitedUntil) {
    const waitSecs = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    throw new Error(`Rate limit login Hermes aktif — tunggu ${waitSecs} detik`);
  }
  if (!loginInFlight) {
    loginInFlight = loginOnce().finally(() => {
      loginInFlight = null;
    });
  }
  return loginInFlight;
}

export async function getHermesSession(force = false): Promise<HermesSession> {
  if (!force && cachedSession && cachedSession.expiresAt > Date.now() + 60_000) {
    return cachedSession;
  }
  cachedSession = await performLogin();
  return cachedSession;
}

export interface ProfileStatus {
  name: string;
  gateway_running: boolean;
  model: string;
  provider: string;
}

let statusCache: { data: ProfileStatus[]; expiresAt: number } | null = null;

async function authedFetch(path: string, init: RequestInit): Promise<Response> {
  const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";
  let session = await getHermesSession();
  let res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Cookie: session.cookie },
    cache: "no-store",
  });
  if (res.status === 401 && !Date.now()) {
    /* unreachable guard */
  }
  if (res.status === 401) {
    cachedSession = null;
    session = await getHermesSession(true);
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { ...init.headers, Cookie: session.cookie },
      cache: "no-store",
    });
  }
  return res;
}

export async function getProfileStatuses(): Promise<ProfileStatus[]> {
  if (statusCache && statusCache.expiresAt > Date.now()) {
    return statusCache.data;
  }

  const res = await authedFetch("/api/profiles", {});
  if (!res.ok) {
    throw new Error(`Gagal mengambil status profil (HTTP ${res.status})`);
  }

  const data = await res.json();
  const profiles: ProfileStatus[] = (data.profiles ?? []).map((p: Record<string, unknown>) => ({
    name: String(p.name ?? ""),
    gateway_running: Boolean(p.gateway_running),
    model: String(p.model ?? ""),
    provider: String(p.provider ?? ""),
  }));

  statusCache = { data: profiles, expiresAt: Date.now() + 2_000 };
  return profiles;
}

export async function getWsTicket(): Promise<string> {
  const res = await authedFetch("/api/auth/ws-ticket", { method: "POST" });
  if (!res.ok) {
    throw new Error(`Gagal mendapat ws-ticket (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.ticket) {
    throw new Error("ws-ticket kosong dari Hermes backend");
  }
  return data.ticket as string;
}
