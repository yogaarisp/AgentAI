interface HermesSession {
  cookie: string;
  expiresAt: number;
}

let cachedSession: HermesSession | null = null;

export async function getHermesSession(): Promise<HermesSession> {
  if (cachedSession && cachedSession.expiresAt > Date.now() + 60_000) {
    return cachedSession;
  }

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

  if (!res.ok) {
    throw new Error(`Login Hermes gagal (HTTP ${res.status})`);
  }

  const rawCookies = res.headers.getSetCookie?.() ?? [];
  const pairs = rawCookies.map((c) => c.split(";")[0]).filter((p) => p.includes("="));

  if (pairs.length === 0) {
    throw new Error("Login Hermes tidak mengembalikan cookie sesi");
  }

  cachedSession = {
    cookie: pairs.join("; "),
    expiresAt: Date.now() + 11 * 3600_000,
  };
  return cachedSession;
}

export interface ProfileStatus {
  name: string;
  gateway_running: boolean;
  model: string;
  provider: string;
}

let statusCache: { data: ProfileStatus[]; expiresAt: number } | null = null;

export async function getProfileStatuses(): Promise<ProfileStatus[]> {
  if (statusCache && statusCache.expiresAt > Date.now()) {
    return statusCache.data;
  }

  const session = await getHermesSession();
  const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";
  const res = await fetch(`${baseUrl}/api/profiles`, {
    headers: { Cookie: session.cookie },
    cache: "no-store",
  });

  if (res.status === 401) {
    cachedSession = null;
    throw new Error("Sesi Hermes kedaluwarsa, coba lagi");
  }
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
  const session = await getHermesSession();
  const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";
  const res = await fetch(`${baseUrl}/api/auth/ws-ticket`, {
    method: "POST",
    headers: { Cookie: session.cookie },
  });
  if (!res.ok) {
    throw new Error(`Gagal mendapat ws-ticket (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (!data.ticket) {
    throw new Error("ws-ticket kosong dari Hermes backend");
  }
  return data.ticket as string;
}
