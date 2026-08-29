"use client";

import { useState, useRef, MouseEvent } from "react";
import Image from "next/image";
import type { Agent } from "@/lib/agents";

interface Props {
  agent: Agent;
  onExecute: (agent: Agent) => void;
}

export default function Stage3D({ agent, onExecute }: Props) {
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    // Subtle 3D tilt
    const rX = ((y - centerY) / centerY) * -10;
    const rY = ((x - centerX) / centerX) * 10;
    setRotateX(rX);
    setRotateY(rY);
  };

  const handleMouseLeave = () => {
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-6 px-4 md:px-8">
      {/* 3D Holo Character Stage (Left/Center 6 cols) */}
      <div className="lg:col-span-6 flex justify-center perspective-1500">
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
            transition: "transform 0.15s ease-out",
          }}
          className="relative w-full max-w-[440px] aspect-[3/4] rounded-2xl p-4 preserve-3d cursor-pointer group select-none"
        >
          {/* Cyber Ambient Aura Background */}
          <div
            className="absolute inset-0 rounded-3xl opacity-30 blur-3xl transition-colors duration-700 pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${agent.themeColor.hex}, transparent 70%)`,
            }}
          />

          {/* Glowing HUD Border Box */}
          <div
            className="absolute inset-0 rounded-2xl border transition-all duration-500 overflow-hidden bg-black/40 backdrop-blur-md shadow-2xl"
            style={{
              borderColor: `${agent.themeColor.hex}40`,
              boxShadow: `0 0 40px ${agent.themeColor.hex}15`,
            }}
          >
            {/* Top-Left Corner HUD */}
            <div
              className="absolute top-3 left-3 flex items-center gap-2 z-20 px-2.5 py-1 rounded-md bg-black/60 border border-white/10"
            >
              <span
                className={`size-2 rounded-full inline-block ${agent.status === "offline" ? "" : "animate-ping"}`}
                style={{
                  backgroundColor: agent.status === "offline" ? "#71717a" : agent.themeColor.hex,
                }}
              />
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-white/90">
                • {agent.status === "offline" ? "OFFLINE" : "ONLINE"}
              </span>
            </div>

            {/* Top-Right Profile Badge Link */}
            <a
              href={agent.hermesProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/70 hover:bg-black/90 border border-white/15 text-[10px] font-mono font-bold tracking-wider text-amber-300 transition-all hover:scale-105"
            >
              <span className="capitalize">{agent.hermesProfileKey}</span>
              <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>

            {/* Cyber Corner HUD Brackets */}
            <div
              className="absolute top-2 left-2 size-6 hud-bracket-tl pointer-events-none z-20"
              style={{ borderColor: agent.themeColor.hex }}
            />
            <div
              className="absolute top-2 right-2 size-6 hud-bracket-tr pointer-events-none z-20"
              style={{ borderColor: agent.themeColor.hex }}
            />
            <div
              className="absolute bottom-2 left-2 size-6 hud-bracket-bl pointer-events-none z-20"
              style={{ borderColor: agent.themeColor.hex }}
            />
            <div
              className="absolute bottom-2 right-2 size-6 hud-bracket-br pointer-events-none z-20"
              style={{ borderColor: agent.themeColor.hex }}
            />

            {/* Background 3D Light Beam behind character */}
            <div
              className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at 50% 100%, ${agent.themeColor.hex} 0%, transparent 65%)`,
              }}
            />

            {/* High-res 3D Character Studio Image */}
            <div className="relative w-full h-full flex items-end justify-center overflow-hidden">
              <Image
                src={agent.image}
                alt={agent.name}
                fill
                priority
                className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 440px"
              />

              {/* Bottom gradient fade & floor reflection effect */}
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/60 to-transparent z-10" />

              {/* Holographic Name Overlay at bottom of card */}
              <div className="absolute bottom-4 left-4 z-20 flex flex-col">
                <span className="text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  {agent.name}
                </span>
                <span
                  className="text-xs font-mono font-medium tracking-wider"
                  style={{ color: agent.themeColor.hex }}
                >
                  {agent.role}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Details Panel (6 cols) */}
      <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
        {/* Category Badge & Hermes Profile Link */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono font-bold tracking-[0.25em] uppercase"
              style={{ color: agent.themeColor.hex }}
            >
              {agent.category}
            </span>
          </div>

          <a
            href={agent.hermesProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-amber-300 transition-colors bg-white/[0.04] px-2.5 py-1 rounded-lg border border-white/10"
          >
            <span>Hermes Profile: <strong>{agent.hermesProfileKey}</strong></span>
            <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        {/* Big Bold Name & Title */}
        <div className="space-y-1">
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-white uppercase">
            {agent.name}
          </h1>
          <p className="text-xl md:text-2xl font-semibold text-zinc-300">
            {agent.title}
          </p>
          <div
            className="w-16 h-1 rounded-full mt-2"
            style={{ backgroundColor: agent.themeColor.hex }}
          />
        </div>

        {/* Capabilities list */}
        <div className="space-y-2.5 py-1">
          {agent.capabilities.map((cap, idx) => (
            <div key={idx} className="flex items-start gap-3 text-sm text-zinc-300 leading-relaxed">
              <span
                className="size-2 rounded-full mt-1.5 shrink-0"
                style={{
                  backgroundColor: agent.themeColor.hex,
                  boxShadow: `0 0 8px ${agent.themeColor.hex}`,
                }}
              />
              <span>{cap}</span>
            </div>
          ))}
        </div>

        {/* Quote / Tagline */}
        <div className="border-l-2 pl-4 py-1 border-white/20 italic text-sm font-medium text-zinc-400">
          &ldquo;{agent.quote}&rdquo;
        </div>

        {/* System Specs Strip */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
              STATUS
            </span>
            <span
              className="text-xs font-mono font-bold tracking-wider uppercase block mt-1"
              style={{ color: agent.status === "offline" ? "#71717a" : agent.themeColor.hex }}
            >
              {agent.status}
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
              UPTIME
            </span>
            <span className="text-xs font-mono font-bold text-white block mt-1">
              {agent.uptime}
            </span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
              HERMES PROFILE
            </span>
            <span className="text-xs font-mono font-bold text-amber-300 block mt-1 truncate capitalize">
              {agent.hermesProfileKey}
            </span>
          </div>
        </div>

        {/* Action Buttons: Execute & Open Hermes */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            id={`execute-hero-${agent.id}`}
            onClick={() => onExecute(agent)}
            className="flex-1 h-12 rounded-xl font-mono font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 transition-all duration-300 hover:brightness-110 active:scale-[0.98] shadow-lg cursor-pointer"
            style={{
              backgroundColor: agent.themeColor.hex,
              color: "#000",
              boxShadow: `0 0 25px ${agent.themeColor.hex}50`,
            }}
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L10.5 9.75h9.75L9.75 21.75 13.5 13.5H3.75z" />
            </svg>
            EXECUTE VIA API
          </button>

          <a
            href={agent.hermesProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 h-12 rounded-xl font-mono font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all duration-200 border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.1] hover:border-amber-400/50"
          >
            <svg className="size-4 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            OPEN IN HERMES
          </a>
        </div>
      </div>
    </div>
  );
}
