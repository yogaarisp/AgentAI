export interface ActivityEntry {
  id: string;
  ts: string;
  agentId: string;
  agentName: string;
  type: "task" | "tool" | "approval" | "error" | "info";
  text: string;
}

const entries: ActivityEntry[] = [];
const MAX = 80;

export function logActivity(e: Omit<ActivityEntry, "id" | "ts">) {
  entries.unshift({
    ...e,
    id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    ts: new Date().toISOString(),
  });
  if (entries.length > MAX) entries.length = MAX;
}

export function getActivityLog(limit = 50): ActivityEntry[] {
  return entries.slice(0, limit);
}
