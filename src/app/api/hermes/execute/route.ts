import { NextRequest } from "next/server";
import { getHermesSession, getWsTicket, clearHermesSession } from "@/lib/hermes-server";
import { setRun, getRun, removeRun } from "@/lib/hermes-gateway-registry";
import { logActivity } from "@/lib/activity-log";
import { loadModelSettings } from "@/lib/model-settings";
import { callDirectLlm } from "@/lib/llm-direct";
import { agents } from "@/lib/agents";
import {
  isLocalAgentOnline,
  enqueueCommand,
  waitForResult,
} from "@/lib/agent-queue";

interface GatewayFrame {
  id?: number | string | null;
  method?: string;
  params?: {
    session_id?: string;
    type?: string;
    payload?: { text?: string; message?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  result?: { session_id?: string; [key: string]: unknown };
  error?: { message?: string; code?: number };
}

type FrameKind = "delta" | "tool" | "status" | "approval" | "clarify" | "error";

interface FrameUpdate {
  kind: FrameKind;
  type: string;
  text: string;
}

function deriveRequestId(payload: Record<string, unknown> | undefined, fallback: string): string {
  if (!payload) return fallback;
  const cand =
    (payload as any).id ??
    (payload as any).request_id ??
    (payload as any).requestId ??
    (payload as any).approval_id;
  if (typeof cand === "string" || typeof cand === "number") return String(cand);
  return fallback;
}

async function runHermesTask(opts: {
  profile: string;
  task: string;
  existingSessionId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onSession?: (sessionId: string) => void;
  onFrame?: (u: FrameUpdate) => void;
}): Promise<{ output: string; events: string[]; sessionId: string }> {
  const { profile, task, existingSessionId, timeoutMs = 180_000, signal, onSession, onFrame } = opts;
  const session = await getHermesSession();
  const ticket = await getWsTicket();
  const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";
  const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/ws?ticket=${encodeURIComponent(ticket)}`;
  const socket = new WebSocket(wsUrl);
  const events: string[] = [];
  let output = "";
  let sessionId = "";
  let aborted = false;
  let nextId = 1;
  let lastErrEvent = "";
  let retriedNewSession = false;
  const usedExisting = Boolean(existingSessionId);
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const cleanup = () => { try { socket.close(); } catch { /* noop */ } };
  const rejectAll = (e: Error) => { for (const [, p] of pending) p.reject(e); pending.clear(); };
  const onAbort = () => { aborted = true; rejectAll(new Error("Dibatalkan")); cleanup(); };
  if (signal) {
    if (signal.aborted) aborted = true;
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const rpc = <T,>(method: string, params: Record<string, unknown>, timeoutMsEach = 60_000): Promise<T> => {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout RPC ${method}`));
      }, timeoutMsEach);
      pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v as T); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
  };
  const createSession = async (): Promise<string> => {
    const created = await rpc<{ session_id: string }>(
      "session.create",
      { profile, title: `Dashboard: ${task.slice(0, 60)}` },
      30_000
    );
    const sid = created.session_id;
    if (!sid) throw new Error("session.create tidak mengembalikan session_id");
    sessionId = sid;
    onSession?.(sid);
    setRun(sid, {
      socket,
      call: (method, params, timeoutMsEach) => rpc(method, params, timeoutMsEach),
      pendingDecision: false,
    });
    return sid;
  };
  const submitPrompt = async (sid: string) => {
    try {
      await rpc("prompt.submit", { session_id: sid, text: task }, timeoutMs);
    } catch (e: any) {
      lastErrEvent = e?.message || "";
    }
  };
  try {
    if (aborted) throw new Error("Dibatalkan");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout menyambung WebSocket Hermes")), 20_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Gagal menyambung WebSocket Hermes")); }, { once: true });
    });
    socket.addEventListener("message", (ev) => {
      if (aborted) return;
      let frame: GatewayFrame;
      try { frame = JSON.parse(String(ev.data)); } catch { return; }
      if (frame.id != null && (frame.result !== undefined || frame.error)) {
        const p = pending.get(Number(frame.id));
        if (p) {
          pending.delete(Number(frame.id));
          if (frame.error) p.reject(new Error(frame.error.message || "Hermes RPC error"));
          else p.resolve(frame.result);
        }
        return;
      }
      const type = frame.params?.type || frame.method?.replace(/^gateway\./, "");
      const payloadObj = frame.params as Record<string, unknown> | undefined;
      const sanitize = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ");
      if (type === "message.delta" && frame.params?.payload?.text) {
        output += frame.params.payload.text;
        onFrame?.({ kind: "delta", type, text: frame.params.payload.text });
      } else if (type === "message.complete") {
        const text = frame.params?.payload?.text;
        if (text) output = text;
      } else if (type === "approval.request" || type === "clarify.request") {
        const requestId = deriveRequestId(payloadObj, `req_${Date.now()}`);
        const text = sanitize(JSON.stringify(frame.params?.payload ?? {})).slice(0, 1200);
        events.push(`[${type}] ${text}`);
        onFrame?.({
          kind: type === "approval.request" ? "approval" : "clarify",
          type,
          text: JSON.stringify({ requestId, payload: frame.params?.payload ?? {} }),
        });
        const entry = sessionId ? getRun(sessionId) : undefined;
        if (entry) entry.pendingDecision = true;
      } else if (type === "error") {
        const text = sanitize(JSON.stringify(frame.params?.payload ?? {})).slice(0, 240);
        lastErrEvent = text;
        events.push(`[${type}] ${text}`);
        onFrame?.({ kind: "error", type, text });
      } else if (type && ["tool.start", "tool.complete", "status.update", "thinking.delta"].includes(type)) {
        if (events.length < 50) events.push(sanitize(`[${type}] ${JSON.stringify(frame.params?.payload ?? {})}`).slice(0, 160));
        if (type !== "thinking.delta") onFrame?.({ kind: type === "status.update" ? "status" : "tool", type, text: sanitize(JSON.stringify(frame.params?.payload ?? {})).slice(0, 160) });
      }
    });
    if (existingSessionId) {
      sessionId = existingSessionId;
      onSession?.(sessionId);
      setRun(sessionId, {
        socket,
        call: (method, params, timeoutMsEach) => rpc(method, params, timeoutMsEach),
        pendingDecision: false,
      });
    } else {
      await createSession();
    }
    await submitPrompt(sessionId);
    const hardCap = Date.now() + 15 * 60_000;
    let deadline = Date.now() + timeoutMs;
    while (Date.now() < Math.min(deadline, hardCap) && !output && !aborted) {
      if (!retriedNewSession && usedExisting && /session not found/i.test(lastErrEvent)) {
        retriedNewSession = true;
        lastErrEvent = "";
        output = "";
        removeRun(sessionId);
        await createSession();
        onFrame?.({ kind: "status", type: "info", text: "Sesi lama tidak ada di gateway — sesi baru dibuat otomatis." });
        await submitPrompt(sessionId);
      }
      if (/session not found/i.test(lastErrEvent) && retriedNewSession && output) break;
      await new Promise((r) => setTimeout(r, 400));
      const entry = getRun(sessionId);
      if (entry?.pendingDecision) deadline = Math.max(deadline, Date.now() + 45_000);
    }
    if (aborted) throw new Error("Dibatalkan");
    if (!output) {
      if (/session not found/i.test(lastErrEvent)) {
        throw new Error("Session not found — sesi lama sudah hilang di gateway, kirim ulang pesanmu untuk mulai sesi baru.");
      }
      throw new Error("Tidak ada output dari Hermes sebelum timeout");
    }
    return { output, events, sessionId };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (sessionId) removeRun(sessionId);
    cleanup();
  }
}

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Local Agent: deteksi apakah task adalah perintah aksi lokal di laptop
// ---------------------------------------------------------------------------

