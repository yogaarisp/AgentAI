"use client";

import { cn } from "@/lib/utils";

const stats = [
  {
    label: "Total Agents",
    value: "4",
    change: "All connected",
    changeType: "positive" as const,
    icon: (
      <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    accentHex: "#8b5cf6",
  },
  {
    label: "Tasks Completed",
    value: "2,863",
    change: "+127 today",
    changeType: "positive" as const,
    icon: (
      <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    accentHex: "#22d3ee",
  },
  {
    label: "System Uptime",
    value: "99.9%",
    change: "Last 30 days",
    changeType: "neutral" as const,
    icon: (
      <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
    accentHex: "#34d399",
  },
  {
    label: "Active Processes",
    value: "12",
    change: "3 queued",
    changeType: "neutral" as const,
    icon: (
      <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    accentHex: "#fbbf24",
  },
];

export default function StatsOverview() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={cn(
            "group relative overflow-hidden rounded-xl border border-border/30 bg-card/40 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/60 hover:bg-card/60",
            "animate-fade-in-up"
          )}
          style={{
            animationDelay: `${i * 80}ms`,
            animationFillMode: "backwards",
          }}
        >
          {/* Subtle gradient corner */}
          <div
            className="pointer-events-none absolute -top-8 -right-8 size-16 rounded-full opacity-[0.06] blur-2xl transition-opacity duration-500 group-hover:opacity-[0.12]"
            style={{ backgroundColor: stat.accentHex }}
          />

          <div className="flex items-center justify-between">
            <div
              className="flex size-9 items-center justify-center rounded-lg transition-colors duration-300"
              style={{
                backgroundColor: `${stat.accentHex}15`,
                color: stat.accentHex,
              }}
            >
              {stat.icon}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {stat.value}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">
                {stat.label}
              </p>
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  stat.changeType === "positive"
                    ? "text-emerald-400"
                    : "text-muted-foreground/60"
                )}
              >
                {stat.change}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
