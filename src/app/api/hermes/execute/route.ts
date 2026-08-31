import { NextRequest } from "next/server";
import { getHermesSession, getWsTicket, clearHermesSession } from "@/lib/hermes-server";
import { setRun, getRun, removeRun } from "@/lib/hermes-gateway-registry";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const profile = String(body.profile || process.env.HERMES_DEFAULT_PROFILE || "devbot");
  const task = String(body.task || "");
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
      try {
        let result;
        try {
          result = await runHermesTask(opts);
        } catch (err: any) {
          const msg = err?.message || "";
          if (/HTTP 401/.test(msg)) {
            clearHermesSession();
            send("event", { type: "info", text: "Login Hermes kedaluwarsa — login ulang otomatis..." });
            result = await runHermesTask(opts);
          } else if (/Rate limit login Hermes/.test(msg)) {
            send("event", { type: "info", text: "Hermes sedang rate-limit login — tunggu ±1 menit lalu kirim ulang pesanmu." });
            throw err;
          } else {
            throw err;
          }
        }
        output = result.output;
        send("complete", { output: result.output, sessionId: result.sessionId, events: result.events });
      } catch (err: any) {
        send("error", { message: err?.message || "Hermes bridge gagal", partial: output });
      }
      closed = true;
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
