"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type { Agent } from "@/lib/agents";

interface Props {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
}

type ChatMsg = {
  role: "user" | "agent" | "event" | "sys";
  text: string;
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
  const [taskInput, setTaskInput] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMsg[]>([]);
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
    messagesRef.current = saved.messages;
    if (saved.messages.length === 0) {
      const welcome: ChatMsg[] = [
        {
          role: "sys",
          text: `Chat bridge ke profil '${agent.hermesProfileKey}' siap. Konteks percakapan tersimpan otomatis untuk agen ini.`,
        },
      ];
      messagesRef.current = welcome;
      setMessages(welcome);
      saveChat(agent.id, null, welcome);
    } else {
      setMessages(saved.messages);
    }
  }, [isOpen, agent]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const sendMessage = async () => {
    const text = taskInput.trim();
    if (!text || isThinking) return;

    setIsThinking(true);
    setTaskInput("");
    pushMessages([{ role: "user", text }]);

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
      });

      const data = await response.json();

      if (!data.success) {
        pushMessages([{ role: "event", text: `ERROR: ${data.error || "Hermes bridge gagal"}` }]);
        return;
      }

      sessionIdRef.current = data.sessionId || sessionIdRef.current;

      const toolEvents: ChatMsg[] = Array.isArray(data.response?.steps)
        ? data.response.steps
            .filter((s: string) => s.startsWith("[tool.") || s.startsWith("[approval") || s.startsWith("[clarify") || s.startsWith("[error"))
            .map((s: string) => ({ role: "event" as const, text: s }))
        : [];

      pushMessages([...toolEvents, { role: "agent", text: data.response?.output || "..." }]);
    } catch (err: any) {
      pushMessages([
        { role: "event", text: `ERROR: ${err.message || "Failed to reach Hermes backend"}` },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const resetSession = () => {
    sessionIdRef.current = null;
    messagesRef.current = [
      {
        role: "sys",
        text: "Sesi baru dimulai. Konteks sebelumnya sudah dibuang.",
      },
    ];
    setMessages(messagesRef.current);
    saveChat(agent.id, null, messagesRef.current);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl h-[80vh] flex flex-col rounded-2xl border border-white/15 bg-[#0d0d12] shadow-2xl overflow-hidden">
        {/* Chat Header */}
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
              onClick={onClose}
              className="text-white/60 hover:text-white text-xs font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors"
            >
              [ESC / CLOSE]
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 w-full bg-white/5 shrink-0">
          <div
            className={`h-full transition-all duration-500 ${isThinking ? "w-full animate-pulse" : "w-0"}`}
            style={{ backgroundColor: agent.themeColor.hex }}
          />
        </div>

        {/* Messages area */}
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
            const isUser = msg.role === "user";
            return (
              <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words border ${
                    isUser
                      ? "bg-amber-500/10 border-amber-500/25 text-amber-100 rounded-br-sm"
                      : "bg-white/[0.04] text-zinc-100 rounded-bl-sm"
                  }`}
                  style={
                    !isUser
                      ? { borderColor: `${agent.themeColor.hex}45` }
                      : undefined
                  }
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
          {isThinking && (
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
                    {agent.displayName} sedang mengerjakan... (bisa 1–2 menit)
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-white/10 px-4 py-3 bg-black/40 flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-bold shrink-0" style={{ color: agent.themeColor.hex }}>
            CHAT&gt;
          </span>
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isThinking) sendMessage();
            }}
            placeholder={`Kirim pesan ke ${agent.displayName}...`}
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={sendMessage}
            disabled={isThinking || !taskInput.trim()}
            className="px-4 py-1.5 rounded-lg disabled:opacity-40 text-[11px] font-mono font-bold text-black transition-all shrink-0"
            style={{ backgroundColor: agent.themeColor.hex }}
          >
            {isThinking ? "..." : "SEND"}
          </button>
        </div>

        {/* Footer */}
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
