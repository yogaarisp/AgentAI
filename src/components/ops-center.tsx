"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Agent } from "@/lib/agents";
import BrainCore from "./brain-core";

type PendingMeta = {
  kind: "approval" | "clarify";
  requestId: string;
  status: "pending" | "approved" | "rejected" | "answered";
  response?: string;
};

type ChatMsg = {
  role: "user" | "agent" | "event" | "sys" | "approval" | "clarify";
  text: string;
  meta?: PendingMeta;
};

interface ActivityItem {
  id: string;
  ts: string;
  agentId: string;
  agentName: string;
  type: string;
  text: string;
}

const TYPE_ICON: Record<string, string> = {
  task: "◎",
  tool: "⚙",
  approval: "!",
  error: "✕",
  info: "·",
};

export default function OpsCenter({
  agents,
  onOpenFullChat,
}: {
  agents: Agent[];
  onOpenFullChat: (a: Agent) => void;
}) {
  const [selectedId, setSelectedId] = useState(agents[0]?.id ?? "");
  const agent = agents.find((a) => a.id === selectedId) ?? agents[0];
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const [clarifyDraft, setClarifyDraft] = useState<Record<string, string>>({});
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMsg[]>([]);
  const streamIndexRef = useRef<number>(-1);
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const agentId = agent?.id ?? "";

  useEffect(() => {
    sessionIdRef.current = null;
    streamIndexRef.current = -1;
    messagesRef.current = [
      { role: "sys", text: `Quick chat ke ${agent?.displayName ?? "agent"}. Riwayat penuh ada di CHAT penuh.` },
    ];
    setMessages(messagesRef.current);
  }, [agentId, agent?.displayName]);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch("/api/activity", { cache: "no-store" });
        const data = await res.json();
        if (!stop && data.success) setActivities(data.activities ?? []);
      } catch {
        /* ignore */
      }
    };
    load();
    const timer = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, streamingStarted]);

  const hasPending = messages.some((m) => m.meta?.status === "pending");

  const pushMessages = useCallback((newMsgs: ChatMsg[]) => {
    messagesRef.current = [...messagesRef.current, ...newMsgs];
    setMessages(messagesRef.current);
  }, []);

  const updateMeta = (requestId: string, patch: Partial<PendingMeta>) => {
    const msgs = messagesRef.current.map((m) =>
      m.meta && m.meta.requestId === requestId ? { ...m, meta: { ...m.meta, ...patch } } : m
    );
    messagesRef.current = msgs;
    setMessages(msgs);
  };

  const sendDecision = async (
    kind: "approval" | "clarify",
    requestId: string,
    decision?: "approved" | "rejected",
    answer?: string
  ) => {
    const status = kind === "approval" ? (decision === "rejected" ? "rejected" : "approved") : "answered";
    try {
      const res = await fetch("/api/hermes/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current, kind, requestId, decision, answer }),
      });
      const data = await res.json();
      updateMeta(requestId, { status, response: data.method ? `via ${data.method}` : data.error });
      if (!data.success) pushMessages([{ role: "event", text: `ERROR: ${data.error}` }]);
    } catch (err: any) {
      updateMeta(requestId, { status: "pending" });
      pushMessages([{ role: "event", text: `ERROR: ${err?.message || "gagal mengirim keputusan"}` }]);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isThinking || hasPending || !agent) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsThinking(true);
    setStreamingStarted(false);
    setInput("");
    streamIndexRef.current = -1;
    pushMessages([{ role: "user", text }]);

    const appendDelta = (t: string) => {
      const msgs = [...messagesRef.current];
      if (streamIndexRef.current === -1) {
        msgs.push({ role: "agent", text: t });
        streamIndexRef.current = msgs.length - 1;
        setStreamingStarted(true);
      } else {
        const m = msgs[streamIndexRef.current];
        msgs[streamIndexRef.current] = { ...m, text: m.text + t };
      }
      messagesRef.current = msgs;
      setMessages(msgs);
    };

    const setStreamFinal = (t: string) => {
      if (streamIndexRef.current === -1) {
        pushMessages([{ role: "agent", text: t }]);
        return;
      }
      const msgs = [...messagesRef.current];
      msgs[streamIndexRef.current] = { role: "agent", text: t };
      messagesRef.current = msgs;
      setMessages(msgs);
    };

    try {
      const response = await fetch("/api/hermes/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          agentName: agent.displayName,
          profile: agent.hermesProfileKey,
          task: text,
          sessionId: sessionIdRef.current,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const chunk = await reader.read();
        done = chunk.done;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          let event = "message";
          let data = "";
          for (const line of part.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload: any;
          try { payload = JSON.parse(data); } catch { continue; }
          if (event === "session") {
            sessionIdRef.current = payload.sessionId || sessionIdRef.current;
          } else if (event === "delta") {
            if (payload.text) appendDelta(payload.text);
          } else if (event === "event") {
            pushMessages([{ role: "event", text: `[${payload.type}] ${payload.text}` }]);
          } else if (event === "approval" || event === "clarify") {
            let requestId = `req_${Date.now()}`;
            let pretty = "";
            try {
              const parsed = JSON.parse(payload.text);
              requestId = parsed.requestId || requestId;
              pretty = JSON.stringify(parsed.payload ?? parsed, null, 1).slice(0, 600);
            } catch {
              pretty = payload.text;
            }
            pushMessages([{ role: event, text: pretty, meta: { kind: event, requestId, status: "pending" } }]);
          } else if (event === "complete") {
            sessionIdRef.current = payload.sessionId || sessionIdRef.current;
            setStreamFinal(payload.output || "...");
          } else if (event === "error") {
            pushMessages([{ role: "event", text: `ERROR: ${payload.message}` }]);
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        pushMessages([{ role: "event", text: "Dibatalkan." }]);
      } else {
        pushMessages([{ role: "event", text: `ERROR: ${err?.message || "gagal terhubung"}` }]);
      }
    } finally {
      abortRef.current = null;
      setIsThinking(false);
      setStreamingStarted(false);
      streamIndexRef.current = -1;
    }
  };

  const onlineCount = agents.filter((a) => a.status !== "offline").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-amber-400">
              KEETECH BRAIN · {onlineCount}/{agents.length} AGENT ONLINE
            </span>
            <span className="text-[9px] font-mono text-zinc-500">klik agent untuk chat</span>
          </div>
          <BrainCore agents={agents} onSelect={(a) => setSelectedId(a.id)} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/5">
            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-cyan-400">
              ACTIVITY FEED · LIVE
            </span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[340px] md:max-h-[400px] divide-y divide-white/[0.04]">
            {activities.length === 0 && (
              <p className="p-4 text-[10px] font-mono text-zinc-500">
                Belum ada aktivitas — mulai chat dengan agent, log akan muncul di sini.
              </p>
            )}
            {activities.map((a) => (
              <div key={a.id} className="px-4 py-2 flex gap-2 items-start hover:bg-white/[0.02]">
                <span className="text-[10px] shrink-0" style={{ color: a.type === "error" ? "#f87171" : a.type === "approval" ? "#fbbf24" : "#67e8f9" }}>
                  {TYPE_ICON[a.type] ?? "·"}
                </span>
                <div className="min-w-0">
                  <span className="text-[9px] font-mono text-zinc-500">
                    {new Date(a.ts).toLocaleTimeString("id-ID", { hour12: false })}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-zinc-300 ml-1.5">{a.agentName}</span>
                  <p className="text-[10px] font-mono text-zinc-400 truncate">{a.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 overflow-x-auto">
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-zinc-400 shrink-0">QUICK CHAT →</span>
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all shrink-0 flex items-center gap-1.5 ${
                a.id === selectedId
                  ? "text-black"
                  : "border-white/10 text-zinc-400 hover:text-white hover:border-white/25"
              }`}
              style={
                a.id === selectedId
                  ? { backgroundColor: a.themeColor.hex, borderColor: a.themeColor.hex }
                  : undefined
              }
            >
              <span
                className={`size-1.5 rounded-full ${a.status === "offline" ? "bg-zinc-500" : "bg-emerald-400"}`}
                style={a.id === selectedId ? { backgroundColor: "#000" } : undefined}
              />
              {a.displayName.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => agent && onOpenFullChat(agent)}
            className="ml-auto text-[10px] font-mono text-amber-400 hover:text-amber-300 shrink-0"
            title="Buka chat penuh dengan approval UI"
          >
            [CHAT PENUH ↗]
          </button>
        </div>

        <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto bg-black/30">
          {messages.map((msg, index) => {
            if (msg.role === "sys") {
              return (
                <p key={index} className="text-center text-[9px] font-mono text-zinc-500">
                  {msg.text}
                </p>
              );
            }
            if (msg.role === "event") {
              return (
                <p key={index} className="text-center text-[9px] font-mono text-cyan-300/70">
                  {msg.text}
                </p>
              );
            }
            if ((msg.role === "approval" || msg.role === "clarify") && msg.meta) {
              const meta = msg.meta;
              const pending = meta.status === "pending";
              return (
                <div key={index} className="rounded-lg border px-3 py-2" style={{ borderColor: pending ? "#f59e0b80" : "#71717a40" }}>
                  <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">
                    {msg.role === "approval" ? "APPROVAL REQUEST" : "BUTUH JAWABAN"}
                  </p>
                  <pre className="text-[9px] text-zinc-300 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">{msg.text}</pre>
                  {msg.role === "approval" ? (
                    <div className="flex gap-2 mt-1.5">
                      <button
                        disabled={!pending}
                        onClick={() => sendDecision("approval", meta.requestId, "approved")}
                        className="px-2.5 py-0.5 rounded bg-emerald-500 text-black text-[9px] font-bold disabled:opacity-40"
                      >
                        APPROVE
                      </button>
                      <button
                        disabled={!pending}
                        onClick={() => sendDecision("approval", meta.requestId, "rejected")}
                        className="px-2.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-bold disabled:opacity-40"
                      >
                        REJECT
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-1.5">
                      <input
                        value={clarifyDraft[meta.requestId] || ""}
                        disabled={!pending}
                        onChange={(e) => setClarifyDraft((d) => ({ ...d, [meta.requestId]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && pending) {
                            const answer = clarifyDraft[meta.requestId]?.trim();
                            if (answer) {
                              sendDecision("clarify", meta.requestId, undefined, answer);
                              setClarifyDraft((d) => ({ ...d, [meta.requestId]: "" }));
                            }
                          }
                        }}
                        placeholder="Jawab..."
                        className="flex-1 bg-black/40 border border-white/15 rounded px-2 py-0.5 text-[9px] text-white disabled:opacity-40"
                      />
                      <button
                        disabled={!pending || !clarifyDraft[meta.requestId]?.trim()}
                        onClick={() => {
                          const answer = clarifyDraft[meta.requestId]?.trim();
                          if (answer) {
                            sendDecision("clarify", meta.requestId, undefined, answer);
                            setClarifyDraft((d) => ({ ...d, [meta.requestId]: "" }));
                          }
                        }}
                        className="px-2.5 py-0.5 rounded bg-amber-500 text-black text-[9px] font-bold disabled:opacity-40"
                      >
                        SEND
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            const isUser = msg.role === "user";
            return (
              <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 text-[10px] font-mono whitespace-pre-wrap break-words border ${
                    isUser
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-100"
                      : "bg-white/[0.04] border-white/10 text-zinc-100"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
          {isThinking && !streamingStarted && (
            <p className="text-[9px] font-mono text-zinc-500 animate-pulse">menyambung ke Hermes gateway...</p>
          )}
          <div ref={scrollEndRef} />
        </div>

        <div className="border-t border-white/10 px-4 py-2.5 flex items-center gap-2 bg-black/40">
          <span className="text-[10px] font-mono font-bold" style={{ color: agent?.themeColor.hex }}>
            {agent?.displayName.toUpperCase()}&gt;
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isThinking && !hasPending) sendMessage();
            }}
            disabled={hasPending}
            placeholder={hasPending ? "Selesaikan approval/clarify dulu..." : "Tanya apa saja..."}
            className="flex-1 bg-transparent text-[10px] font-mono text-white placeholder-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={isThinking ? () => abortRef.current?.abort() : sendMessage}
            disabled={(!isThinking && !input.trim()) || hasPending}
            className={`px-3 py-1 rounded-lg disabled:opacity-40 text-[10px] font-mono font-bold shrink-0 ${
              isThinking ? "bg-red-500 text-white" : "bg-amber-500 text-black"
            }`}
          >
            {isThinking ? "STOP" : "SEND"}
          </button>
        </div>
      </div>
    </div>
  );
}
