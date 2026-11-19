import { SEVERITIES, type Severity } from "../api";
import { SrTable, TipTitle, useTooltip } from "./charts";
import { cx, pct, SEVERITY_COLOR, SEVERITY_LABEL, SeverityDot, TONE_COLOR } from "./ui";

// ------------------------------------------------------------------ issues by category, stacked by severity (Security page)

export function CategorySeverityBars({ rows }: { rows: { category: string; counts: Record<Severity, number> }[] }) {
  const { ref, bind, node } = useTooltip();
  const sevs = SEVERITIES.filter((s) => s !== "info");
  const data = rows
    .map((r) => ({ ...r, total: sevs.reduce((sum, s) => sum + r.counts[s], 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  if (!data.length) return <p className="text-sm text-slate-500">No open issues.</p>;
  const max = Math.max(...data.map((r) => r.total));
  return (
    <div ref={ref} className="relative">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {sevs.map((s) => <span key={s} className="flex items-center gap-1.5"><SeverityDot severity={s} />{SEVERITY_LABEL[s]}</span>)}
      </div>
      <div className="space-y-2.5">
        {data.map((r) => (
          <div key={r.category} className="flex items-center gap-3 text-sm">
            <span className="w-36 shrink-0 truncate text-slate-700 sm:w-44" title={r.category}>{r.category}</span>
            <div className="flex-1">
              <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-r" style={{ width: `${(r.total / max) * 100}%` }}>
                {sevs.filter((s) => r.counts[s] > 0).map((s) => (
                  <div
                    key={s}
                    className="h-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    style={{ flexGrow: r.counts[s], flexBasis: 0, background: SEVERITY_COLOR[s] }}
                    {...bind(
                      <><TipTitle>{r.category}</TipTitle>{SEVERITY_LABEL[s]}: {r.counts[s]} of {r.total} issues ({pct(r.counts[s], r.total)}%)</>,
                      `${r.category}, ${SEVERITY_LABEL[s]}: ${r.counts[s]} issues`,
                    )}
                  />
                ))}
              </div>
            </div>
            <span className="tabular w-8 text-right text-slate-700">{r.total}</span>
          </div>
        ))}
      </div>
      {node}
      <SrTable
        caption="Open issues by category and severity"
        head={["Category", ...sevs.map((s) => SEVERITY_LABEL[s]), "Total"]}
        rows={data.map((r) => [r.category, ...sevs.map((s) => r.counts[s]), r.total])}
      />
    </div>
  );
}

// ------------------------------------------------------------------ current vs potential score (Recommendations page)

export function PotentialScoreBars({ rows }: { rows: { id: number; name: string; current: number; potential: number }[] }) {
  const { ref, bind, node } = useTooltip();
  const data = [...rows].sort((a, b) => b.potential - b.current - (a.potential - a.current));
  return (
    <div ref={ref} className="relative">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--series-1)" }} aria-hidden />Current score</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: "var(--series-1-gain)" }} aria-hidden />Gain from fixing critical &amp; high issues</span>
      </div>
      <div className="space-y-2.5">
        {data.map((r) => {
          const gain = r.potential - r.current;
          return (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 truncate text-slate-700 sm:w-44" title={r.name}>{r.name}</span>
              <div
                className="flex h-3.5 flex-1 gap-0.5 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                {...bind(
                  <><TipTitle>{r.name}</TipTitle>Now {r.current}% · after fixes {r.potential}% ({gain > 0 ? `+${gain}` : "no change"})</>,
                  `${r.name}: ${r.current} percent now, ${r.potential} percent after fixing critical and high issues`,
                )}
              >
                {r.current > 0 && <div className={cx("h-full", gain === 0 && "rounded-r")} style={{ width: `${r.current}%`, background: "var(--series-1)" }} />}
                {gain > 0 && <div className="h-full rounded-r" style={{ width: `${gain}%`, background: "var(--series-1-gain)" }} />}
              </div>
              <span className="tabular w-28 text-right text-slate-700">
                {r.current}% <span className="text-slate-400">→</span> <b className="text-slate-900">{r.potential}%</b>
              </span>
            </div>
          );
        })}
      </div>
      {node}
      <SrTable caption="Score now and after fixing critical and high issues" head={["Site", "Now", "After fixes"]} rows={data.map((r) => [r.name, `${r.current}%`, `${r.potential}%`])} />
    </div>
  );
}

// ------------------------------------------------------------------ response time by site (Performance page)

export const msTone = (ms: number) => (ms <= 400 ? "good" : ms <= 800 ? "warning" : "critical") as "good" | "warning" | "critical";
const MS_WORD = { good: "Fast", warning: "Slow", critical: "Very slow" };

export function ResponseTimeBars({ rows, onSelect }: { rows: { id: number; name: string; ms: number }[]; onSelect?: (id: number) => void }) {
  const { ref, bind, node } = useTooltip();
  const data = [...rows].sort((a, b) => b.ms - a.ms);
  const max = Math.max(1000, ...data.map((r) => r.ms));
  const target = (400 / max) * 100;
  return (
    <div ref={ref} className="relative">
      <div className="space-y-2.5">
        {data.map((r) => {
          const tone = msTone(r.ms);
          return (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 truncate text-slate-700 sm:w-44" title={r.name}>{r.name}</span>
              <div className="relative h-3.5 flex-1">
                <div className="absolute -inset-y-1 w-px bg-slate-300" style={{ left: `${target}%` }} aria-hidden />
                <div
                  className={cx("relative h-full rounded-r outline-none focus-visible:ring-2 focus-visible:ring-cyan-500", onSelect && "cursor-pointer")}
                  style={{ width: `${Math.max(1, (r.ms / max) * 100)}%`, background: TONE_COLOR[tone] }}
                  onClick={() => onSelect?.(r.id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect?.(r.id)}
                  {...bind(<><TipTitle>{r.name}</TipTitle>{r.ms} ms server response · {MS_WORD[tone]}</>, `${r.name}: ${r.ms} milliseconds, ${MS_WORD[tone]}`)}
                />
              </div>
              <span className="tabular w-20 text-right text-slate-700">{r.ms} ms</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--chart-grid)] pt-2 text-xs text-slate-600">
        {(["good", "warning", "critical"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[t] }} aria-hidden />
            {{ good: "Fast (≤400 ms)", warning: "Slow (≤800 ms)", critical: "Very slow (>800 ms)" }[t]}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-slate-400" aria-hidden />400 ms target</span>
      </div>
      {node}
      <SrTable caption="Server response time by site" head={["Site", "Response time"]} rows={data.map((r) => [r.name, `${r.ms} ms`])} />
    </div>
  );
}
