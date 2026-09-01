"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { agents } from "@/lib/agents";

type ProviderKind = "gemini" | "openai-compatible" | "nine-router";

interface EntryForm {
  provider: ProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  hasKey?: boolean;
  maskedKey?: string;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-3.6-flash";
const NINE_ROUTER_BASE = "https://api.9router.com/v1";

const PROVIDER_LABELS: Record<ProviderKind, string> = {
  gemini: "Gemini (Google AI Studio)",
  "openai-compatible": "OpenAI-compatible",
  "nine-router": "Nine Router",
};

/** nine-router dieksekusi jalur OpenAI-compatible (Bearer + /models). */
function wireProtocol(p: ProviderKind): "gemini" | "openai-compatible" {
  return p === "gemini" ? "gemini" : "openai-compatible";
}

function defaultBase(p: ProviderKind): string {
  if (p === "gemini") return GEMINI_BASE;
  if (p === "nine-router") return NINE_ROUTER_BASE;
  return "https://api.openai.com/v1";
}

function emptyEntry(provider: ProviderKind = "gemini"): EntryForm {
  return {
    provider,
    baseUrl: defaultBase(provider),
    apiKey: "",
    model: provider === "gemini" ? GEMINI_MODEL : "",
  };
}

export default function SettingsPage() {
  const [primary, setPrimary] = useState<EntryForm>(emptyEntry());
  const [perAgent, setPerAgent] = useState<Record<string, EntryForm>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [modelLists, setModelLists] = useState<Record<string, string[]>>({});
  const [loadingModels, setLoadingModels] = useState<string | null>(null);
  const [modelMsg, setModelMsg] = useState<Record<string, string>>({});

  const fromServer = (e: EntryForm): EntryForm => ({ ...e, maskedKey: e.apiKey, apiKey: "" });

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setPrimary(fromServer(d.settings.primary));
          const pa: Record<string, EntryForm> = {};
          for (const [id, e] of Object.entries(d.settings.perAgent ?? {}) as [string, EntryForm][]) {
            pa[id] = fromServer(e);
          }
          setPerAgent(pa);
        }
      })
      .catch(() => {});
  }, []);

  const keyPlaceholder = (e: EntryForm) =>
    e.hasKey ? `tersimpan: ${e.maskedKey ?? "••••"} — kosongkan jika tidak diubah` : "tempel API key di sini";

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      // nine-router dieksekusi lewat jalur OpenAI-compatible di server.
      const mapEntry = (e: EntryForm): EntryForm => ({ ...e, provider: wireProtocol(e.provider) });
      const payload: { primary: EntryForm; perAgent: Record<string, EntryForm> } = {
        primary: mapEntry(primary),
        perAgent: {},
      };
      for (const [id, e] of Object.entries(perAgent)) {
        if (e.apiKey || e.hasKey) payload.perAgent[id] = mapEntry(e);
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.success) {
        setSaveMsg({ ok: true, text: "Settings tersimpan." });
        setPrimary(fromServer(d.settings.primary));
        const pa: Record<string, EntryForm> = {};
        for (const [id, e] of Object.entries(d.settings.perAgent ?? {}) as [string, EntryForm][]) {
          pa[id] = fromServer(e);
        }
        setPerAgent(pa);
      } else {
        setSaveMsg({ ok: false, text: d.error || "Gagal menyimpan" });
      }
    } catch (err: unknown) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : "Gagal menyimpan" });
    } finally {
      setSaving(false);
    }
  };

  const testSlot = async (slot: string, entry: EntryForm) => {
    setTesting(slot);
    setTestMsg((m) => ({ ...m, [slot]: { ok: true, text: "menguji..." } }));
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot, ...entry, provider: wireProtocol(entry.provider) }),
      });
      const d = await res.json();
      setTestMsg((m) => ({
        ...m,
        [slot]: d.success
          ? { ok: true, text: `OK — balasan: "${d.reply}" (${d.model})` }
          : { ok: false, text: d.error || "gagal" },
      }));
    } catch (err: unknown) {
      setTestMsg((m) => ({
        ...m,
        [slot]: { ok: false, text: err instanceof Error ? err.message : "gagal" },
      }));
    } finally {
      setTesting(null);
    }
  };

  /** Muat daftar model dari provider — URL + key dikirim ke server (bebas CORS). */
  const loadModels = async (slot: string, entry: EntryForm) => {
    setLoadingModels(slot);
    setModelMsg((m) => ({ ...m, [slot]: "" }));
    try {
      const res = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          provider: wireProtocol(entry.provider),
          baseUrl: entry.baseUrl || defaultBase(entry.provider),
          apiKey: entry.apiKey,
        }),
      });
      const d = await res.json();
      if (d.success && Array.isArray(d.models) && d.models.length) {
        setModelLists((m) => ({ ...m, [slot]: d.models }));
        // Auto-pilih model default kalau slot belum punya model.
        if (!entry.model) {
          const preferred =
            d.models.find((n: string) => n.includes("3.6-flash")) ??
            d.models.find((n: string) => n.includes("flash")) ??
            d.models[0];
          applyModel(slot, entry, preferred);
        }
      } else {
        setModelLists((m) => ({ ...m, [slot]: [] }));
        setModelMsg((m) => ({ ...m, [slot]: d.error || "Tidak ada model ditemukan" }));
      }
    } catch (err: unknown) {
      setModelMsg((m) => ({ ...m, [slot]: err instanceof Error ? err.message : "gagal memuat model" }));
    } finally {
      setLoadingModels(null);
    }
  };

  const applyModel = (slot: string, entry: EntryForm, model: string) => {
    if (slot === "primary") {
      setPrimary((p) => ({ ...p, model }));
    } else {
      setPerAgent((m) => ({ ...m, [slot]: { ...entry, model } }));
    }
  };

  const updatePrimary = (patch: Partial<EntryForm>) => setPrimary((p) => ({ ...p, ...patch }));
  const updateAgent = (id: string, patch: Partial<EntryForm>) =>
    setPerAgent((m) => ({ ...m, [id]: { ...(m[id] ?? emptyEntry()), ...patch } }));

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-white placeholder-zinc-600 focus:border-amber-400/50 focus:outline-none";
  const labelCls = "mb-1 block text-[10px] font-mono font-bold tracking-[0.15em] text-zinc-500 uppercase";

  const providerFields = (slot: string, entry: EntryForm, onChange: (p: Partial<EntryForm>) => void) => {
    const isGemini = entry.provider === "gemini";
    const models = modelLists[slot];
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Provider</label>
            <select
              value={entry.provider}
              onChange={(e) => {
                const p = e.target.value as ProviderKind;
                onChange({ provider: p, baseUrl: defaultBase(p), model: p === "gemini" ? GEMINI_MODEL : "" });
                setModelLists((m) => ({ ...m, [slot]: [] }));
              }}
              className={inputCls}
            >
              {(Object.keys(PROVIDER_LABELS) as ProviderKind[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            {models && models.length ? (
              <select
                value={entry.model}
                onChange={(e) => onChange({ model: e.target.value })}
                className={inputCls}
              >
                {!entry.model && <option value="">— pilih model —</option>}
                {models.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={entry.model}
                onChange={(e) => onChange({ model: e.target.value })}
                placeholder={isGemini ? GEMINI_MODEL : "isi key lalu klik MUAT MODEL"}
                className={inputCls}
              />
            )}
          </div>
        </div>

        {!isGemini && (
          <div>
            <label className={labelCls}>Base URL</label>
            <input
              value={entry.baseUrl}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              placeholder={defaultBase(entry.provider)}
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className={labelCls}>API Key</label>
          <div className="flex gap-2">
            <input
              type={showKey[slot] ? "text" : "password"}
              value={entry.apiKey}
              onChange={(e) => onChange({ apiKey: e.target.value })}
              placeholder={keyPlaceholder(entry)}
              className={inputCls}
            />
            <button
              onClick={() => setShowKey((m) => ({ ...m, [slot]: !m[slot] }))}
              className="rounded-lg border border-white/10 px-2 text-[10px] font-mono text-zinc-400 hover:text-white"
              title="tampilkan/sembunyikan"
            >
              {showKey[slot] ? "HIDE" : "SHOW"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => loadModels(slot, entry)}
            disabled={loadingModels === slot}
            className="rounded-lg border border-violet-400/40 px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest text-violet-300 hover:bg-violet-400/10 disabled:opacity-40"
          >
            {loadingModels === slot ? "MEMUAT..." : "MUAT MODEL"}
          </button>
          <button
            onClick={() => testSlot(slot, entry)}
            disabled={testing === slot}
            className="rounded-lg border border-cyan-400/40 px-3 py-1.5 text-[10px] font-mono font-bold tracking-widest text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40"
          >
            {testing === slot ? "TESTING..." : "TEST KONEKSI"}
          </button>
          {modelMsg[slot] && (
            <span className="text-[10px] font-mono text-red-400">{modelMsg[slot]}</span>
          )}
          {testMsg[slot] && (
            <span className={`text-[10px] font-mono ${testMsg[slot].ok ? "text-emerald-400" : "text-red-400"}`}>
              {testMsg[slot].text}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen bg-[#08080a] text-zinc-100 selection:bg-amber-500/30">
      <div className="fixed inset-0 hud-grid-dots pointer-events-none opacity-40" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-mono font-bold tracking-[0.2em] text-white">MODEL SETTINGS</h1>
            <p className="mt-1 text-[11px] font-mono text-zinc-500">
              Primary key dipakai semua agent. Fallback opsional per agent.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-mono text-zinc-400 hover:text-white"
          >
            ← DASHBOARD
          </Link>
        </div>

        {/* Urutan eksekusi */}
        <div className="mb-8 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] font-mono font-bold tracking-[0.2em] text-amber-400">URUTAN EKSEKUSI</p>
          <p className="mt-2 text-[11px] font-mono leading-relaxed text-zinc-400">
            1. <span className="text-white">PRIMARY</span> (Gemini / AI Studio key) → jika gagal{" "}
            <span className="text-white">2. FALLBACK PER-AGENT</span>: Hermes gateway dengan{" "}
            <span className="text-white">profil agent masing-masing</span> sesuai setup server Hermes
            (keemes→keehermes, kirana→kirana, keedev→keedev, dst). Key custom di bawah hanya opsional
            bila ingin fallback ke LLM lain sebelum Hermes.
          </p>
        </div>

        {/* Primary */}
        <section className="mb-8 rounded-xl border border-amber-400/25 bg-black/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] font-mono font-bold tracking-[0.2em] text-amber-400">★ PRIMARY — SEMUA AGENT</h2>
            {primary.hasKey && (
              <span className="rounded border border-emerald-400/30 px-1.5 py-0.5 text-[9px] font-mono text-emerald-400">
                KEY TERPASANG
              </span>
            )}
          </div>
          {providerFields("primary", primary, updatePrimary)}
        </section>

        {/* Fallback per agent */}
        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-mono font-bold tracking-[0.2em] text-zinc-400">
            FALLBACK PER-AGENT <span className="text-zinc-600">(opsional)</span>
          </h2>
          <div className="space-y-3">
            {agents.map((a) => {
              const entry = perAgent[a.id] ?? { ...emptyEntry(), apiKey: "", hasKey: false, maskedKey: undefined };
              const active = Boolean(perAgent[a.id]?.hasKey || perAgent[a.id]?.apiKey);
              return (
                <div key={a.id} className={`rounded-xl border p-4 ${active ? "border-emerald-400/20 bg-black/40" : "border-white/10 bg-black/20"}`}>
                  <details>
                    <summary className="flex cursor-pointer list-none items-center justify-between">
                      <span className="text-[11px] font-mono font-bold text-white">
                        {a.displayName} <span className="ml-2 text-zinc-600">/{a.id}</span>
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500">
                        {active ? <span className="text-emerald-400">FALLBACK AKTIF ▾</span> : "belum diisi ▾"}
                      </span>
                    </summary>
                    <div className="mt-4">
                      {providerFields(a.id, entry, (patch) => updateAgent(a.id, patch))}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        </section>

        {/* Save */}
        <div className="sticky bottom-4 flex items-center gap-4 rounded-xl border border-white/10 bg-black/80 p-4 backdrop-blur">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-amber-500 px-5 py-2 text-[11px] font-mono font-bold tracking-widest text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {saving ? "MENYIMPAN..." : "SIMPAN SETTINGS"}
          </button>
          {saveMsg && (
            <span className={`text-[11px] font-mono ${saveMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {saveMsg.text}
            </span>
          )}
          <span className="ml-auto text-[9px] font-mono text-zinc-600">
            key disimpan di server (.data/) — tidak ikut git
          </span>
        </div>
      </div>
    </div>
  );
}
