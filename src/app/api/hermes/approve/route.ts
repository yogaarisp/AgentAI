import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/hermes-gateway-registry";

export const dynamic = "force-dynamic";

const APPROVAL_METHODS = [
  "approval.respond",
  "approval.resolve",
  "approval.decision",
  "gateway.approval.respond",
  "session.approval.respond",
];

const CLARIFY_METHODS = [
  "clarify.respond",
  "clarify.answer",
  "clarify.resolve",
  "session.clarify.respond",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const kind = body.kind === "clarify" ? "clarify" : "approval";
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const decision = body.decision === "rejected" ? "rejected" : "approved";
  const answer = typeof body.answer === "string" ? body.answer : "";

  if (!sessionId || !requestId) {
    return NextResponse.json({ success: false, error: "sessionId & requestId wajib" }, { status: 400 });
  }

  const entry = getRun(sessionId);
  if (!entry) {
    return NextResponse.json(
      { success: false, error: "Run sudah tidak aktif — balasan hanya berlaku selama task masih berjalan" },
      { status: 410 }
    );
  }

  const methods = kind === "clarify" ? CLARIFY_METHODS : APPROVAL_METHODS;
  const params =
    kind === "clarify"
      ? { session_id: sessionId, request_id: requestId, id: requestId, answer, text: answer, response: answer }
      : { session_id: sessionId, request_id: requestId, id: requestId, decision, approved: decision === "approved", response: decision };

  let lastErr = "unknown";
  for (const method of methods) {
    try {
      await entry.call(method, params, 15_000);
      entry.pendingDecision = false;
      return NextResponse.json({ success: true, method });
    } catch (err: any) {
      lastErr = err?.message || String(err);
    }
  }

  entry.pendingDecision = false;
  return NextResponse.json(
    {
      success: false,
      error: `Gateway tidak mengenali metode ${kind} manapun (coba terakhir: ${lastErr}). Perlu dokumentasi protokol resmi.`,
    },
    { status: 502 }
  );
}
