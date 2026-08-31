export interface ActiveRun {
  socket: WebSocket;
  call: (method: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>;
  pendingDecision: boolean;
}

const activeRuns = new Map<string, ActiveRun>();

export function setRun(sessionId: string, run: ActiveRun) {
  activeRuns.set(sessionId, run);
}

export function getRun(sessionId: string): ActiveRun | undefined {
  return activeRuns.get(sessionId);
}

export function removeRun(sessionId: string) {
  activeRuns.delete(sessionId);
}
