"use client";

import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
import type { Agent } from "@/lib/agents";
import { playJarvisChime, speak, stopSpeaking } from "@/lib/tts";

const ttsStore = {
  listeners: new Set<() => void>(),
  get(): boolean {
    return localStorage.getItem("ops_tts") !== "0";
  },
  set(on: boolean) {
    localStorage.setItem("ops_tts", on ? "1" : "0");
    ttsStore.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    ttsStore.listeners.add(l);
    return () => {
      ttsStore.listeners.delete(l);
    };
  },
};

function wmoLabel(code: number): string {
  if (code === 0) return "CLEAR";
  if (code <= 3) return "CLOUDY";
  if (code <= 48) return "FOG";
  if (code <= 57) return "DRIZZLE";
  if (code <= 67) return "RAIN";
  if (code <= 77) return "SNOW";
  if (code <= 82) return "SHOWERS";
  if (code <= 86) return "SNOW";
  return "STORM";
}

type PendingMeta = {
  kind: "approval" | "clarify";
  requestId: string;
  status: "pending" | "approved" | "rejected" | "answered";
  response?: string;
};

type FeedMsg = {
  id: string;
  role: "user" | "agent" | "event" | "sys" | "approval" | "clarify";
  text: string;
  ts: string;
  meta?: PendingMeta;
};

interface SysStats {
  cpuPct: number;
  ramPct: number;
  diskPct: number | null;
  ramUsedGb: number;
  ramTotalGb: number;
  uptimeSec: number;
  visitorIp: string;
  hostname: string;
  cpuModel: string;
  cores: number;
}

interface ActivityItem {
  id: string;
  ts: string;
  agentId: string;
  agentName: string;
  type: string;
  text: string;
}

const GREETING = "Hai Keenan, I'm Keetech";

/**
 * Deteksi intent user ingin ngobrol dengan agent tertentu.
 * Mengembalikan agent id yang dimaksud, atau null kalau tidak ada.
 *
 * Pola yang didukung (case-insensitive, bahasa Indonesia & Inggris):
 *   "saya ingin ngobrol dengan kirana"
 *   "chat dengan keedev"
 *   "hubungkan ke keeinfra"
 *   "alihkan ke keefin"
 *   "switch to keemes"
 *   "minta bantuan keedev"
 *   "@kirana ..."
 */
function detectAgentIntent(text: string, agentList: Agent[]): Agent | null {
  const lower = text.toLowerCase();

  // Trigger kata-kata yang menandakan pergantian agent
  const switchPatterns = [
    /(?:ingin?|mau|pengen|pengin)\s+(?:ngobrol|chat|bicara|tanya|konsultasi)\s+(?:dengan|sama|ke|dengan)\s+(\w+)/i,
    /(?:ngobrol|chat|bicara|tanya|konsultasi)\s+(?:dengan|sama|ke)\s+(\w+)/i,
    /(?:hubungkan?|alihkan?|sambungkan?|pindahkan?|switch(?:\s+to)?|connect(?:\s+to)?)\s+(?:ke\s+)?(\w+)/i,
    /(?:minta\s+bantuan|tanya)\s+(\w+)/i,
    /^@(\w+)/i,
    /(?:dengan|sama)\s+(\w+)\s+(?:dong|deh|ya|tolong|please)/i,
    /(?:ke|to)\s+(\w+)(?:\s+(?:dong|deh|ya|tolong|please))?$/i,
  ];

  for (const pattern of switchPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const candidate = match[1].toLowerCase();
      const found = agentList.find(
        (a) =>
          a.id.toLowerCase() === candidate ||
          a.name.toLowerCase() === candidate ||
          a.displayName.toLowerCase() === candidate
      );
      if (found) return found;
    }
  }

  // Fallback: cek apakah nama agent muncul secara eksplisit di awal kalimat
  // atau dalam frasa "... kirana ..." tanpa konteks task yang jelas
  const firstWords = lower.split(/\s+/).slice(0, 4).join(" ");
  for (const agent of agentList) {
    const names = [agent.id, agent.name, agent.displayName].map((n) => n.toLowerCase());
    for (const name of names) {
      if (firstWords.includes(name)) return agent;
    }
  }

  return null;
}

function uid() {
  return Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d > 0 ? `${d}h ${h}j` : `${h}j ${Math.floor((sec % 3600) / 60)}m`;
}

