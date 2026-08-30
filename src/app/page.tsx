"use client";

import { useState, useEffect, useMemo } from "react";
import Stage3D from "@/components/stage-3d";
import AgentDock from "@/components/agent-dock";
import RosterGridView from "@/components/roster-grid-view";
import ExecutionTerminalModal from "@/components/execution-terminal-modal";
import { agents, type Agent, type AgentStatus } from "@/lib/agents";

export default function Home() {
  const [activeAgentIndex, setActiveAgentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"spotlight" | "roster">("spotlight");
  const [executingAgent, setExecutingAgent] = useState<Agent | null>(null);
  const [liveRunning, setLiveRunning] = useState<Record<string, boolean>>({});
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/hermes/status", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setBackendOnline(true);
          const map: Record<string, boolean> = {};
          for (const [name, info] of Object.entries(data.profiles)) {
            map[name] = Boolean((info as { gateway_running?: boolean }).gateway_running);
          }
          setLiveRunning(map);
        } else {
          setBackendOnline(false);
        }
      } catch {
        if (!cancelled) setBackendOnline(false);
      }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const liveAgents: Agent[] = useMemo(
    () =>
      agents.map((a) => {
        if (backendOnline === false) {
          return { ...a, status: "offline" as AgentStatus };
        }
        const running = liveRunning[a.hermesProfileKey];
        const status: AgentStatus = running === false ? "offline" : a.status;
        return { ...a, status };
      }),
    [liveRunning, backendOnline]
  );

  const activeAgent = liveAgents[activeAgentIndex];

  // Keyboard navigation support: Left/Right arrows or keys 1-4
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (executingAgent) return; // Don't switch while terminal is open
      if (e.key === "ArrowRight") {
      setActiveAgentIndex((prev) => (prev + 1) % liveAgents.length);
    } else if (e.key === "ArrowLeft") {
      setActiveAgentIndex((prev) => (prev - 1 + liveAgents.length) % liveAgents.length);
      } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
      const index = parseInt(e.key) - 1;
      if (index >= 0 && index < liveAgents.length) {
          setActiveAgentIndex(index);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [executingAgent]);

  const handleSelectAgent = (agent: Agent) => {
    const index = liveAgents.findIndex((a) => a.id === agent.id);
    if (index !== -1) {
      setActiveAgentIndex(index);
      if (viewMode === "roster") {
        setViewMode("spotlight");
      }
    }
  };

  return (
    <div className="relative min-h-screen bg-[#08080a] text-zinc-100 flex flex-col justify-between overflow-x-hidden selection:bg-amber-500/30 select-none">
      {/* Background Cyber Grid Pattern */}
      <div className="fixed inset-0 hud-grid-dots pointer-events-none opacity-40" />

      {/* Dynamic Background Spotlight Aura matching active agent */}
      <div
        className="fixed top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full blur-[140px] pointer-events-none transition-colors duration-1000 opacity-20"
        style={{
          backgroundColor: activeAgent.themeColor.hex,
        }}
      />

      {/* TOP HEADER (Agency Header matching reference Image 1) */}
      <header className="relative z-30 flex items-center justify-between px-6 md:px-12 py-5 border-b border-white/10 bg-black/40 backdrop-blur-xl">
        {/* Left: Agency Tag */}
        <div className="flex items-center gap-3">
          <div className="size-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
          <span className="text-xs font-mono font-bold tracking-[0.25em] uppercase text-zinc-200">
            MY 5 AI AGENTS • RUNNING THE AGENCY 24/7
          </span>
        </div>

        {/* Right: View Toggles & System Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl bg-white/[0.05] p-1 border border-white/10 text-xs font-mono">
            <button
              id="view-spotlight-btn"
              onClick={() => setViewMode("spotlight")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "spotlight"
                  ? "bg-white/15 text-white font-bold shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              3D Spotlight
            </button>
            <button
              id="view-roster-btn"
              onClick={() => setViewMode("roster")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === "roster"
                  ? "bg-white/15 text-white font-bold shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              All Agents (Grid)
            </button>
          </div>

          {/* Core Status */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs font-mono text-zinc-300">
            <span
              className={`size-2 rounded-full ${
                backendOnline === false
                  ? "bg-red-500"
                  : backendOnline === null
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-400"
              }`}
            />
            <span>
              {backendOnline === false
                ? "BACKEND OFFLINE"
                : backendOnline === null
                  ? "CONNECTING…"
                  : "KEETECH INTELEGENT"}
            </span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="relative z-20 flex-1 flex flex-col justify-center py-4">
        {viewMode === "spotlight" ? (
          <div className="animate-fade-in">
            {/* 3D Spotlight Stage */}
            <Stage3D
              agent={activeAgent}
              onExecute={(agent) => setExecutingAgent(agent)}
            />

            {/* Bottom Dock Selector */}
            <AgentDock
              agents={liveAgents}
              activeAgent={activeAgent}
              onSelect={handleSelectAgent}
            />
          </div>
        ) : (
          <div className="animate-fade-in">
            {/* 4 Neon Cards Full Roster View */}
            <RosterGridView
              agents={liveAgents}
              onSelectAgent={handleSelectAgent}
              onExecute={(agent) => setExecutingAgent(agent)}
            />
          </div>
        )}
      </main>

      {/* FOOTER CONTROLS */}
      <footer className="relative z-30 px-6 py-3 border-t border-white/5 bg-black/60 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-zinc-500">
        <div className="flex items-center gap-4">
          <span>Use [← / →] or [1-5] to switch agents</span>
          <span className="hidden md:inline">•</span>
          <span className="hidden md:inline">Click card to inspect 3D view</span>
        </div>
        <div className="flex items-center gap-2 mt-1 sm:mt-0">
          <span className="text-zinc-400 font-semibold">Keetech Intelegent Core</span>
          <span>v2.4.1</span>
        </div>
      </footer>

      {/* LIVE EXECUTION TERMINAL MODAL */}
      {executingAgent && (
        <ExecutionTerminalModal
          agent={executingAgent}
          isOpen={!!executingAgent}
          onClose={() => setExecutingAgent(null)}
        />
      )}
    </div>
  );
}
