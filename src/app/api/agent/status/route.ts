import { isLocalAgentOnline, getQueue } from "@/lib/agent-queue";

export const dynamic = "force-dynamic";

/**
 * GET — Cek status Python local agent.
 * Response: { online: boolean, queueLength: number, ts: string }
 */
export async function GET() {
  const online = isLocalAgentOnline();
  const queue = getQueue(5);
  const pending = queue.filter((c) => c.status === "pending").length;
  const running = queue.filter((c) => c.status === "running").length;

  return Response.json({
    online,
    pending,
    running,
    ts: new Date().toISOString(),
  });
}