function CornerFrame({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative border border-amber-400/25 bg-black/50 backdrop-blur-sm ${className}`}>
      <span className="absolute -top-px -left-px w-3 h-3 border-t-2 border-l-2 border-cyan-300/70" />
      <span className="absolute -top-px -right-px w-3 h-3 border-t-2 border-r-2 border-cyan-300/70" />
      <span className="absolute -bottom-px -left-px w-3 h-3 border-b-2 border-l-2 border-cyan-300/70" />
      <span className="absolute -bottom-px -right-px w-3 h-3 border-b-2 border-r-2 border-cyan-300/70" />
      {children}
    </div>
  );
}

function Gauge({ label, pct, extra }: { label: string; pct: number | null; extra?: string }) {
  const v = pct ?? 0;
  const color = v > 85 ? "#f87171" : v > 60 ? "#fbbf24" : "#34d399";
  return (
    <div className="mb-2.5">
      <div className="flex justify-between items-baseline">
        <span className="text-[9px] font-mono tracking-[0.15em] text-zinc-500 uppercase">{label}</span>
        <span className="text-[10px] font-mono font-bold" style={{ color: pct === null ? "#71717a" : color }}>
          {pct === null ? "N/A" : `${pct}%`}
        </span>
      </div>
      <div className="h-1 mt-1 bg-white/[0.06] overflow-hidden">
        <div
          className="h-full transition-all duration-700"
          style={{ width: `${pct === null ? 0 : Math.min(100, v)}%`, backgroundColor: color }}
        />
      </div>
      {extra && <div className="text-right text-[8px] font-mono text-zinc-600 mt-0.5">{extra}</div>}
    </div>
  );
}

function RadarSphere({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 320 Partikel 3D: Renggang, elegan, konstelasi bintang
    const N = 320;
    const pts: { x: number; y: number; z: number; s: number; c: number; phase: number }[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.399963229728653; // Golden angle
      pts.push({
        x: Math.cos(th) * r,
        y,
        z: Math.sin(th) * r,
        s: 1.0 + (i % 4 === 0 ? 0.8 : 0.3) + Math.random() * 0.5,
        c: Math.random(),
        phase: Math.random() * Math.PI * 2,
      });
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      // Gunakan dimensi persegi presisi dari dimensi terkecil
      const size = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;

      // Radius utama proporsional & simetris
      const R = size * 0.44;
      const sphereR = R * 0.58;
      const hudR = R * 0.95;
      const speedMult = active ? 1.6 : 1.0;

      // ----------------------------------------------------
      // 1. AMBIENT GLOW
      // ----------------------------------------------------
      const pulse = 1 + Math.sin(t * (active ? 3.5 : 1.8)) * 0.03;
      const haloG = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      haloG.addColorStop(0, active ? "rgba(245, 158, 11, 0.14)" : "rgba(245, 158, 11, 0.06)");
      haloG.addColorStop(0.7, active ? "rgba(217, 119, 6, 0.03)" : "rgba(217, 119, 6, 0.01)");
      haloG.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = haloG;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // ----------------------------------------------------
      // 2. HUD CALIBRATION RINGS & DEGREE MARKERS
      // ----------------------------------------------------
      ctx.save();
      const hudRot = t * 0.04 * speedMult;

      // Lingkaran terluar tipis putus-putus
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(245, 158, 11, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, hudR * 1.03, 0, Math.PI * 2);
      ctx.stroke();

      // 4 Busur Segmen Sudut Berputar
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const sa = (i * Math.PI) / 2 + hudRot + 0.16;
        const ea = ((i + 1) * Math.PI) / 2 + hudRot - 0.16;
        ctx.beginPath();
        ctx.arc(cx, cy, hudR, sa, ea);
        ctx.stroke();

        // Ticks di ujung busur
        for (const ang of [sa, ea]) {
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * hudR, cy + Math.sin(ang) * hudR);
          ctx.lineTo(cx + Math.cos(ang) * (hudR + 6), cy + Math.sin(ang) * (hudR + 6));
          ctx.stroke();
        }
      }

      // Label Derajat: 000°, 090°, 180°, 270°
      const labels = ["000°", "090°", "180°", "270°"];
      ctx.font = "600 8.5px ui-monospace, monospace";
      ctx.fillStyle = "rgba(251, 191, 36, 0.85)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < 4; i++) {
        const midAng = (i * Math.PI) / 2 + hudRot + Math.PI / 4;
        const lx = cx + Math.cos(midAng) * (hudR * 1.06);
        const ly = cy + Math.sin(midAng) * (hudR * 1.06);
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(midAng + Math.PI / 2);
        ctx.fillText(labels[i], 0, 0);
        ctx.restore();
      }

      // Inward Ticks
      ctx.strokeStyle = "rgba(245, 158, 11, 0.3)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 - hudRot * 0.4;
        const r1 = hudR * 0.97;
        const r2 = i % 6 === 0 ? hudR * 0.90 : hudR * 0.93;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }

      // Crosshair pusat
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(cx - hudR * 1.05, cy);
      ctx.lineTo(cx + hudR * 1.05, cy);
      ctx.moveTo(cx, cy - hudR * 1.05);
      ctx.lineTo(cx, cy + hudR * 1.05);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ----------------------------------------------------
      // 3. ORTHOGRAPHIC 3D SPHERE (Simetris Sempurna)
      // ----------------------------------------------------
      // Rotasi hanya sumbu Y (horizontal spin) — TANPA TILT agar bulat sempurna
      const rotY = t * 0.12 * speedMult;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      const projected: { px: number; py: number; depth: number; s: number; c: number }[] = [];
      const curR = sphereR * pulse;

      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const wave = 1 + Math.sin(t * 1.5 + p.phase) * (active ? 0.025 : 0.01);
        const pr = curR * wave;

        // Rotasi Y saja (orthographic, tanpa perspektif)
        const rx = p.x * cosY + p.z * sinY;
        const rz = -p.x * sinY + p.z * cosY;
        const ry = p.y;

        // Proyeksi Ortografis: px = x, py = -y (TANPA scaling perspektif)
        const px = cx + rx * pr;
        const py = cy - ry * pr;
        const depth = (rz + 1) / 2; // 0 (belakang) → 1 (depan)

        projected.push({ px, py, depth, s: p.s, c: p.c });
      }

      // Depth sort (belakang dulu, depan terakhir)
      projected.sort((a, b) => a.depth - b.depth);

      // ----------------------------------------------------
      // 4. RENDER PARTICLES
      // ----------------------------------------------------
      for (let i = 0; i < projected.length; i++) {
        const p = projected[i];
        const alpha = Math.max(0.15, Math.min(1, 0.18 + p.depth * 0.82));
        const radius = p.s * (0.7 + p.depth * 0.7) * (active ? 1.1 : 1.0);

        ctx.globalAlpha = alpha;

        if (p.c > 0.85) {
          ctx.fillStyle = "#ffffff";
        } else if (p.c > 0.50) {
          ctx.fillStyle = "#fef08a";
        } else if (p.c > 0.20) {
          ctx.fillStyle = "#fbbf24";
        } else {
          ctx.fillStyle = "#f59e0b";
        }

        ctx.beginPath();
        ctx.arc(p.px, p.py, radius, 0, Math.PI * 2);
        ctx.fill();

        // Soft halo untuk bintang depan
        if (p.depth > 0.78 && p.c > 0.6) {
          ctx.globalAlpha = alpha * 0.25;
          ctx.beginPath();
          ctx.arc(p.px, p.py, radius * 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  return <canvas ref={canvasRef} className="w-full aspect-square max-h-[380px] block drop-shadow-[0_0_25px_rgba(245,158,11,0.15)]" />;
}

// Warna tema KEETECH default (amber/gold) saat belum ada agent dipilih
const KEETECH_THEME = {
  hex: "#f59e0b",
  name: "KEETECH",
  role: "Central AI",
};

export default function OpsCenter({ agents }: { agents: Agent[] }) {
  const keemes = agents.find((a) => a.hermesProfileKey === "keehermes") ?? agents[0];
  // null = belum ada agent dipilih, tampil sebagai KEETECH
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [stats, setStats] = useState<SysStats | null>(null);
  const [statsOk, setStatsOk] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [greetingRevealed, setGreetingRevealed] = useState(0);
  const [feed, setFeed] = useState<FeedMsg[]>([]);
  const [input, setInput] = useState("");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const [listening, setListening] = useState(false);
  const [clarifyDraft, setClarifyDraft] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [env, setEnv] = useState<{ location: string; weather: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [localAgentOnline, setLocalAgentOnline] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const feedRef = useRef<FeedMsg[]>([]);
  const streamIndexRef = useRef<number>(-1);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ttsOnRef = useRef(true);
  const introSpokenRef = useRef(false);
  // Refs untuk akses startVoice/stopVoice dari useEffect tanpa stale closure
  const startVoiceRef = useRef<(() => void) | null>(null);
  const stopVoiceRef  = useRef<(() => void) | null>(null);
  const recRef = useRef<any>(null); // instance SpeechRecognition aktif

  // Auto focus input saat keyboard dibuka
  useEffect(() => {
    if (showKeyboard) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [showKeyboard]);

  // Spacebar = toggle mic, HANYA saat keyboard mode OFF
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Abaikan kalau keyboard mode ON, atau fokus di input/textarea
      if (showKeyboard) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault(); // cegah scroll halaman
        if (!listening) {
          startVoiceRef.current?.();
        } else {
          // Kalau sudah listening, spacebar kedua = stop (biarkan onend handle)
          stopVoiceRef.current?.();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKeyboard, listening]);

  const ttsOn = useSyncExternalStore(
    ttsStore.subscribe,
    ttsStore.get,
    () => true
  );

  useEffect(() => {
    ttsOnRef.current = ttsOn;
  }, [ttsOn]);

  const setTts = (on: boolean) => {
    ttsOnRef.current = on;
    ttsStore.set(on);
    if (!on) stopSpeaking();
  };

  // Suara perkenalan saat halaman pertama kali dibuka.
  // Browser memblokir audio tanpa gesture, jadi dicoba langsung lalu diulang
  // pada interaksi pertama (klik / tekan tombol) jika masih terblokir.
  useEffect(() => {
    const tryIntro = () => {
      if (introSpokenRef.current) return;
      introSpokenRef.current = true;
      speak("Hai Keenan. My name is Keetech.");
    };
    const t = setTimeout(tryIntro, 500);
    const onGesture = () => tryIntro();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      stopSpeaking();
    };
  }, []);

  const pushFeed = useCallback((msgs: Omit<FeedMsg, "id" | "ts">[]) => {
    const stamped = msgs.map((m) => ({ ...m, id: uid(), ts: new Date().toISOString() }));
    feedRef.current = [...stamped, ...feedRef.current];
    setFeed(feedRef.current);
  }, []);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 500);
    return () => clearInterval(t);
  }, []);

  // Poll local agent status setiap 5 detik
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/agent/status");
        if (res.ok) {
          const data = await res.json();
          setLocalAgentOnline(Boolean(data.online));
        }
      } catch {
        setLocalAgentOnline(false);
      }
    };
    check();
    const t = setInterval(check, 5_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (greetingRevealed >= GREETING.length) return;
    const t = setTimeout(() => setGreetingRevealed((n) => n + 1), 28);
    return () => clearTimeout(t);
  }, [greetingRevealed]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/system-stats", { cache: "no-store" });
        const data = await res.json();
        if (!stop) {
          setStats(data);
          setStatsOk(Boolean(data.success));
        }
      } catch {
        if (!stop) setStatsOk(false);
      }
    };
    load();
    const t = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/activity", { cache: "no-store" });
        const data = await res.json();
        if (!stop && data.success) setActivities(data.activities ?? []);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // ENV_TELEMETRY: lokasi visitor via IP (ipwho.is) + cuaca via open-meteo.
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const geo = await fetch("https://ipwho.is/", { cache: "no-store" }).then((r) => r.json());
        if (stop || !geo?.success) return;
        const location = [geo.city, geo.country_code].filter(Boolean).join(", ") || "-.-.-.";
        let weather = "-.-.-.";
        if (typeof geo.latitude === "number" && typeof geo.longitude === "number") {
          try {
            const w = await fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code`,
              { cache: "no-store" }
            ).then((r) => r.json());
            const cur = w?.current;
            if (cur && typeof cur.temperature_2m === "number") {
              weather = `${wmoLabel(Number(cur.weather_code))} ${Math.round(cur.temperature_2m)}°C`;
            }
          } catch {
            /* cuaca opsional */
          }
        }
        if (!stop) setEnv({ location, weather });
      } catch {
        /* biarkan placeholder */
      }
    };
    load();
    return () => {
      stop = true;
    };
  }, []);

  const updateMeta = (requestId: string, patch: Partial<PendingMeta>) => {
    feedRef.current = feedRef.current.map((m) =>
      m.meta && m.meta.requestId === requestId ? { ...m, meta: { ...m.meta, ...patch } } : m
    );
    setFeed(feedRef.current);
  };

  const sendDecision = async (
    kind: "approval" | "clarify",
    requestId: string,
    decision?: "approved" | "rejected",
    answer?: string
  ) => {
    const status = kind === "approval" ? (decision === "rejected" ? "rejected" : "approved") : "answered";
    try {
      const res = await fetch("/api/hermes/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, kind, requestId, decision, answer }),
      });
      const data = await res.json();
      updateMeta(requestId, { status, response: data.method ? `via ${data.method}` : data.error });
      if (!data.success) pushFeed([{ role: "event", text: `ERROR: ${data.error}` }]);
    } catch (err: any) {
      updateMeta(requestId, { status: "pending" });
      pushFeed([{ role: "event", text: `ERROR: ${err?.message || "gagal mengirim keputusan"}` }]);
    }
  };

  const sendMessage = async (overrideText?: string, voiceAlternatives?: string[]) => {
    const text = (typeof overrideText === "string" ? overrideText : input).trim();
    if (!text || isThinking) return;

    // --- Agent intent detection ---
    const intentAgent = detectAgentIntent(text, agents);
    let targetAgent: Agent = activeAgent ?? keemes; // null = pakai keemes sebagai executor default
    if (intentAgent && intentAgent.id !== (activeAgent?.id ?? "")) {
      // Switch agent + reset sesi (sesi Hermes terikat ke profil)
      setActiveAgent(intentAgent);
      targetAgent = intentAgent;
      sessionIdRef.current = null;
      pushFeed([{
        role: "sys",
        text: `Switched to ${intentAgent.displayName} (${intentAgent.role}) — sesi baru dimulai.`,
      }]);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsThinking(true);
    setStreamingStarted(false);
    setInput("");
    streamIndexRef.current = -1;
    pushFeed([{ role: "user", text }]);

    const appendDelta = (t: string) => {
      if (streamIndexRef.current === -1) {
        feedRef.current = [
          { id: uid(), role: "agent", text: t, ts: new Date().toISOString() },
          ...feedRef.current,
        ];
        streamIndexRef.current = 0;
        setStreamingStarted(true);
        if (ttsOnRef.current) playJarvisChime();
      } else {
        const m = feedRef.current[streamIndexRef.current];
        feedRef.current[streamIndexRef.current] = { ...m, text: m.text + t };
      }
      setFeed([...feedRef.current]);
    };

    const setStreamFinal = (t: string) => {
      if (streamIndexRef.current === -1) {
        pushFeed([{ role: "agent", text: t }]);
      } else {
        feedRef.current[streamIndexRef.current] = { ...feedRef.current[streamIndexRef.current], text: t };
        setFeed([...feedRef.current]);
      }
      // Voice cowok default (server default: George) — tanpa voice per-agent agar konsisten.
      if (ttsOnRef.current) speak(t);
    };

    try {
      const response = await fetch("/api/hermes/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: targetAgent.id,
          agentName: targetAgent.name,
          profile: targetAgent.hermesProfileKey,
          task: text,
          voiceAlternatives: voiceAlternatives ?? [],
          sessionId: sessionIdRef.current,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          let event = "message";
          let data = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload: any;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          if (event === "session") {
            sessionIdRef.current = payload.sessionId || sessionIdRef.current;
          } else if (event === "delta") {
            if (payload.text) appendDelta(payload.text);
          } else if (event === "event") {
            pushFeed([{ role: "event", text: `[${payload.type}] ${payload.text}` }]);
          } else if (event === "approval" || event === "clarify") {
            let requestId = `req_${Date.now()}`;
            let pretty = "";
            try {
              const parsed = JSON.parse(payload.text);
              requestId = parsed.requestId || requestId;
              pretty = JSON.stringify(parsed.payload ?? parsed, null, 1).slice(0, 600);
            } catch {
              pretty = payload.text;
            }
            pushFeed([{ role: event, text: pretty, meta: { kind: event, requestId, status: "pending" } }]);
          } else if (event === "complete") {
            sessionIdRef.current = payload.sessionId || sessionIdRef.current;
            setStreamFinal(payload.output || "...");
          } else if (event === "error") {
            pushFeed([{ role: "event", text: `ERROR: ${payload.message}` }]);
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") pushFeed([{ role: "event", text: "Dibatalkan." }]);
      else pushFeed([{ role: "event", text: `ERROR: ${err?.message || "gagal terhubung"}` }]);
    } finally {
      abortRef.current = null;
      setIsThinking(false);
      setStreamingStarted(false);
      streamIndexRef.current = -1;
    }
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      pushFeed([{ role: "event", text: "Voice input tidak didukung browser ini. Gunakan Chrome." }]);
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    rec.onstart = () => {
      console.log("[Voice] Mic aktif, mendengarkan...");
      setListening(true);
    };

    rec.onend = () => {
      console.log("[Voice] Mic berhenti.");
      setListening(false);
      recRef.current = null;
    };

    rec.onspeechstart = () => console.log("[Voice] Suara terdeteksi...");
    rec.onspeechend  = () => console.log("[Voice] Suara berhenti.");

    rec.onresult = (e: any) => {
      const alternatives: string[] = [];
      const result = e.results[0];
      for (let i = 0; i < result.length; i++) {
        alternatives.push(result[i].transcript.trim());
      }
      console.log("[Voice] Transkripsi:", alternatives);
      const best = alternatives[0] || "";
      pushFeed([{ role: "user", text: best }]);
      setInput("");
      void sendMessage(best, alternatives);
    };

    rec.onerror = (e: any) => {
      console.error("[Voice] Error:", e.error, e.message);
      setListening(false);
      recRef.current = null;
      const errMap: Record<string, string> = {
        "not-allowed":     "Izin mikrofon ditolak — aktifkan di pengaturan browser.",
        "no-speech":       "Tidak ada suara terdeteksi, coba lagi.",
        "audio-capture":   "Mikrofon tidak ditemukan atau sedang dipakai aplikasi lain.",
        "network":         "Koneksi bermasalah untuk speech recognition.",
        "aborted":         "Voice input dibatalkan.",
        "service-not-allowed": "Speech recognition tidak diizinkan di halaman ini.",
      };
      const msg = errMap[e.error] || `Voice error: ${e.error}`;
      pushFeed([{ role: "event", text: msg }]);
    };

    try {
      rec.start();
      console.log("[Voice] rec.start() dipanggil");
    } catch (err) {
      console.error("[Voice] Gagal start:", err);
      pushFeed([{ role: "event", text: `Gagal memulai voice: ${err}` }]);
      setListening(false);
    }
  };

  const stopVoice = () => {
    try {
      recRef.current?.stop();
    } catch { /* ignore */ }
  };

  // Selalu update ref agar useEffect spacebar tidak stale
  startVoiceRef.current = startVoice;
  stopVoiceRef.current  = stopVoice;

  const agentThemeHex = activeAgent?.themeColor.hex ?? KEETECH_THEME.hex;
  const agentDisplayName = activeAgent?.name ?? KEETECH_THEME.name;
  const agentRole = activeAgent?.role ?? KEETECH_THEME.role;

  const hasPending = feed.some((m) => m.meta?.status === "pending");
  const lastAgent = feed.find((m) => m.role === "agent");
  const bubbleText = !mounted
    ? ""
    : lastAgent
      ? lastAgent.text
      : GREETING.slice(0, greetingRevealed);
  const pad = (n: number, l: number) => String(n).padStart(l, "0");
  const tsLine = `${now.getFullYear()}.${pad(now.getMonth() + 1, 2)}.${pad(now.getDate(), 2)} // ${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[250px_1fr_330px] items-start">
      <div className="space-y-3 hidden lg:block">
        <CornerFrame className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-amber-400 leading-relaxed">
              HERMES //<br />TEMPORAL_SYNC
            </span>
            <span className="text-[8px] font-mono text-zinc-500 border border-white/10 px-1.5 py-0.5">CHRONO_LOCK</span>
          </div>
          <p className="text-[8px] font-mono tracking-[0.2em] text-zinc-500 uppercase">System timestamp</p>
          <p className="text-sm font-mono font-bold text-white">{mounted ? tsLine : "----.--.-- // --:--:--"}</p>
        </CornerFrame>

        <CornerFrame className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-amber-400 flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${statsOk ? "bg-emerald-400" : "bg-red-500"}`} />
              SYS_HARDWARE
            </span>
            <span className="text-[8px] font-mono text-zinc-400 border border-white/10 px-1.5 py-0.5">
              {statsOk ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <Gauge label="CPU LOAD" pct={statsOk && stats ? stats.cpuPct : null} extra={statsOk && stats ? `${stats.cores} core · ${stats.cpuModel || "hermes vm"}` : undefined} />
          <Gauge label="RAM" pct={statsOk && stats ? stats.ramPct : null} extra={statsOk && stats ? `${stats.ramUsedGb} / ${stats.ramTotalGb} GB` : undefined} />
          <Gauge label="DISK" pct={statsOk && stats ? stats.diskPct : null} />
          <div className="flex justify-between text-[9px] font-mono text-zinc-600 mt-1">
            <span className="truncate">{stats?.hostname ?? "—"}</span>
            <span>UPTIME {statsOk && stats ? fmtUptime(stats.uptimeSec) : "N/A"}</span>
          </div>
        </CornerFrame>

        <CornerFrame className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-amber-400 flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${env ? "bg-emerald-400" : "bg-red-500"}`} />
              ENV_TELEMETRY
            </span>
            <span className="text-[8px] font-mono text-zinc-400 border border-white/10 px-1.5 py-0.5">
              {env ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          {[
            ["LOCATION", env?.location || "-.-.-."],
            ["WEATHER", env?.weather || "-.-.-."],
            ["VISITOR IP", stats?.visitorIp || "-.-.-."],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline mb-2">
              <span className="text-[9px] font-mono tracking-[0.15em] text-zinc-500">{k}</span>
              <span className="text-[10px] font-mono text-zinc-300 truncate max-w-[140px]">{v}</span>
            </div>
          ))}
        </CornerFrame>
      </div>

      <div className="flex flex-col items-center justify-between min-w-0 min-h-[580px] h-full pb-2">
        <div className="w-full max-w-xl rounded-xl border border-white/10 bg-black/40 px-5 py-3 text-center mb-3">
          <p className="text-xs font-mono text-white whitespace-pre-wrap break-words">
            {bubbleText || "..."}
          </p>
        </div>

        <RadarSphere active={isThinking} />

        <div className="w-full flex flex-col items-center mt-auto">
          {/* Active Agent Badge */}
          <div
            className="flex items-center gap-2 mb-1.5 px-3 py-1 rounded-full border text-[9px] font-mono font-bold tracking-[0.15em] uppercase"
            style={{
              borderColor: agentThemeHex + "50",
              backgroundColor: agentThemeHex + "12",
              color: agentThemeHex,
            }}
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: agentThemeHex }}
            />
            {agentDisplayName} · {agentRole}
            {activeAgent !== null && (
              <button
                onClick={() => {
                  setActiveAgent(null);
                  sessionIdRef.current = null;
                  pushFeed([{ role: "sys", text: `Kembali ke KEETECH.` }]);
                }}
                className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                title="Kembali ke KEETECH"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Indicator Text Tepat Di Atas Dock (Dekat & Presisi) */}
          <div className="flex items-center gap-3 mb-2 text-[9px] font-mono tracking-[0.15em]">
            {/* Neural matrix status */}
            <div className="flex items-center gap-1.5 text-zinc-400">
              <span
                className={`size-1.5 rounded-full ${isThinking ? "animate-ping" : ""}`}
                style={{ backgroundColor: isThinking ? agentThemeHex : "#52525b" }}
              />
              <span className={isThinking ? "font-bold" : "text-zinc-400"} style={isThinking ? { color: agentThemeHex } : undefined}>
                {isThinking ? "NEURAL_MATRIX // PROCESSING" : "STANDBY"}
              </span>
            </div>
            {/* Local agent status dot */}
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border"
              style={localAgentOnline
                ? { borderColor: "#22c55e50", backgroundColor: "#22c55e12", color: "#22c55e" }
                : { borderColor: "#52525b50", backgroundColor: "#52525b12", color: "#52525b" }
              }
              title={localAgentOnline ? "Local Agent aktif — laptop dapat dikontrol" : "Local Agent offline — jalankan python3 local_agent.py"}
            >
              <span
                className={`size-1.5 rounded-full ${localAgentOnline ? "animate-pulse" : ""}`}
                style={{ backgroundColor: localAgentOnline ? "#22c55e" : "#52525b" }}
              />
              <span className="text-[8px] font-mono font-bold">
                {localAgentOnline ? "LOCAL" : "NO_LOCAL"}
              </span>
            </div>
          </div>

          <div
            className={`w-full transition-all duration-500 ease-out flex justify-center ${showKeyboard ? "max-w-xl" : "max-w-xs"
              }`}
          >
            {!showKeyboard ? (
              /* Mode Default: 3 Tombol Lingkaran Versi Kompak (TTS, Voice Input, Terminal/Command) */
              <div
                className={`inline-flex items-center gap-2 p-1.5 rounded-full border-[1.5px] bg-black/90 backdrop-blur-2xl shadow-[0_0_25px_rgba(245,158,11,0.2)] transition-all duration-300 ${listening ? "border-red-500/80 ring-2 ring-red-500/20" : ""
                  }`}
                style={!listening ? { borderColor: agentThemeHex + "cc" } : undefined}
              >
                {/* Button 1: TTS Toggle (Speaker with Sound Waves) */}
                <button
                  onClick={() => setTts(!ttsOn)}
                  className={`relative size-9 rounded-full border-[1.5px] flex items-center justify-center transition-all ${ttsOn
                      ? "border-amber-500/80 bg-amber-950/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)] hover:bg-amber-500/20"
                      : "border-zinc-700 bg-black/40 text-zinc-600 hover:text-zinc-400"
                    }`}
                  title={ttsOn ? "TTS Aktif — klik untuk mute" : "TTS Mute — klik untuk aktifkan"}
                >
                  <svg className="size-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                  {!ttsOn && <span className="absolute w-[1.5px] h-5 bg-zinc-400 rotate-45 rounded-full" />}
                </button>

                {/* Button 2: Voice Input (Microphone with Stand) */}
                <button
                  onClick={listening ? stopVoice : startVoice}
                  className={`relative size-9 rounded-full border-[1.5px] flex items-center justify-center transition-all ${listening
                      ? "border-red-500 bg-red-500/25 text-red-400 animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.5)]"
                      : "border-amber-500/80 bg-amber-950/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.25)] hover:bg-amber-500/20 hover:scale-105"
                    }`}
                  title={listening ? "Klik atau Space untuk berhenti" : "Voice input — klik atau tekan Space"}
                >
                  <svg className={`size-4 ${listening ? "text-red-400" : "text-amber-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                    <line x1="8" x2="16" y1="22" y2="22" />
                  </svg>
                  {listening && (
                    <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 animate-ping" />
                  )}
                  {/* Hint SPACE key */}
                  {!listening && (
                    <span className="absolute -bottom-4 text-[7px] font-mono text-zinc-600 tracking-widest pointer-events-none">SPACE</span>
                  )}
                </button>

                {/* Button 3: Command Prompt Trigger (>_ Icon) */}
                <button
                  onClick={() => setShowKeyboard(true)}
                  className="size-9 rounded-full border-[1.5px] border-amber-500/80 bg-amber-950/40 hover:bg-amber-500/20 text-amber-400 flex items-center justify-center transition-all shadow-[0_0_10px_rgba(245,158,11,0.25)] hover:scale-105"
                  title="Ketik perintah (Command Prompt)"
                >
                  <svg className="size-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="4" />
                    <path d="m8 9 3 3-3 3" />
                    <path d="M13 15h3" />
                  </svg>
                </button>
              </div>
            ) : (
              /* Mode Keyboard Aktif: Full Command Bar dengan Animasi Slide Kompak */
              <div
                className={`w-full flex items-center gap-2 rounded-full border-[1.5px] bg-black/90 backdrop-blur-2xl px-3 py-1.5 transition-all duration-300 shadow-[0_0_25px_rgba(245,158,11,0.2)] ${listening ? "border-red-500/80" : ""
                  }`}
                style={!listening ? { borderColor: agentThemeHex + "cc" } : undefined}
              >
                {/* TTS Button di dalam bar */}
                <button
                  onClick={() => setTts(!ttsOn)}
                  className={`size-8 shrink-0 rounded-full flex items-center justify-center transition-all ${ttsOn
                      ? "text-amber-400 bg-amber-950/60 border border-amber-500/40"
                      : "text-zinc-600 hover:text-zinc-400 bg-white/[0.03]"
                    }`}
                  title={ttsOn ? "TTS aktif" : "TTS mute"}
                >
                  <svg className="size-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                  {!ttsOn && <span className="absolute w-[1.5px] h-4 bg-zinc-500 rotate-45 rounded-full" />}
                </button>

                {/* Voice Button di dalam bar */}
                <button
                  onClick={listening ? stopVoice : startVoice}
                  className={`size-8 shrink-0 rounded-full flex items-center justify-center transition-all ${listening ? "text-red-400 bg-red-400/20" : "text-zinc-400 hover:text-amber-400"
                    }`}
                  title={listening ? "Berhenti" : "Voice input"}
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                    <line x1="8" x2="16" y1="22" y2="22" />
                  </svg>
                </button>

                {/* Tombol Collapse / Tutup Keyboard (>_ Icon) */}
                <button
                  onClick={() => setShowKeyboard(false)}
                  className="size-7.5 shrink-0 rounded-full flex items-center justify-center text-amber-400/80 hover:text-amber-300 transition-colors"
                  title="Tutup (atau tekan Esc)"
                >
                  <svg className="size-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="4" />
                    <path d="m8 9 3 3-3 3" />
                    <path d="M13 15h3" />
                  </svg>
                </button>

                <span className="w-px h-5 bg-white/15 mx-0.5 shrink-0" />
                <span className="text-xs font-mono font-bold text-amber-400 select-none shrink-0">&gt;</span>

                {/* Text input field */}
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isThinking && !hasPending) sendMessage();
                    if (e.key === "Escape") setShowKeyboard(false);
                  }}
                  disabled={hasPending}
                  placeholder="Type your command..."
                  className="flex-1 min-w-0 bg-transparent text-xs font-mono text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50 px-1.5"
                />

                {/* Processing indicator */}
                {isThinking && (
                  <span className="flex items-center gap-[2px] mr-1 shrink-0" title="memproses">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-[2.5px] h-3 rounded bg-amber-400 animate-pulse"
                        style={{ animationDelay: `${i * 140}ms` }}
                      />
                    ))}
                  </span>
                )}

                {/* SEND / STOP Button */}
                <button
                  onClick={isThinking ? () => abortRef.current?.abort() : () => sendMessage()}
                  disabled={(!isThinking && !input.trim()) || hasPending}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md ${isThinking
                      ? "bg-red-500 text-white hover:bg-red-400"
                      : "bg-amber-600 text-black hover:bg-amber-500"
                    }`}
                >
                  {isThinking ? "STOP" : "SEND"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/25 bg-black/50 backdrop-blur-sm flex flex-col h-[600px] hidden lg:flex">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
          <span className="text-[9px] font-mono font-bold tracking-[0.2em] leading-relaxed" style={{ color: agentThemeHex }}>
            {agentDisplayName} //<br />TERMINAL_FEED
          </span>
          <div className="flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: agentThemeHex }}
            />
            <span className="text-[8px] font-mono text-zinc-500 border border-white/10 px-1.5 py-0.5">LIVE_LOGS</span>
            {/* Local agent pill di terminal header */}
            <span
              className="text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border"
              style={localAgentOnline
                ? { borderColor: "#22c55e50", color: "#22c55e", backgroundColor: "#22c55e10" }
                : { borderColor: "#3f3f4650", color: "#71717a", backgroundColor: "transparent" }
              }
              title={localAgentOnline ? "Local Agent online" : "Local Agent offline"}
            >
              {localAgentOnline ? "🖥 LOCAL_ON" : "LOCAL_OFF"}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {feed.length === 0 && <p className="text-[9px] font-mono text-zinc-600">Menunggu perintah operator...</p>}
          {feed.map((m) => (
            <div key={m.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[8px] font-mono font-bold tracking-[0.15em] uppercase ${m.role === "user" ? "text-amber-400" : m.role === "agent" ? "text-emerald-400" : m.role === "sys" ? "text-sky-400" : "text-cyan-300/70"
                    }`}
                >
                  {m.role === "user" ? "KEENAN" : m.role === "agent" ? agentDisplayName : m.role === "sys" ? "SYSTEM" : m.role.toUpperCase()}
                </span>
                <span className="text-[8px] font-mono text-zinc-600">
                  {new Date(m.ts).toLocaleTimeString("id-ID", { hour12: false })}
                </span>
              </div>
              <p className="text-[10px] font-mono text-zinc-200 whitespace-pre-wrap break-words">{m.text}</p>
              {m.meta && m.meta.status === "pending" && (
                <div className="flex gap-1.5 mt-1.5">
                  {m.meta.kind === "approval" ? (
                    <>
                      <button
                        onClick={() => sendDecision("approval", m.meta!.requestId, "approved")}
                        className="px-2 py-0.5 rounded bg-emerald-500 text-black text-[8px] font-bold"
                      >
                        APPROVE
                      </button>
                      <button
                        onClick={() => sendDecision("approval", m.meta!.requestId, "rejected")}
                        className="px-2 py-0.5 rounded bg-red-500 text-white text-[8px] font-bold"
                      >
                        REJECT
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        value={clarifyDraft[m.meta.requestId] || ""}
                        onChange={(e) => setClarifyDraft((d) => ({ ...d, [m.meta!.requestId]: e.target.value }))}
                        placeholder="Jawab..."
                        className="flex-1 bg-black/40 border border-white/15 rounded px-1.5 py-0.5 text-[9px] text-white"
                      />
                      <button
                        onClick={() => {
                          const meta = m.meta;
                          const answer = meta ? clarifyDraft[meta.requestId]?.trim() : "";
                          if (meta && answer) sendDecision("clarify", meta.requestId, undefined, answer);
                        }}
                        className="px-2 py-0.5 rounded bg-amber-500 text-black text-[8px] font-bold"
                      >
                        SEND
                      </button>
                    </>
                  )}
                </div>
              )}
              {m.meta && m.meta.status !== "pending" && (
                <p className="text-[8px] font-mono text-zinc-500 mt-1">{m.meta.status.toUpperCase()}</p>
              )}
            </div>
          ))}
          <div className="pt-2 border-t border-white/5">
            <p className="text-[8px] font-mono text-zinc-600 tracking-[0.15em] mb-1">SYSTEM LOGS</p>
            {activities.slice(0, 6).map((a) => (
              <p key={a.id} className="text-[8px] font-mono text-zinc-600 truncate">
                {new Date(a.ts).toLocaleTimeString("id-ID", { hour12: false })} {a.agentName} {a.text}
              </p>
            ))}
          </div>
        </div>
        <p className="text-center text-[8px] font-mono text-zinc-600 py-2 border-t border-white/5 tracking-[0.2em]">
          ENCRYPTED TRANSMISSION STREAM
        </p>
      </div>

      {hasPending && (
        <p className="lg:col-span-3 text-center text-[9px] font-mono text-amber-400/80 animate-pulse">
          Selesaikan approval/clarify di TERMINAL_FEED dulu — input terkunci.
        </p>
      )}
    </div>
  );
}
