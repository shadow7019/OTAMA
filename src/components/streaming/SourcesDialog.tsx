"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, CircleCheck, CircleAlert, CircleX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface SourceStatus {
  name: string;
  role: string;
  state: "ok" | "degraded" | "down";
  latencyMs: number;
  results: number;
  host?: string;
  error?: string;
  checkedAt: number;
  uptimePct: number | null;
  runs: number;
}

interface SourceAnalysis {
  sources: SourceStatus[];
  checkedAt: number;
  durationMs: number;
  cached: boolean;
  summary: { ok: number; degraded: number; down: number; total: number };
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

const STATE_UI: Record<SourceStatus["state"], { dot: string; label: string; Icon: typeof CircleCheck }> = {
  ok: { dot: "bg-emerald-500", label: "Working", Icon: CircleCheck },
  degraded: { dot: "bg-amber-400", label: "Reachable, empty", Icon: CircleAlert },
  down: { dot: "bg-red-500", label: "Down", Icon: CircleX },
};

export function SourcesDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SourceAnalysis | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/torrent/sources${refresh ? "?refresh=1" : ""}`, {
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !data && !loading) load(false);
  }, [open, data, loading, load]);

  return (
    <Dialog open={open} onOpenChange={(v) => setOpen(v)}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Torrent source status"
          title="Torrent source status"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-300 transition hover:text-white"
        >
          <Activity className="h-4.5 w-4.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg border-white/10 bg-[#101018] text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Activity className="h-5 w-5 text-red-500" /> Torrent Source Analysis
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400">
            Live probe of every torrent source Otama searches. Sources marked down
            are skipped automatically — the others keep results flowing.
          </DialogDescription>
        </DialogHeader>

        {loading && !data && (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full bg-white/5" />
            ))}
          </div>
        )}

        {failed && !data && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
            Analysis failed to load — check your connection and retry.
          </p>
        )}

        {data && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-400">
                {data.summary.ok} working
              </span>
              {data.summary.degraded > 0 && (
                <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-300">
                  {data.summary.degraded} empty
                </span>
              )}
              {data.summary.down > 0 && (
                <span className="rounded-full bg-red-500/15 px-2.5 py-1 text-red-400">
                  {data.summary.down} down
                </span>
              )}
              <span className="text-zinc-500">of {data.summary.total} · scanned in {data.durationMs}ms</span>
              <button
                type="button"
                onClick={() => load(true)}
                disabled={loading}
                aria-label="Re-run source analysis"
                className="ml-auto flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Re-test
              </button>
            </div>

            <ul className="max-h-[52vh] space-y-1.5 overflow-y-auto pr-1">
              {data.sources.map((s) => {
                const ui = STATE_UI[s.state];
                return (
                  <li
                    key={s.name}
                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5"
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ui.dot} ${s.state !== "ok" ? "animate-pulse" : ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        {s.name}
                        <span className={`text-xs font-medium ${s.state === "ok" ? "text-emerald-400" : s.state === "degraded" ? "text-amber-300" : "text-red-400"}`}>
                          {ui.label}
                        </span>
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {s.role}
                        {s.host ? ` · via ${s.host}` : ""}
                        {s.error ? ` · ${s.error}` : ""}
                        {` · checked ${timeAgo(s.checkedAt)}`}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs text-zinc-400">
                      <div className="tabular-nums">{s.results} results</div>
                      <div className="tabular-nums">
                        {s.latencyMs}ms
                        {s.uptimePct !== null ? ` · ${s.uptimePct}% up` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <p className="text-[11px] leading-relaxed text-zinc-500">
              &ldquo;Empty&rdquo; means the source answered but returned nothing for the probe
              query — it may still work for other titles. Uptime is the share of recent
              scans and real searches where the source produced results.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
