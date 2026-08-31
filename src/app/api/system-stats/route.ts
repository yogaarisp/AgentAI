import { NextRequest, NextResponse } from "next/server";
import os from "os";
import { readFileSync } from "fs";
import { statfs } from "fs/promises";

export const dynamic = "force-dynamic";

function memAvailableBytes(): number | null {
  try {
    const m = readFileSync("/proc/meminfo", "utf8");
    const match = m.match(/MemAvailable:\s+(\d+) kB/);
    if (match) return Number(match[1]) * 1024;
  } catch {
    /* non-linux */
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const cores = os.cpus().length || 1;
    const load = os.loadavg()[0] ?? 0;
    const cpuPct = Math.min(100, Math.round((load / cores) * 100));

    const total = os.totalmem();
    const avail = memAvailableBytes() ?? os.freemem();
    const used = Math.max(0, total - avail);
    const ramPct = Math.round((used / total) * 100);

    let diskPct: number | null = null;
    try {
      const st = await statfs(process.cwd());
      const diskTotal = Number(st.blocks) * Number(st.bsize);
      const diskFree = Number(st.bavail) * Number(st.bsize);
      if (diskTotal > 0) diskPct = Math.round(((diskTotal - diskFree) / diskTotal) * 100);
    } catch {
      diskPct = null;
    }

    let cpuModel = "";
    try {
      cpuModel = os.cpus()[0]?.model?.trim().slice(0, 40) ?? "";
    } catch {
      cpuModel = "";
    }

    const visitorIp =
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "-";

    return NextResponse.json({
      success: true,
      cpuPct,
      ramPct,
      diskPct,
      ramUsedGb: +(used / 1024 ** 3).toFixed(1),
      ramTotalGb: +(total / 1024 ** 3).toFixed(1),
      uptimeSec: Math.round(os.uptime()),
      visitorIp,
      hostname: os.hostname(),
      cpuModel,
      cores,
    });
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
