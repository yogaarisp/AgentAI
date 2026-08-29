import { NextRequest, NextResponse } from "next/server";
import { getHermesSession, getWsTicket } from "@/lib/hermes-server";

interface GatewayFrame {
  id?: number | string | null;
  method?: string;
  params?: {
    session_id?: string;
    type?: string;
    payload?: { text?: string; message?: string };
    [key: string]: unknown;
  };
  result?: { session_id?: string; [key: string]: unknown };
  error?: { message?: string; code?: number };
}

async function runHermesTask(
  profile: string,
  task: string,
  timeoutMs = 180_000
): Promise<{ output: string; events: string[] }> {
  const session = await getHermesSession();
  const ticket = await getWsTicket();
  const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";
  const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/ws?ticket=${encodeURIComponent(ticket)}`;

  const socket = new WebSocket(wsUrl);

  const events: string[] = [];
  let output = "";
  let sessionId = "";
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  const cleanup = () => {
    try {
      socket.close();
    } catch {
      /* noop */
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout menyambung WebSocket Hermes")), 20_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Gagal menyambung WebSocket Hermes")); }, { once: true });
    });

    socket.addEventListener("message", (ev) => {
      let frame: GatewayFrame;
      try {
        frame = JSON.parse(String(ev.data));
      } catch {
        return;
      }
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
      if (type === "message.delta" && frame.params?.payload?.text) {
        output += frame.params.payload.text;
      } else if (type === "message.complete") {
        const text = frame.params?.payload?.text;
        if (text) output = text;
      } else if (type && ["tool.start", "tool.complete", "status.update", "thinking.delta"].includes(type)) {
        if (events.length < 50) {
          events.push(`[${type}] ${JSON.stringify(frame.params?.payload ?? {}).slice(0, 120)}`);
        }
      } else if (type === "error" || type === "approval.request" || type === "clarify.request") {
        events.push(`[${type}] ${JSON.stringify(frame.params?.payload ?? {}).slice(0, 200)}`);
      }
    });

    const rpc = <T>(method: string, params: Record<string, unknown>, timeoutMsEach = 60_000): Promise<T> => {
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

    const created = await rpc<{ session_id: string }>(
      "session.create",
      { profile, title: `Dashboard: ${task.slice(0, 60)}` },
      30_000
    );
    sessionId = created.session_id;
    if (!sessionId) throw new Error("session.create tidak mengembalikan session_id");

    events.push(`[session] ${sessionId} (profile: ${profile})`);

    await rpc("prompt.submit", { session_id: sessionId, text: task }, timeoutMs);

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !output) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!output) {
      throw new Error("Tidak ada output dari Hermes sebelum timeout");
    }

    return { output, events };
  } finally {
    cleanup();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, profile = process.env.HERMES_DEFAULT_PROFILE || "devbot", task = "Default execution task" } = body;

    const baseUrl = process.env.HERMES_BASE_URL || "https://hermes.keetech.my.id";

    try {
      const { output, events } = await runHermesTask(profile, task);

      return NextResponse.json({
        success: true,
        agentId,
        profile,
        profileUrl: `${baseUrl}/profiles?profile=${profile}`,
        task,
        timestamp: new Date().toISOString(),
        executionId: `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        mode: "hermes_live_bridge",
        response: {
          output,
          summary: output.slice(0, 300),
          steps: events,
        },
      });
    } catch (bridgeError: any) {
      return NextResponse.json({
        success: false,
        agentId,
        profile,
        profileUrl: `${baseUrl}/profiles?profile=${profile}`,
        task,
        timestamp: new Date().toISOString(),
        executionId: `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        mode: "hermes_bridge_error",
        error: bridgeError?.message || "Hermes bridge gagal",
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to dispatch task to Hermes agent" },
      { status: 500 }
    );
  }
}
