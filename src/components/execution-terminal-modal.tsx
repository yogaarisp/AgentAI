"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Agent } from "@/lib/agents";

interface Props {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
}

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

function storageKeys(agentId: string) {
  return {
    sid: `hermes_chat:${agentId}:sid`,
    msgs: `hermes_chat:${agentId}:msgs`,
  };
}

function loadChat(agentId: string): { sessionId: string | null; messages: ChatMsg[] } {
  if (typeof window === "undefined") return { sessionId: null, messages: [] };
  try {
    const { sid, msgs } = storageKeys(agentId);
    const sessionId = window.localStorage.getItem(sid);
    const messages = JSON.parse(window.localStorage.getItem(msgs) || "[]");
    return { sessionId, messages: Array.isArray(messages) ? messages : [] };
  } catch {
    return { sessionId: null, messages: [] };
  }
}

function saveChat(agentId: string, sessionId: string | null, messages: ChatMsg[]) {
  try {
    const { sid, msgs } = storageKeys(agentId);
    if (sessionId) window.localStorage.setItem(sid, sessionId);
    else window.localStorage.removeItem(sid);
    window.localStorage.setItem(msgs, JSON.stringify(messages.slice(-100)));
  } catch {
    /* storage full / unavailable */
  }
}

export default function ExecutionTerminalModal({ agent, isOpen, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [streamingStarted, setStreamingStarted] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [clarifyDraft, setClarifyDraft] = useState<Record<string, string>>({});
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMsg[]>([]);
  const streamIndexRef = useRef<number>(-1);
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const pushMessages = useCallback(
    (newMsgs: ChatMsg[]) => {
      messagesRef.current = [...messagesRef.current, ...newMsgs];
      setMessages(messagesRef.current);
      saveChat(agent.id, sessionIdRef.current, messagesRef.current);
    },
    [agent.id]
  );

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadChat(agent.id);
    sessionIdRef.current = saved.sessionId;
    messagesRef.current = saved.messages.map((m) =>
      m.meta && m.meta.status === "pending"
        ? { ...m, meta: { ...m.meta, status: "answered" as const, response: "sesi berakhir" } }
        : m
    );
    setMessages(messagesRef.current);
    saveChat(agent.id, sessionIdRef.current, messagesRef.current);
  }, [isOpen, agent.id]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, streamingStarted]);

  const hasPending = messages.some((m) => m.meta?.status === "pending");

  const updateMeta = (requestId: string, patch: Partial<PendingMeta>) => {
    const msgs = messagesRef.current.map((m) =>
      m.meta && m.meta.requestId === requestId ? { ...m, meta: { ...m.meta, ...patch } } : m
    );
    messagesRef.current = msgs;
    setMessages(msgs);
    saveChat(agent.id, sessionIdRef.current, msgs);
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
      if (!data.success) {
        pushMessages([{ role: "event", text: `ERROR: ${data.error}` }]);
      } else {
        pushMessages([
          { role: "event", text: `${kind === "approval" ? `Approval ${decision}` : "Jawaban clarify"} dikirim (${data.method}). Agent melanjutkan...` },
        ]);
      }
    } catch (err: any) {
      updateMeta(requestId, { status: "pending" });
      pushMessages([{ role: "event", text: `ERROR: ${err?.message || "gagal mengirim keputusan"}` }]);
    }
  };

  const sendMessage = async () => {
    const text = taskInput.trim();
    if (!text || isThinking || hasPending) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setIsThinking(true);
    setStreamingStarted(false);
    setTaskInput("");
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
      saveChat(agent.id, sessionIdRef.current, msgs);
    };

    try {
      const response = await fetch("/api/hermes/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
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
            setMessages([...messagesRef.current]);
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
              pretty = JSON.stringify(parsed.payload ?? parsed, null, 1).slice(0, 800);
            } catch {
              pretty = payload.text;
            }
            pushMessages([
              {
                role: event,
                text: pretty,
                meta: { kind: event, requestId, status: "pending" },
              },
            ]);
          } else if (event === "complete") {
            sessionIdRef.current = payload.sessionId || sessionIdRef.current;
            setStreamFinal(payload.output || "...");
            pushMessages([]);
          } else if (event === "error") {
            const msg = String(payload.message || "");
            if (/session not found/i.test(msg)) {
              sessionIdRef.current = null;
              try {
                window.localStorage.removeItem(storageKeys(agent.id).sid);
              } catch {
                /* noop */
              }
              pushMessages([
                { role: "event", text: "Sesi lama sudah tidak ada di gateway — sesi baru dibuat. Kirim ulang pesanmu." },
              ]);
            } else {
              pushMessages([{ role: "event", text: `ERROR: ${msg}` }]);
            }
            saveChat(agent.id, sessionIdRef.current, messagesRef.current);
          }
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        pushMessages([{ role: "event", text: "Dibatalkan oleh operator." }]);
      } else {
        pushMessages([{ role: "event", text: `ERROR: ${err?.message || "Failed to reach Hermes backend"}` }]);
        saveChat(agent.id, sessionIdRef.current, messagesRef.current);
      }
    } finally {
      abortRef.current = null;
      setIsThinking(false);
      setStreamingStarted(false);
      streamIndexRef.current = -1;
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  const resetSession = () => {
    sessionIdRef.current = null;
    messagesRef.current = [
      { role: "sys", text: "Sesi baru dimulai. Konteks sebelumnya sudah dibuang." },
    ];
    setMessages(messagesRef.current);
    saveChat(agent.id, null, messagesRef.current);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl h-[80vh] flex flex-col rounded-2xl border border-white/15 bg-[#0d0d12] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-3 rounded-full bg-red-500/80 inline-block" />
              <span className="size-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="size-3 rounded-full bg-green-500/80 inline-block" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-white">
                CHAT :: {agent.name}
              </span>
              <a
                href={agent.hermesProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 transition-all flex items-center gap-1"
              >
                <span className="capitalize">{agent.hermesProfileKey}</span>
                <svg className="size-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={resetSession}
              disabled={isThinking}
              className="text-white/60 hover:text-white text-xs font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors disabled:opacity-40"
              title="Buang konteks & mulai sesi baru"
            >
              [NEW SESSION]
            </button>
            <button
              onClick={handleClose}
              className="text-white/60 hover:text-white text-xs font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors"
            >
              [ESC / CLOSE]
            </button>
          </div>
        </div>

        <div className="h-0.5 w-full bg-white/5 shrink-0">
          <div
            className={`h-full transition-all duration-500 ${isThinking ? "w-full animate-pulse" : "w-0"}`}
            style={{ backgroundColor: agent.themeColor.hex }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/60">
          {messages.map((msg, index) => {
            if (msg.role === "sys") {
              return (
                <div key={index} className="text-center">
                  <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.03] border border-white/5 rounded-full px-3 py-1 inline-block">
                    {msg.text}
                  </span>
                </div>
              );
            }
            if (msg.role === "event") {
              return (
                <div key={index} className="text-center">
                  <span className="text-[10px] font-mono text-cyan-300/80 bg-cyan-500/[0.06] border border-cyan-500/10 rounded px-2 py-0.5 inline-block max-w-[90%] truncate">
                    {msg.text}
                  </span>
                </div>
              );
            }
            if ((msg.role === "approval" || msg.role === "clarify") && msg.meta) {
              const meta = msg.meta;
              const pending = meta.status === "pending";
              return (
                <div key={index} className="flex justify-start">
                  <div
                    className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs font-mono border"
                    style={{
                      borderColor: pending ? "#f59e0b80" : "#71717a40",
                      background: pending ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <span className="block text-[9px] font-bold tracking-widest uppercase mb-1.5 text-amber-400">
                      {msg.role === "approval" ? "APPROVAL REQUEST" : "AGENT BUTUH JAWABAN"}
                    </span>
                    <pre className="text-[10px] text-zinc-200 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">{msg.text}</pre>
                    {msg.role === "approval" && (
                      <div className="flex gap-2 mt-2.5">
                        <button
                          disabled={!pending}
                          onClick={() => sendDecision("approval", meta.requestId, "approved")}
                          className="px-3 py-1 rounded bg-emerald-500 text-black text-[10px] font-bold disabled:opacity-40"
                        >
                          APPROVE
                        </button>
                        <button
                          disabled={!pending}
                          onClick={() => sendDecision("approval", meta.requestId, "rejected")}
                          className="px-3 py-1 rounded bg-red-500 text-white text-[10px] font-bold disabled:opacity-40"
                        >
                          REJECT
                        </button>
                      </div>
                    )}
                    {msg.role === "clarify" && (
                      <div className="flex gap-2 mt-2.5">
                        <input
                          type="text"
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
                          placeholder="Ketik jawabanmu..."
                          className="flex-1 bg-black/40 border border-white/15 rounded px-2 py-1 text-[10px] text-white disabled:opacity-40"
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
                          className="px-3 py-1 rounded bg-amber-500 text-black text-[10px] font-bold disabled:opacity-40"
                        >
                          SEND
                        </button>
                      </div>
                    )}
                    {!pending && (
                      <div className="mt-1.5 text-[9px] text-zinc-500">
                        {meta.status.toUpperCase()}
                        {meta.response ? ` · ${meta.response}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            const isUser = msg.role === "user";
            return (
              <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words border ${
                    isUser
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-100 rounded-br-sm"
                      : "bg-white/[0.04] text-zinc-100 rounded-bl-sm"
                  }`}
                  style={!isUser ? { borderColor: `${agent.themeColor.hex}45` } : undefined}
                >
                  {!isUser && (
                    <span
                      className="block text-[9px] font-bold tracking-widest uppercase mb-1"
                      style={{ color: agent.themeColor.hex }}
                    >
                      {agent.displayName}
                    </span>
                  )}
                  {msg.text}
                </div>
              </div>
            );
          })}
          {isThinking && !streamingStarted && (
            <div className="flex justify-start">
              <div
                className="rounded-xl px-3.5 py-2.5 bg-white/[0.04] border rounded-bl-sm"
                style={{ borderColor: `${agent.themeColor.hex}45` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-1.5 rounded-full animate-pulse"
                    style={{ backgroundColor: agent.themeColor.hex }}
                  />
                  <span className="text-[10px] font-mono text-zinc-400">
                    menyambung ke Hermes gateway...
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        <div className="border-t border-white/10 px-4 py-3 bg-black/40 flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-bold shrink-0" style={{ color: agent.themeColor.hex }}>
            CHAT&gt;
          </span>
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isThinking && !hasPending) sendMessage();
            }}
            placeholder={hasPending ? "Selesaikan dulu approval/clarify di atas..." : `Kirim pesan ke ${agent.displayName}...`}
            disabled={hasPending}
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={isThinking ? stopStreaming : sendMessage}
            disabled={(!isThinking && !taskInput.trim()) || hasPending}
            className={`px-4 py-1.5 rounded-lg disabled:opacity-40 text-[11px] font-mono font-bold transition-all shrink-0 ${
              isThinking ? "bg-red-500 text-white" : "text-black"
            }`}
            style={!isThinking ? { backgroundColor: agent.themeColor.hex } : undefined}
          >
            {isThinking ? "STOP" : "SEND"}
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-2 bg-white/[0.02] text-[10px] text-zinc-500 font-mono shrink-0">
          <span>
            Sesi: <strong className="text-zinc-300">{sessionIdRef.current || "baru (menunggu pesan pertama)"}</strong>
          </span>
          <span>Riwayat tersimpan otomatis di browser ini</span>
        </div>
      </div>
    </div>
  );
}
