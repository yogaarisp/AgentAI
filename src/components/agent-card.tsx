"use client";

import { useState } from "react";
import type { Agent } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import Image from "next/image";

function StatusDot({ status }: { status: Agent["status"] }) {
  const colorMap = {
    active: "bg-emerald-400",
    running: "bg-cyan-400",
    standby: "bg-amber-400",
    offline: "bg-zinc-400",
  };

  return (
    <span className="relative flex size-2.5">
      <span
        className={cn(
          "absolute inline-flex h-full w-full rounded-full opacity-75",
          colorMap[status],
          status !== "standby" && "animate-status-ping"
        )}
      />
      <span
        className={cn(
          "relative inline-flex size-2.5 rounded-full",
          colorMap[status]
        )}
      />
    </span>
  );
}

function StatusBadge({ status }: { status: Agent["status"] }) {
  const config = {
    active: {
      label: "Active",
      className:
        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10",
    },
    running: {
      label: "Running",
      className:
        "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/10",
    },
    standby: {
      label: "Standby",
      className:
        "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/10",
    },
    offline: {
      label: "Offline",
      className:
        "bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/10",
    },
  };

  const { label, className } = config[status];

  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold tracking-wider uppercase", className)}>
      {label}
    </Badge>
  );
}

interface AgentCardProps {
  agent: Agent;
  index: number;
}

export default function AgentCard({ agent, index }: AgentCardProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExecute = () => {
    setIsExecuting(true);
    setProgress(0);

    // Simulate execution progress
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsExecuting(false);
            setProgress(0);
          }, 800);
          return 100;
        }
        return prev + Math.random() * 15 + 5;
      });
    }, 300);
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl transition-all duration-500 hover:border-border/80 hover:shadow-2xl",
        "animate-fade-in-up"
      )}
      style={{
        animationDelay: `${index * 120}ms`,
        animationFillMode: "backwards",
      }}
    >
      {/* Accent glow top border */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r opacity-60 transition-opacity duration-500 group-hover:opacity-100",
          agent.themeColor.bgGradient
        )}
      />

      {/* Background glow effect */}
      <div
        className="pointer-events-none absolute -top-20 right-0 size-40 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-[0.07]"
        style={{ backgroundColor: agent.themeColor.hex }}
      />

      {/* Scan line effect on hover */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <div
          className="absolute inset-x-0 h-12 animate-scan-line"
          style={{
            background: `linear-gradient(180deg, transparent, ${agent.themeColor.hex}08, transparent)`,
          }}
        />
      </div>

      <div className="relative p-5">
        {/* Header: Icon/Image + Name + Status */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Agent Image/Icon */}
            <div
              className={cn(
                "relative flex size-12 overflow-hidden items-center justify-center rounded-xl bg-black/40 border border-white/10 shadow-lg transition-transform duration-300 group-hover:scale-110"
              )}
              style={{ boxShadow: `0 8px 24px ${agent.themeColor.hex}25` }}
            >
              {agent.image ? (
                <Image
                  src={agent.image}
                  alt={agent.name}
                  width={48}
                  height={48}
                  className="size-full object-cover"
                />
              ) : (
                <span className="relative z-10 font-bold font-mono text-sm" style={{ color: agent.themeColor.hex }}>
                  {agent.name.slice(0, 2)}
                </span>
              )}
              <div
                className="absolute inset-0 rounded-xl opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-40"
                style={{ backgroundColor: agent.themeColor.hex }}
              />
            </div>

            <div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                {agent.name}
              </h3>
              <p className="text-xs font-medium text-muted-foreground">
                {agent.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusDot status={agent.status} />
            <StatusBadge status={agent.status} />
          </div>
        </div>

        {/* Quote / Description */}
        <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/80">
          {agent.quote}
        </p>

        {/* Stats Row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground/60">
              Uptime
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">
              {agent.uptime}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground/60">
              Tasks
            </p>
            <p className="mt-0.5 text-sm font-bold text-foreground">
              {agent.tasksCompleted.toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2.5 text-center">
            <p className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground/60">
              Profile
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-amber-300 capitalize truncate">
              {agent.hermesProfileKey}
            </p>
          </div>
        </div>

        {/* Progress bar (when executing) */}
        {isExecuting && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                Executing task...
              </span>
              <span
                className="text-xs font-mono font-bold"
                style={{ color: agent.themeColor.hex }}
              >
                {Math.min(Math.round(progress), 100)}%
              </span>
            </div>
            <Progress
              value={Math.min(progress, 100)}
              className="h-1.5"
            />
          </div>
        )}

        {/* Execute Button */}
        <div className="mt-4">
          <Button
            id={`execute-${agent.id}`}
            onClick={handleExecute}
            disabled={isExecuting}
            className={cn(
              "w-full h-10 rounded-xl font-semibold text-sm tracking-wide transition-all duration-300",
              "bg-gradient-to-r hover:shadow-lg",
              agent.themeColor.bgGradient,
              "text-white hover:opacity-90",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            style={{
              boxShadow: isExecuting
                ? "none"
                : `0 4px 16px ${agent.themeColor.hex}30`,
            }}
          >
            {isExecuting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="size-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                Execute
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
