export type AgentStatus = "active" | "standby" | "running" | "offline";

export interface Agent {
  id: string;
  num: string;
  category: string;
  name: string;
  displayName: string;
  role: string;
  title: string;
  image: string;
  quote: string;
  capabilities: string[];
  status: AgentStatus;
  hermesProfileKey: string;
  hermesProfileUrl: string;
  themeColor: {
    primary: string;
    hex: string;
    border: string;
    glow: string;
    bgGradient: string;
    badgeBg: string;
    badgeText: string;
  };
  uptime: string;
  tasksCompleted: number;
  runsOn: string;
  lastActive: string;
  systemSpecs: {
    latency: string;
    model: string;
    memory: string;
    concurrency: string;
  };
}

export const agents: Agent[] = [
  {
    id: "keemes",
    num: "01 / 05",
    category: "01 / OPERATOR",
    name: "KEEMES",
    displayName: "Keemes",
    role: "CEO ",
    title: "The Master Orchestrator",
    image: "/agents/keemes.jpg",
    quote: "Directs the hive mind with absolute precision.",
    hermesProfileKey: "keehermes",
    hermesProfileUrl: "https://hermes.keetech.my.id/profiles?profile=keehermes",
    capabilities: [
      "Orchestrates and routes multi-agent workflows with zero latency",
      "Direct socket link to Keehermes (Hermes) backend core",
      "Autonomous exception handling & sub-agent synchronization",
      "Real-time resource allocation and priority dispatching",
    ],
    status: "active",
    themeColor: {
      primary: "amber",
      hex: "#f59e0b",
      border: "border-amber-500/50",
      glow: "rgba(245, 158, 11, 0.25)",
      bgGradient: "from-amber-500/20 via-amber-950/10 to-transparent",
      badgeBg: "bg-amber-500/10 border-amber-500/30",
      badgeText: "text-amber-400",
    },
    uptime: "99.9%",
    tasksCompleted: 1428,
    runsOn: "KIRANA HERMES",
    lastActive: "Active Now",
    systemSpecs: {
      latency: "14ms",
      model: "Hermes-3-Llama-3.1-70B",
      memory: "128 GB Unified",
      concurrency: "64 threads",
    },
  },
  {
    id: "kirana",
    num: "02 / 05",
    category: "02 / SEO",
    name: "KIRANA",
    displayName: "Kirana",
    role: "SEO & Content Growth",
    title: "The Visibility Strategist",
    image: "/agents/kirana.jpg",
    quote: "Puts the brand on page one — and keeps it there.",
    hermesProfileKey: "kirana",
    hermesProfileUrl: "https://hermes.keetech.my.id/profiles?profile=kirana",
    capabilities: [
      "Full keyword research, clustering & SERP intent mapping",
      "Technical SEO audits: Core Web Vitals, schema & crawl health",
      "Automated content briefs & on-page optimization at scale",
      "Backlink strategy, rank tracking & competitor gap analysis",
    ],
    status: "active",
    themeColor: {
      primary: "violet",
      hex: "#a855f7",
      border: "border-violet-500/50",
      glow: "rgba(168, 85, 247, 0.25)",
      bgGradient: "from-violet-500/20 via-violet-950/10 to-transparent",
      badgeBg: "bg-violet-500/10 border-violet-500/30",
      badgeText: "text-violet-400",
    },
    uptime: "99.9%",
    tasksCompleted: 856,
    runsOn: "HERMES / SEO CORE",
    lastActive: "Crawling SERPs",
    systemSpecs: {
      latency: "16ms",
      model: "Hermes / AI-KEE",
      memory: "64 GB Unified",
      concurrency: "24 threads",
    },
  },
  {
    id: "keedev",
    num: "03 / 05",
    category: "03 / ENGINEERING",
    name: "KEEDEV",
    displayName: "Keedev",
    role: "Developer AI Agent",
    title: "The Fullstack Architect",
    image: "/agents/keedev.jpg",
    quote: "Turns complex architecture into clean production code in seconds.",
    hermesProfileKey: "keedev",
    hermesProfileUrl: "https://hermes.keetech.my.id/profiles?profile=keedev",
    capabilities: [
      "End-to-end fullstack code generation & architectural scaffolding",
      "Automated unit testing, linting & self-healing bug detection",
      "CI/CD deployment pipeline execution & containerization",
      "Deep semantic repo analysis & dependency auditing",
    ],
    status: "running",
    themeColor: {
      primary: "cyan",
      hex: "#06b6d4",
      border: "border-cyan-500/50",
      glow: "rgba(6, 182, 212, 0.25)",
      bgGradient: "from-cyan-500/20 via-cyan-950/10 to-transparent",
      badgeBg: "bg-cyan-500/10 border-cyan-500/30",
      badgeText: "text-cyan-400",
    },
    uptime: "98.7%",
    tasksCompleted: 984,
    runsOn: "HERMES / DEVBOT",
    lastActive: "Compiling task",
    systemSpecs: {
      latency: "22ms",
      model: "Claude 3.7 Sonnet / DevBot",
      memory: "64 GB Unified",
      concurrency: "32 workers",
    },
  },
  {
    id: "keeinfra",
    num: "04 / 05",
    category: "04 / INFRASTRUCTURE",
    name: "KEEINFRA",
    displayName: "Keeinfra",
    role: "Infrastructure Management",
    title: "The Cloud & SRE Guardian",
    image: "/agents/keeinfra.jpg",
    quote: "Guarantees 99.99% uptime with autonomous auto-healing clusters.",
    hermesProfileKey: "keeinfra",
    hermesProfileUrl: "https://hermes.keetech.my.id/profiles?profile=keeinfra",
    capabilities: [
      "Kubernetes cluster provisioning & auto-scaling node pools",
      "Edge caching, CDN routing & DDoS mitigations",
      "Real-time distributed telemetry, Prometheus & Grafana alerting",
      "Automated failover protocols & disaster recovery sweeps",
    ],
    status: "active",
    themeColor: {
      primary: "emerald",
      hex: "#10b981",
      border: "border-emerald-500/50",
      glow: "rgba(16, 185, 129, 0.25)",
      bgGradient: "from-emerald-500/20 via-emerald-950/10 to-transparent",
      badgeBg: "bg-emerald-500/10 border-emerald-500/30",
      badgeText: "text-emerald-400",
    },
    uptime: "99.95%",
    tasksCompleted: 612,
    runsOn: "TERRAFORM / K8S",
    lastActive: "Monitoring nodes",
    systemSpecs: {
      latency: "8ms",
      model: "DeepSeek-R1 / Hermes",
      memory: "256 GB Distributed",
      concurrency: "128 nodes",
    },
  },
  {
    id: "keefin",
    num: "05 / 05",
    category: "05 / FINANCE",
    name: "KEEFIN",
    displayName: "Keefin",
    role: "Finance & Analytics",
    title: "The Quantitative Strategist",
    image: "/agents/keefin.jpg",
    quote: "Optimizes cloud spend, forecasting, and automated balance audits.",
    hermesProfileKey: "keefin",
    hermesProfileUrl: "https://hermes.keetech.my.id/profiles?profile=keefin",
    capabilities: [
      "Real-time multi-cloud cost intelligence & waste elimination",
      "Predictive financial runway modeling & cash flow forecasting",
      "Automated invoice reconciliation & audit logging",
      "ROI computation per agent workload & token utilization",
    ],
    status: "standby",
    themeColor: {
      primary: "amber",
      hex: "#fbbf24",
      border: "border-amber-400/50",
      glow: "rgba(251, 191, 36, 0.25)",
      bgGradient: "from-amber-400/20 via-amber-950/10 to-transparent",
      badgeBg: "bg-amber-400/10 border-amber-400/30",
      badgeText: "text-amber-300",
    },
    uptime: "97.8%",
    tasksCompleted: 420,
    runsOn: "QUANT HERMES CORE",
    lastActive: "Standby 15m ago",
    systemSpecs: {
      latency: "18ms",
      model: "GPT-4o / Hermes",
      memory: "64 GB Unified",
      concurrency: "16 pipelines",
    },
  },
];
