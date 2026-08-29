"use client";

import { useEffect, useState, useRef } from "react";
import type { Agent } from "@/lib/agents";

interface Props {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
}

export default function ExecutionTerminalModal({ agent, isOpen, onClose }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [taskInput, setTaskInput] = useState(
    agent.id === "keedev"
      ? "Buatkan REST API authentication dengan JWT & bcrypt"
      : `Jalankan automated workflow untuk ${agent.name}`
  );
  const [apiResult, setApiResult] = useState<any>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const startExecution = async (customTask?: string) => {
    const promptToRun = customTask || taskInput;
    setIsExecuting(true);
    setProgress(15);
    setApiResult(null);

    setLogs([
      `[SYS_INIT] Connecting to Hermes backend (${process.env.NEXT_PUBLIC_HERMES_LABEL || "hermes.keetech.my.id"})...`,
      `[ROUTE] POST /api/hermes/execute?profile=${agent.hermesProfileKey}`,
      `[TARGET] Profile: '${agent.hermesProfileKey}' | Core: ${agent.runsOn}`,
      `[PROMPT] Task: "${promptToRun}"`,
    ]);

    try {
      const response = await fetch("/api/hermes/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          profile: agent.hermesProfileKey,
          task: promptToRun,
        }),
      });

      const data = await response.json();
      setApiResult(data);
      setProgress(60);

      if (!data.success) {
        setLogs((prev) => [
          ...prev,
          `[ERROR] ${data.error || "Hermes bridge gagal"}`,
        ]);
        setProgress(100);
        setIsExecuting(false);
        return;
      }

      const bridgeLogs: string[] = Array.isArray(data.response?.steps)
        ? data.response.steps
        : [];

      setLogs((prev) => [
        ...prev,
        `[BRIDGE] ${data.mode} — session attached`,
        ...bridgeLogs,
        `[SUCCESS] ${data.response?.summary || "Task finished."}`,
      ]);
      setProgress(100);
      setIsExecuting(false);
    } catch (err: any) {
      setIsExecuting(false);
      setProgress(100);
      setLogs((prev) => [
        ...prev,
        `[ERROR] Network exception: ${err.message || "Failed to reach Hermes backend"}`,
      ]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startExecution();
    } else {
      setLogs([]);
      setProgress(0);
    }
  }, [isOpen, agent]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0d0d12] shadow-2xl overflow-hidden">
        {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-3 rounded-full bg-red-500/80 inline-block" />
              <span className="size-3 rounded-full bg-yellow-500/80 inline-block" />
              <span className="size-3 rounded-full bg-green-500/80 inline-block" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-white">
                HERMES API BRIDGE :: {agent.name}
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
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-xs font-mono px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            [ESC / CLOSE]
          </button>
        </div>

        {/* Task Input Prompt Bar */}
        <div className="border-b border-white/10 px-4 py-2.5 bg-black/40 flex items-center gap-2">
          <span className="text-xs font-mono text-amber-400 font-bold">TASK&gt;</span>
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isExecuting) {
                startExecution(taskInput);
              }
            }}
            placeholder="Type custom task for this agent..."
            className="flex-1 bg-transparent text-xs font-mono text-white placeholder-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => startExecution(taskInput)}
            disabled={isExecuting}
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 text-[11px] font-mono font-bold text-white transition-all"
          >
            {isExecuting ? "RUNNING..." : "DISPATCH"}
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full bg-white/5">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              backgroundColor: agent.themeColor.hex,
            }}
          />
        </div>

        {/* Terminal logs body */}
        <div className="p-5 font-mono text-xs text-zinc-300 h-72 overflow-y-auto space-y-2 bg-black/70">
          {logs.map((log, index) => (
            <div key={index} className="flex gap-2 items-start leading-relaxed">
              <span className="text-zinc-600 select-none">{String(index + 1).padStart(2, "0")}</span>
              <span
                className={
                  log.includes("[SUCCESS]")
                    ? "text-emerald-400 font-bold"
                    : log.includes("[BRIDGE]") || log.includes("[TARGET]")
                    ? "text-amber-300"
                    : log.includes("[COMPUTE]") || log.includes("[ROUTING]")
                    ? "text-cyan-300"
                    : "text-zinc-300"
                }
              >
                {log}
              </span>
            </div>
          ))}
          {isExecuting && (
            <div className="flex items-center gap-2 text-zinc-500 pt-1">
              <span className="size-2 rounded-full animate-ping" style={{ backgroundColor: agent.themeColor.hex }} />
              <span>Streaming Hermes response...</span>
            </div>
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 bg-white/[0.02]">
          <div className="flex items-center gap-4 text-[11px] text-zinc-400 font-mono">
            <span>API Route: <code className="text-zinc-300">/api/hermes/execute</code></span>
            <span>Profile: <strong className="text-amber-300">{agent.hermesProfileKey}</strong></span>
          </div>
          <div className="flex gap-2">
            <a
              href={agent.hermesProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-zinc-300 border border-white/10 hover:bg-white/10 transition-colors"
            >
              Open in Hermes ↗
            </a>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider transition-all"
              style={{
                backgroundColor: agent.themeColor.hex,
                color: "#000",
              }}
            >
              {isExecuting ? "ABORT" : "DONE"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