interface LocalAction {
  action: "shell" | "open_app" | "close_app" | "screenshot" | "system_info" | "notify";
  params: Record<string, unknown>;
  label: string;
}

/**
 * Coba parse teks user jadi local action.
 * Pola sederhana — cocok untuk perintah voice natural bahasa Indonesia & EN.
 * Mengembalikan null jika bukan perintah lokal.
 */
function parseLocalAction(text: string): LocalAction | null {
  const t = text.trim().toLowerCase();

  // Screenshot
  if (/screenshot|tangkap layar|capture screen|ambil gambar layar|screen shot/.test(t)) {
    return { action: "screenshot", params: {}, label: "screenshot layar" };
  }

  // System info — toleran variasi transkripsi
  if (/info\s*(sistem|laptop|komputer|cpu|ram|memory|disk|mesin)|system\s*info|cek\s*resource|berapa\s*(ram|cpu|memory|memori)|spesifikasi|spec\s*laptop/.test(t)) {
    return { action: "system_info", params: {}, label: "cek info sistem" };
  }

  // Buka / open aplikasi — lebih toleran spasi dan variasi
  // Tangkap: "buka chrome", "open chrome", "buka aplikasi chrome",
  //          "bukahin chrome", "cobain buka chrome", "tolong buka whatsapp"
  const openMatch = t.match(
    /(?:tolong\s+)?(?:buka(?:in|kan)?|open|jalankan|launch|aktifkan|nyalain|start)\s+(?:aplikasi\s+|app\s+)?([a-z][a-z0-9\s\-\.]{1,40}?)(?:\s*$|\.app|\s+dong|\s+sekarang|\s+ya|\s+please)/i
  );
  if (openMatch) {
    const appName = openMatch[1].trim();
    // Jangan salah tangkap perintah LLM
    const llmKeywords = /^(?:code|program|skrip|script|fungsi|function|api|web|buat|create|tulis|write|sebuah|sebuah|halaman|website)/;
    if (appName.length >= 2 && !llmKeywords.test(appName)) {
      return {
        action: "open_app",
        params: { app: appName },
        label: `buka ${appName}`,
      };
    }
  }

  // Tutup / quit aplikasi
  // Tangkap: "tutup chrome", "close whatsapp", "quit spotify",
  //          "tutup aplikasi chrome", "matiin chrome", "tolong tutup wa"
  const closeMatch = t.match(
    /(?:tolong\s+)?(?:tutup(?:in|kan)?|close|quit|keluar\s+dari|matiin|stop|hentikan|kill)\s+(?:aplikasi\s+|app\s+)?([a-z][a-z0-9\s\-\.]{1,40}?)(?:\s*$|\.app|\s+dong|\s+sekarang|\s+ya|\s+please)/i
  );
  if (closeMatch) {
    const appName = closeMatch[1].trim();
    const llmKeywords = /^(?:code|program|skrip|script|fungsi|function|api|web|buat|server|proses)/;
    if (appName.length >= 2 && !llmKeywords.test(appName)) {
      return {
        action: "close_app",
        params: { app: appName },
        label: `tutup ${appName}`,
      };
    }
  }

  // Notifikasi desktop
  const notifMatch = t.match(
    /(?:kirim|tampilkan|buat|kasih)\s+(?:notifikasi|notif|notification|peringatan)\s+(?:dengan\s+(?:pesan|isi)\s+)?["']?(.+?)["']?\s*$/i
  );
  if (notifMatch) {
    return {
      action: "notify",
      params: { message: notifMatch[1].trim() },
      label: `notifikasi: ${notifMatch[1].trim().slice(0, 40)}`,
    };
  }

  // Shell command eksplisit
  const shellMatch = t.match(
    /(?:jalankan|run|eksekusi|execute)\s+(?:di\s+terminal\s+)?(?:command\s+|perintah\s+)?["'`](.+?)["'`]/i
  );
  if (shellMatch) {
    return {
      action: "shell",
      params: { command: shellMatch[1].trim() },
      label: `shell: ${shellMatch[1].trim().slice(0, 50)}`,
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const profile = String(body.profile || process.env.HERMES_DEFAULT_PROFILE || "devbot");
  const task = String(body.task || "");
  const agentId = String(body.agentId || profile);
  const agentName = String(body.agentName || profile);
  // Alternatif transkripsi voice — dikirim client saat input dari mic
  const voiceAlternatives: string[] = Array.isArray(body.voiceAlternatives)
    ? (body.voiceAlternatives as unknown[]).map(String).slice(0, 5)
    : [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 15_000);
      const opts = {
        profile,
        task,
        existingSessionId: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : undefined,
        signal: req.signal,
        onSession: (id: string) => send("session", { sessionId: id }),
        onFrame: (u: { kind: string; type: string; text: string }) => {
          if (u.kind === "delta") {
            send("delta", { text: u.text });
          } else if (u.kind === "approval" || u.kind === "clarify") {
            send(u.kind, { type: u.type, text: u.text });
          } else if (u.kind === "thinking") {
            /* ignore */
          } else {
            send("event", { type: u.type, text: u.text });
          }
        },
      };
      let output = "";
      const agentMeta = agents.find((a) => a.id === agentId);
      const modelSettings = loadModelSettings();

      // -----------------------------------------------------------------------
      // Local Agent shortcut — kalau task adalah aksi lokal & agent online
      // Coba task utama dulu, lalu semua voice alternatives
      // -----------------------------------------------------------------------
      const allCandidates = [task, ...voiceAlternatives.filter(v => v !== task)];
      let localAction: LocalAction | null = null;
      for (const candidate of allCandidates) {
        localAction = parseLocalAction(candidate);
        if (localAction) break;
      }
      if (localAction && isLocalAgentOnline()) {
        try {
          send("event", { type: "info", text: `🖥️ Local agent: ${localAction.label}...` });
          logActivity({ agentId, agentName, type: "tool", text: `local: ${localAction.label}` });

          const cmd = enqueueCommand({
            action: localAction.action,
            params: localAction.params,
            requestedBy: agentId,
          });

          // Tunggu Python agent eksekusi (timeout 60s)
          const result = await waitForResult(cmd.id);
          const resultText = result.result || result.error || "Selesai tanpa output.";

          logActivity({ agentId, agentName, type: "tool", text: `local selesai: ${resultText.slice(0, 80)}` });
          send("complete", {
            output: resultText,
            sessionId: "",
            events: [`[local:${localAction.action}] ${resultText.slice(0, 120)}`],
            via: `local:${localAction.action}`,
          });
          closed = true;
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* noop */ }
          return;
        } catch (err: any) {
          // Local agent timeout atau error — fallback ke LLM normal
          send("event", {
            type: "info",
            text: `Local agent gagal (${err?.message || "timeout"}) — tanya ke AI...`,
          });
        }
      }

      const runWithHermes = async (profileOverride?: string) => {
        const useProfile = profileOverride || profile;
        const runOpts = useProfile === profile ? opts : { ...opts, profile: useProfile };
        let result;
        try {
          result = await runHermesTask(runOpts);
        } catch (err: any) {
          const msg = err?.message || "";
          if (/HTTP 401/.test(msg)) {
            clearHermesSession();
            send("event", { type: "info", text: "Login Hermes kedaluwarsa — login ulang otomatis..." });
            result = await runHermesTask(runOpts);
          } else if (/Rate limit login Hermes/.test(msg)) {
            send("event", { type: "info", text: "Hermes sedang rate-limit login — tunggu ±1 menit lalu kirim ulang pesanmu." });
            throw err;
          } else {
            throw err;
          }
        }
        return result;
      };

      // Rantai eksekusi: primary LLM → fallback per-agent (jika diisi) → Hermes gateway
      // dengan profil agent masing-masing sesuai setup server Hermes.
      const chain: { label: string; run: () => Promise<{ text: string; sessionId?: string; events?: string[] }> }[] = [];
      if (modelSettings.primary.apiKey) {
        chain.push({
          label: `primary:${modelSettings.primary.model}`,
          run: () =>
            callDirectLlm(modelSettings.primary, {
              task,
              agentName,
              agentRole: agentMeta?.role,
              signal: req.signal,
            }),
        });
      }
      const agentFallback = agentId ? modelSettings.perAgent[agentId] : undefined;
      if (agentFallback?.apiKey) {
        chain.push({
          label: `fallback:${agentId}:${agentFallback.model}`,
          run: () =>
            callDirectLlm(agentFallback, {
              task,
              agentName,
              agentRole: agentMeta?.role,
              signal: req.signal,
            }),
        });
      }
      // Fallback per-agent: profil Hermes milik agent itu sendiri
      // (keemes→keehermes, kirana→kirana, keedev→keedev, dst).
      const agentHermesProfile = agentMeta?.hermesProfileKey || profile;
      chain.push({
        label: `hermes:${agentHermesProfile}`,
        run: async () => {
          const r = await runWithHermes(agentHermesProfile);
          return { text: r.output, sessionId: r.sessionId, events: r.events };
        },
      });

      let lastError: Error | null = null;
      try {
        logActivity({ agentId, agentName, type: "task", text: "memulai: " + task.slice(0, 60) });
        for (const step of chain) {
          try {
            const result = await step.run();
            output = result.text;
            logActivity({ agentId, agentName, type: "task", text: "selesai via " + step.label });
            send("complete", {
              output: result.text,
              sessionId: result.sessionId ?? "",
              events: result.events ?? [],
              via: step.label,
            });
          } catch (err: any) {
            lastError = err;
            if (req.signal.aborted) throw err;
            send("event", {
              type: "info",
              text: `${step.label} gagal (${err?.message || "error"}) — lanjut ke provider berikutnya...`,
            });
            continue;
          }
          break;
        }
        if (!output) throw lastError ?? new Error("Semua provider gagal");
      } catch (err: any) {
        logActivity({ agentId, agentName, type: "error", text: (err?.message || "bridge gagal").slice(0, 100) });
        send("error", { message: err?.message || "Semua provider gagal", partial: output });
      }
      closed = true;
      clearInterval(heartbeat);
      try { controller.close(); } catch { /* noop */ }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
