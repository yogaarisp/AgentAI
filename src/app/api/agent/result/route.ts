import { NextRequest } from "next/server";
import { resolveCommand, recordHeartbeat } from "@/lib/agent-queue";

export const dynamic = "force-dynamic";

/**
 * POST — Python agent kirim hasil eksekusi command.
 *
 * Body: {
 *   id: string,       // command ID
 *   result: string,   // output/hasil
 *   error?: string,   // jika ada error
 *   heartbeat?: true  // opsional, sekaligus update heartbeat
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  if (body.heartbeat) recordHeartbeat();

  const id = String(body.id || "");
  if (!id) {
    return Response.json({ error: "id command wajib diisi" }, { status: 400 });
  }

  const isError = Boolean(body.error);
  const payload = String(body.error || body.result || "");

  const cmd = resolveCommand(id, payload, isError);
  if (!cmd) {
    return Response.json(
      { error: `Command ${id} tidak ditemukan di antrian` },
      { status: 404 }
    );
  }

  return Response.json({ ok: true, command: cmd });
}
