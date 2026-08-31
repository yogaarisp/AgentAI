"use client";

import { useEffect, useRef } from "react";
import type { Agent } from "@/lib/agents";

interface Props {
  agents: Agent[];
  onSelect?: (agent: Agent) => void;
}

export default function BrainCore({ agents, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodesRef = useRef<{ id: string; x: number; y: number }[]>([]);
  const agentsRef = useRef(agents);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const rx = Math.max(120, w * 0.33);
      const ry = Math.max(90, h * 0.28);
      const list = agentsRef.current;

      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 64);
      coreGrad.addColorStop(0, "rgba(245,158,11,0.5)");
      coreGrad.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(cx, cy, 13 + Math.sin(t * 2.4) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("KEETECH CORE", cx, cy - 28);

      const positions = list.map((a, i) => {
        const ang = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(list.length, 1) + t * 0.06;
        return { agent: a, x: cx + Math.cos(ang) * rx, y: cy + Math.sin(ang) * ry };
      });
      nodesRef.current = positions.map((p) => ({ id: p.agent.id, x: p.x, y: p.y }));

      positions.forEach((p, i) => {
        const online = p.agent.status !== "offline";
        const color = online ? p.agent.themeColor.hex : "#71717a";
        ctx.strokeStyle = online ? color + "55" : "#71717a33";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();

        const speed = 0.25 + (i % 3) * 0.07;
        for (let k = 0; k < 2; k++) {
          const phase = (t * speed + k * 0.5 + i * 0.13) % 1;
          const px = cx + (p.x - cx) * phase;
          const py = cy + (p.y - cy) * phase;
          const alpha = Math.sin(Math.PI * phase) * (online ? 0.9 : 0.3);
          ctx.fillStyle = online ? color : "#71717a";
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(px, py, 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });

      positions.forEach((p) => {
        const online = p.agent.status !== "offline";
        const color = online ? p.agent.themeColor.hex : "#71717a";
        const pulse = (t % 1.6) / 1.6;
        if (online) {
          ctx.globalAlpha = (1 - pulse) * 0.5;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9 + pulse * 10, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
        g.addColorStop(0, color + "aa");
        g.addColorStop(1, color + "00");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = online ? color : "#52525b";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e4e4e7";
        ctx.font = "700 9px ui-monospace, monospace";
        ctx.fillText(p.agent.displayName.toUpperCase(), p.x, p.y + 25);
        ctx.fillStyle = online ? "#a1a1aa" : "#71717a";
        ctx.font = "7px ui-monospace, monospace";
        ctx.fillText(online ? "ONLINE" : "OFFLINE", p.x, p.y + 36);
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onPointer = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      let bestId = "";
      let bestD = 32;
      for (const n of nodesRef.current) {
        const d = Math.hypot(n.x - mx, n.y - my);
        if (d < bestD) {
          bestD = d;
          bestId = n.id;
        }
      }
      if (bestId) {
        const found = agentsRef.current.find((a) => a.id === bestId);
        if (found) selectRef.current?.(found);
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-[340px] md:h-[400px] cursor-pointer block" />;
}
