/**
 * In-memory queue untuk komunikasi antara dashboard dan Local Python Agent.
 *
 * Flow:
 *   LLM / user → POST /api/agent/commands  → enqueue()
 *   Python agent → GET  /api/agent/commands  → dequeue() (polling)
 *   Python agent → POST /api/agent/result    → resolveCommand()
 *   Dashboard    → subscribe via onResult()
 */

export type CommandStatus = "pending" | "running" | "done" | "error" | "timeout";

export interface AgentCommand {
  id: string;
  ts: string;
  /** Tipe aksi yang diminta */
  action:
    | "shell"        // jalankan terminal command
    | "open_app"     // buka aplikasi macOS
    | "close_app"    // tutup aplikasi macOS
    | "screenshot"   // ambil screenshot layar
    | "read_file"    // baca file
    | "write_file"   // tulis file
    | "system_info"  // info CPU/RAM/disk
    | "notify"       // notifikasi desktop
    | "custom";      // bebas
  /** Parameter aksi — beda per action type */
  params: Record<string, unknown>;
  /** Siapa yang meminta (agentId) */
  requestedBy: string;
  status: CommandStatus;
  result?: string;
  error?: string;
}

const queue: AgentCommand[] = [];
const MAX_QUEUE = 50;

// Listener untuk subscribe hasil command selesai
const resultListeners = new Map<string, (cmd: AgentCommand) => void>();

// Kapan terakhir Python agent melakukan heartbeat
let lastHeartbeat = 0;
const HEARTBEAT_TIMEOUT_MS = 15_000; // 15 detik

export function isLocalAgentOnline(): boolean {
  return Date.now() - lastHeartbeat < HEARTBEAT_TIMEOUT_MS;
}

export function recordHeartbeat() {
  lastHeartbeat = Date.now();
}

export function enqueueCommand(
  cmd: Omit<AgentCommand, "id" | "ts" | "status">
): AgentCommand {
  const entry: AgentCommand = {
    ...cmd,
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    status: "pending",
  };
  queue.unshift(entry);
  if (queue.length > MAX_QUEUE) queue.length = MAX_QUEUE;
  return entry;
}

/** Ambil semua pending commands dan tandai jadi "running" */
export function dequeuePending(): AgentCommand[] {
  const pending = queue.filter((c) => c.status === "pending");
  for (const c of pending) c.status = "running";
  return pending;
}

/** Python agent POST hasil — update status + notify listeners */
export function resolveCommand(
  id: string,
  result: string,
  isError = false
): AgentCommand | null {
  const cmd = queue.find((c) => c.id === id);
  if (!cmd) return null;
  cmd.status = isError ? "error" : "done";
  if (isError) cmd.error = result;
  else cmd.result = result;

  const listener = resultListeners.get(id);
  if (listener) {
    listener(cmd);
    resultListeners.delete(id);
  }
  return cmd;
}

/** Subscribe untuk dapat callback saat command selesai (timeout 60s) */
export function waitForResult(id: string): Promise<AgentCommand> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resultListeners.delete(id);
      const cmd = queue.find((c) => c.id === id);
      if (cmd) cmd.status = "timeout";
      reject(new Error(`Local agent timeout untuk command ${id}`));
    }, 60_000);

    resultListeners.set(id, (cmd) => {
      clearTimeout(timer);
      resolve(cmd);
    });
  });
}

export function getQueue(limit = 20): AgentCommand[] {
  return queue.slice(0, limit);
}
