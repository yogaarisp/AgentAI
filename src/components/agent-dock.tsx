"use client";

import Image from "next/image";
import type { Agent } from "@/lib/agents";

interface Props {
  agents: Agent[];
  activeAgent: Agent;
  onSelect: (agent: Agent) => void;
}

export default function AgentDock({ agents, activeAgent, onSelect }: Props) {
  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center py-6 px-4">
      {/* Subtitle tag above selector */}
      <p className="text-[11px] font-mono tracking-[0.25em] text-zinc-500 uppercase mb-4 text-center">
        ONE OPERATOR • FOUR SPECIALISTS • BUILT ON KIRANA HERMES
      </p>

      {/* Thumbnails Row */}
      <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
        {agents.map((agent) => {
          const isSelected = agent.id === activeAgent.id;
          return (
            <button
              key={agent.id}
              id={`select-agent-${agent.id}`}
              onClick={() => onSelect(agent)}
              className="group relative flex flex-col items-center focus:outline-none transition-transform duration-200 active:scale-95"
            >
              {/* Thumbnail Container with Neon Border */}
              <div
                className="relative size-16 md:size-20 rounded-xl overflow-hidden border-2 transition-all duration-300 bg-black/60"
                style={{
                  borderColor: isSelected ? agent.themeColor.hex : "rgba(255, 255, 255, 0.15)",
                  boxShadow: isSelected
                    ? `0 0 20px ${agent.themeColor.hex}60`
                    : "none",
                  transform: isSelected ? "translateY(-4px)" : "none",
                }}
              >
                <Image
                  src={agent.image}
                  alt={agent.name}
                  fill
                  className="object-cover object-top transition-transform duration-300 group-hover:scale-110"
                  sizes="80px"
                />

                {/* Status dot overlay */}
                <div className="absolute top-1 right-1 z-10">
                  <span
                    className="size-2 rounded-full inline-block"
                    style={{
                      backgroundColor:
                        agent.status === "offline"
                          ? "#71717a"
                          : agent.status === "active"
                          ? "#10b981"
                          : agent.status === "running"
                          ? "#06b6d4"
                          : "#f59e0b",
                    }}
                  />
                </div>
              </div>

              {/* Agent Name Tag */}
              <span
                className="mt-1.5 text-[10px] md:text-[11px] font-mono font-bold tracking-wider uppercase transition-colors"
                style={{
                  color: isSelected ? agent.themeColor.hex : "#71717a",
                }}
              >
                {agent.displayName}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
