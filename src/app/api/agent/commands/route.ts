import { NextRequest } from "next/server";
import {
  dequeuePending,
  enqueueCommand,
  recordHeartbeat,
  getQueue,
} from "@/lib/agent-queue";

export const dynamic = "force-dynamic";

/**
 * GET — Python agent polling untuk ambil pending commands.
 *       Sekaligus sebagai heartbeat (agent online).
 *
 * Response: { commands: AgentCommand[], ts: string }
 */
export async function GET() {
  recordHeartbeat();
  const commands = dequeuePending();
  return Response.json({ commands, ts: new Date().toISOString() });
}

/**
 * POST — Dashboard / LLM kirim command baru ke antrian.
 *
 * Body: { action, params, requestedBy? }
 * Response: { command: AgentCommand }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  const action = String(body.action || "shell");
  const params = (body.params as Record<string, unknown>) ?? {};
  const requestedBy = String(body.requestedBy || "dashboard");

  const validActions = [
    "shell", "open_app", "close_app", "screenshot", "read_file",
    "write_file", "system_info", "notify", "custom",
  ];
  if (!validActions.includes(action)) {
    return Response.json(
      { error: `Action tidak valid: ${action}` },
      { status: 400 }
    );
  }

  const command = enqueueCommand({ action: action as never, params, requestedBy });
  return Response.json({ command });
}

/**
 * GET /api/agent/commands?log=1 — lihat antrian (untuk debug)
 */
export async function HEAD() {
  const q = getQueue(10);
  return Response.json({ queue: q });
}
