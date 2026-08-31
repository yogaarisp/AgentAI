"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Agent } from "@/lib/agents";

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

const GREETING = "Hai Keenan, I'm Jarvis";

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

    const N = 750;
    const pts: { x: number; y: number; z: number; s: number; c: number }[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * 2.399963229728653;
      pts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, s: 0.6 + Math.random() * 1.4, c: Math.random() });
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
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;

      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = "rgba(251,191,36,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.02, R * 0.34, -0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.02, R * 0.34, 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(251,191,36,0.18)";
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + t * 0.05;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R * 1.08, cy + Math.sin(a) * R * 1.08);
        ctx.lineTo(cx + Math.cos(a) * R * 1.14, cy + Math.sin(a) * R * 1.14);
        ctx.stroke();
      }
      ctx.setLineDash([2, 6]);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.18, cy);
      ctx.lineTo(cx + R * 1.18, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - R * 1.18);
      ctx.lineTo(cx, cy + R * 1.18);
      ctx.stroke();
      ctx.setLineDash([]);

      const rotY = t * 0.14;
      const cY = Math.cos(rotY);
      const sY = Math.sin(rotY);
      const tilt = 0.35 + Math.sin(t * 0.1) * 0.06;
      const cX = Math.cos(tilt);
      const sX = Math.sin(tilt);

      for (const p of pts) {
        const x1 = p.x * cY + p.z * sY;
        const z1 = -p.x * sY + p.z * cY;
        const y2 = p.y * cX - z1 * sX;
        const z2 = p.y * sX + z1 * cX;
        const s = 1 / (2.6 - z2);
        const px = cx + x1 * R * s;
        const py = cy - y2 * R * s;
        const depth = (z2 + 1) / 2;
        ctx.globalAlpha = 0.15 + depth * 0.75;
        ctx.fillStyle = p.c > 0.82 ? "#ffffff" : "#fbbf24";
        ctx.beginPath();
        ctx.arc(px, py, p.s * (0.5 + depth * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      g.addColorStop(0, active ? "rgba(251,191,36,0.22)" : "rgba(251,191,36,0.10)");
      g.addColorStop(1, "rgba(251,191,36,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = active ? "#fbbf24" : "#a1a1aa";
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(active ? "● THINKING" : "● STANDBY", cx, cy + R * 1.08 + 26);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  return <canvas ref={canvasRef} className="w-full h-[300px] md:h-[380px] block" />;
}

export default function OpsCenter({ agents }: { agents: Agent[] }) {
  const keemes = agents.find((a) => a.hermesProfileKey === "keehermes") ?? agents[0];
  const [stats, setStats] = useState<SysStats | null>(null);
  const [statsOk, setStatsOk] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [greetingRevealed, setGreetingRevealed] = useState(0);
  const [feed, setFeed] = useState<FeedMsg[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const [listening, setListening] = useState(false);
  const [clarifyDraft, setClarifyDraft] = useState<Record<string, string>>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const feedRef = useRef<FeedMsg[]>([]);
  const streamIndexRef = useRef<number>(-1);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pushFeed = useCallback((msgs: Omit<FeedMsg, "id" | "ts">[]) => {
    const stamped = msgs.map((m) => ({ ...m, id: uid(), ts: new Date().toISOString() }));
    feedRef.current = [...stamped, ...feedRef.current];
    setFeed(feedRef.current);
  }, []);

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(new Date()), 47);
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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isThinking || !keemes) return;
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
      } else {
        const m = feedRef.current[streamIndexRef.current];
        feedRef.current[streamIndexRef.current] = { ...m, text: m.text + t };
      }
      setFeed([...feedRef.current]);
    };

    const setStreamFinal = (t: string) => {
      if (streamIndexRef.current === -1) {
        pushFeed([{ role: "agent", text: t }]);
        return;
      }
      feedRef.current[streamIndexRef.current] = { ...feedRef.current[streamIndexRef.current], text: t };
      setFeed([...feedRef.current]);
    };

    try {
      const response = await fetch("/api/hermes/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: keemes.id,
          agentName: "KEEMES",
          profile: "keehermes",
          task: text,
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
      pushFeed([{ role: "event", text: "Voice input tidak didukung browser ini." }]);
      return;
    }
    const rec = new SR();
    rec.lang = "id-ID";
    rec.interimResults = false;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setInput((prev: string) => (prev ? prev + " " : "") + t);
    };
    rec.start();
  };

  const hasPending = feed.some((m) => m.meta?.status === "pending");
  const lastAgent = feed.find((m) => m.role === "agent");
  const bubbleText = !mounted
    ? ""
    : lastAgent
      ? lastAgent.text
      : GREETING.slice(0, greetingRevealed);
  const pad = (n: number, l: number) => String(n).padStart(l, "0");
  const tsLine = `${now.getFullYear()}.${pad(now.getMonth() + 1, 2)}.${pad(now.getDate(), 2)} // ${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}.${pad(now.getMilliseconds(), 3)}`;

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
          <p className="text-sm font-mono font-bold text-white">{mounted ? tsLine : "----.--.-- // --:--:--.---"}</p>
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
              <span className="size-1.5 rounded-full bg-red-500" />
              ENV_TELEMETRY
            </span>
            <span className="text-[8px] font-mono text-zinc-400 border border-white/10 px-1.5 py-0.5">OFFLINE</span>
          </div>
          {[
            ["LOCATION", "-.-.-."],
            ["WEATHER", "-.-.-."],
            ["VISITOR IP", stats?.visitorIp || "-.-.-."],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-baseline mb-2">
              <span className="text-[9px] font-mono tracking-[0.15em] text-zinc-500">{k}</span>
              <span className="text-[10px] font-mono text-zinc-300 truncate max-w-[140px]">{v}</span>
            </div>
          ))}
        </CornerFrame>
      </div>

      <div className="flex flex-col items-center min-w-0">
        <div className="w-full max-w-xl rounded-xl border border-white/10 bg-black/40 px-5 py-3 text-center mb-3">
          <p className="text-xs font-mono text-white whitespace-pre-wrap break-words">
            {bubbleText || "..."}
          </p>
        </div>

        <RadarSphere active={isThinking} />

        <div className="flex items-center gap-4 mt-4 mb-3">
          <button
            onClick={startVoice}
            className={`size-12 rounded-full border border-amber-400/40 flex items-center justify-center text-amber-400 hover:bg-amber-400/10 transition-all ${listening ? "animate-pulse bg-amber-400/20" : ""}`}
            title="Voice input"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
            </svg>
          </button>
          <button
            onClick={() => inputRef.current?.focus()}
            className="size-14 rounded-full border-2 border-amber-400/70 flex items-center justify-center text-amber-400 hover:bg-amber-400/10 transition-all"
            title="Ketik perintah"
          >
            <svg className="size-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </button>
          <div className={`size-12 rounded-full border border-amber-400/40 flex items-center justify-center gap-[3px] ${isThinking ? "text-amber-400" : "text-zinc-600"}`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`w-[3px] rounded bg-current ${isThinking ? "animate-pulse" : ""}`} style={{ height: isThinking ? 16 : 10, animationDelay: `${i * 120}ms` }} />
            ))}
          </div>
        </div>

        <div className="w-full max-w-xl flex items-center gap-2 rounded-xl border border-amber-400/25 bg-black/50 px-4 py-2.5">
          <span className="text-xs font-mono text-amber-400">&gt;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isThinking && !hasPending) sendMessage();
            }}
            disabled={hasPending}
            placeholder="Type your command..."
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={isThinking ? () => abortRef.current?.abort() : sendMessage}
            disabled={(!isThinking && !input.trim()) || hasPending}
            className={`px-4 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-all disabled:opacity-40 ${isThinking ? "bg-red-500 text-white" : "bg-amber-500/80 text-black hover:bg-amber-400"}`}
          >
            {isThinking ? "STOP" : "SEND"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-400/25 bg-black/50 backdrop-blur-sm flex flex-col h-[600px] hidden lg:flex">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
          <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-amber-400 leading-relaxed">
            KEEMES //<br />TERMINAL_FEED
          </span>
          <span className="text-[8px] font-mono text-zinc-500 border border-white/10 px-1.5 py-0.5">LIVE_LOGS</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {feed.length === 0 && <p className="text-[9px] font-mono text-zinc-600">Menunggu perintah operator...</p>}
          {feed.map((m) => (
            <div key={m.id} className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2">
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[8px] font-mono font-bold tracking-[0.15em] uppercase ${
                    m.role === "user" ? "text-amber-400" : m.role === "agent" ? "text-emerald-400" : "text-cyan-300/70"
                  }`}
                >
                  {m.role === "user" ? "OPERATOR" : m.role === "agent" ? "KEEMES_AI" : m.role.toUpperCase()}
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
