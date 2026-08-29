"use client";

import Image from "next/image";
import type { Agent } from "@/lib/agents";

interface Props {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  onExecute: (agent: Agent) => void;
}

export default function RosterGridView({ agents, onSelectAgent, onExecute }: Props) {
  return (
    <div className="w-full max-w-7xl mx-auto py-8 px-4 md:px-8">
      {/* Title Section matching Image 2 */}
      <div className="text-center mb-10 space-y-2">
        <h2 className="text-4xl md:text-5xl font-black tracking-tight text-white uppercase">
          MEET MY 5 AI AGENTS
        </h2>
        <p className="text-sm md:text-base text-zinc-400 max-w-2xl mx-auto font-medium">
          They run our entire multi-agent operations inside Kirana (Hermes). Autonomous orchestration, development, infrastructure, quantitative finance, and SEO growth.
        </p>
      </div>

      {/* 5 Neon Cards Grid (Image 2 style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {agents.map((agent) => (
          <div
            key={agent.id}
            onClick={() => onSelectAgent(agent)}
            className="group relative rounded-2xl p-1 transition-all duration-500 cursor-pointer hover:-translate-y-2"
          >
            {/* Neon Border Box */}
            <div
              className="relative aspect-[3/4.2] w-full rounded-2xl overflow-hidden border-2 transition-all duration-500 bg-black/60 shadow-xl"
              style={{
                borderColor: agent.themeColor.hex,
                boxShadow: `0 0 25px ${agent.themeColor.hex}25`,
              }}
            >
              {/* Top Status Tag */}
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-sm border border-white/10">
                <span
                  className={`size-2 rounded-full ${agent.status === "offline" ? "" : "animate-ping"}`}
                  style={{
                    backgroundColor: agent.status === "offline" ? "#71717a" : agent.themeColor.hex,
                  }}
                />
                <span className="text-[10px] font-mono font-bold tracking-wider text-white">
                  {agent.status.toUpperCase()}
                </span>
              </div>

              {/* Top Index */}
              <div className="absolute top-3 right-3 z-20 text-[10px] font-mono font-bold text-white/70 px-2 py-0.5 rounded bg-black/50">
                {agent.num}
              </div>

              {/* Background ambient gradient glow */}
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at 50% 100%, ${agent.themeColor.hex}, transparent 70%)`,
                }}
              />

              {/* Character Full Pose Image */}
              <Image
                src={agent.image}
                alt={agent.name}
                fill
                className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 300px"
              />

              {/* Bottom gradient fade for text legibility */}
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />

              {/* Name & Role at bottom (Image 2 style) */}
              <div className="absolute bottom-4 left-4 right-4 z-20 space-y-1">
                <h3
                  className="text-2xl font-black tracking-tight uppercase transition-colors"
                  style={{ color: agent.themeColor.hex }}
                >
                  {agent.name}
                </h3>
                <p className="text-xs font-mono font-semibold text-zinc-300">
                  {agent.role}
                </p>
                <div className="pt-2 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                  <span>{agent.uptime} Uptime</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExecute(agent);
                    }}
                    className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-bold transition-colors"
                  >
                    ⚡ Execute
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
