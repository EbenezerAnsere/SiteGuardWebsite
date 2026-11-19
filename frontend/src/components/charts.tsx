import { useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { SEVERITIES, type Finding, type ScanListItem, type Severity } from "../api";
import { cx, pct, scoreTone, SEVERITY_COLOR, SEVERITY_LABEL, SeverityDot, TONE_COLOR } from "./ui";

// ------------------------------------------------------------------ shared plumbing

/** Tooltip anchored inside a relative container; works for mouse hover and keyboard focus. */
export function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);
  const place = (x: number, y: number, content: ReactNode) => {
    const box = ref.current?.getBoundingClientRect();
    if (box) setTip({ x: x - box.left, y: y - box.top, content });
  };
  const bind = (content: ReactNode, label: string) => ({
    tabIndex: 0,
    role: "img",
    "aria-label": label,
    onMouseMove: (e: MouseEvent) => place(e.clientX, e.clientY, content),
    onMouseLeave: () => setTip(null),
    onFocus: (e: FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, content);
    },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div
      className="pointer-events-none absolute z-20 w-max max-w-64 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-xl"
      style={{ left: tip.x, top: tip.y - 12 }}
    >
      {tip.content}
    </div>
  );
  return { ref, bind, node };
}

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Every chart also exists as a table for screen readers. */
export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

export const TipTitle = ({ children }: { children: ReactNode }) => <p className="mb-0.5 font-semibold text-slate-900">{children}</p>;

// ------------------------------------------------------------------ meter

/** Hero percentage plus a thin meter; the fill takes the status color of the score. */
export function ScoreMeter({ score, label = "Security score" }: { score: number | null; label?: string }) {
  const tone = scoreTone(score);
  const color = TONE_COLOR[tone];
  const word = { good: "Good", warning: "Needs work", critical: "At risk", none: "Not scanned" }[tone];
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold text-slate-900">{score ?? "–"}</span>
        {score != null && <span className="text-2xl font-semibold text-slate-500">%</span>}
        <span className="ml-auto flex items-center gap-1.5 text-sm text-slate-700">
          <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
          {word}
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 22%, var(--surface))` }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score ?? 0}
        aria-label={label}
      >
        <div className="h-full rounded-full transition-all" style={{ width: `${score ?? 0}%`, background: color }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ severity bars

/** Horizontal bar per severity: count and share of all failed checks. */
export function SeverityBars({ counts }: { counts: Record<Severity, number> }) {
  const { ref, bind, node } = useTooltip();
  const total = SEVERITIES.reduce((s, k) => s + counts[k], 0);
  const max = Math.max(1, ...SEVERITIES.map((k) => counts[k]));
  return (
    <div ref={ref} className="relative space-y-2.5">
      {SEVERITIES.map((sev) => {
        const n = counts[sev];
        const share = pct(n, total);
        return (
          <div key={sev} className="flex items-center gap-3 text-sm">
            <span className="flex w-20 items-center gap-2 text-slate-700"><SeverityDot severity={sev} />{SEVERITY_LABEL[sev]}</span>
            <div
              className="relative h-3.5 flex-1 rounded-r outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              {...bind(
                <><TipTitle>{SEVERITY_LABEL[sev]}</TipTitle>{n} issue{n === 1 ? "" : "s"} · {share}% of all issues</>,
                `${SEVERITY_LABEL[sev]}: ${n} issues, ${share} percent`,
              )}
            >
              {n > 0 && (
                <div className="h-full rounded-r" style={{ width: `${Math.max(2, (n / max) * 100)}%`, background: SEVERITY_COLOR[sev] }} />
              )}
            </div>
            <span className="tabular w-16 text-right text-slate-700">
              {n} <span className="text-slate-500">· {share}%</span>
            </span>
          </div>
        );
      })}
      <div className="border-t border-[var(--chart-grid)] pt-2 text-xs text-slate-500">{total} open issue{total === 1 ? "" : "s"} in total</div>
      {node}
      <SrTable caption="Issues by severity" head={["Severity", "Issues", "Share"]} rows={SEVERITIES.map((s) => [SEVERITY_LABEL[s], counts[s], `${pct(counts[s], total)}%`])} />
    </div>
  );
}

// ------------------------------------------------------------------ category pass rates

export function CategoryBars({ findings }: { findings: Finding[] }) {
  const { ref, bind, node } = useTooltip();
  const byCat = new Map<string, { passed: number; total: number; failing: string[] }>();
  for (const f of findings) {
    if (f.category === "Scanner") continue;
    const c = byCat.get(f.category) ?? { passed: 0, total: 0, failing: [] };
    c.total++;
    if (f.passed) c.passed++;
    else c.failing.push(f.title);
    byCat.set(f.category, c);
  }
  const rows = [...byCat.entries()]
    .map(([name, c]) => ({ name, ...c, rate: pct(c.passed, c.total) }))
    .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));

  return (
    <div ref={ref} className="relative space-y-3">
      {rows.map((r) => (
        <div key={r.name} className="text-sm">
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate text-slate-700">{r.name}</span>
            <span className="tabular shrink-0 text-slate-700">
              {r.rate}% <span className="text-slate-500">({r.passed}/{r.total})</span>
            </span>
          </div>
          <div
            className="h-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
            style={{ background: "var(--series-1-track)" }}
            {...bind(
              <>
                <TipTitle>{r.name}: {r.rate}% passed</TipTitle>
                {r.failing.length ? (
                  <ul className="list-disc pl-4 text-slate-700">{r.failing.slice(0, 4).map((t) => <li key={t}>{t}</li>)}</ul>
                ) : "Every check passed"}
              </>,
              `${r.name}: ${r.rate} percent of checks passed, ${r.passed} of ${r.total}`,
            )}
          >
            {r.rate > 0 && <div className="h-full rounded-full" style={{ width: `${r.rate}%`, background: "var(--series-1)" }} />}
          </div>
        </div>
      ))}
      {node}
      <SrTable caption="Checks passed by category" head={["Category", "Passed", "Total", "Rate"]} rows={rows.map((r) => [r.name, r.passed, r.total, `${r.rate}%`])} />
    </div>
  );
}

// ------------------------------------------------------------------ score history (columns)

export function ScoreHistoryChart({ scans, onSelect }: { scans: ScanListItem[]; onSelect?: (id: number) => void }) {
  const { ref, bind, node } = useTooltip();
  const width = useWidth(ref);
  const [hi, setHi] = useState<number | null>(null);
  const data = scans.filter((s) => s.status === "completed" && s.score != null).slice(0, 20).reverse();
  if (data.length === 0) return <p className="py-8 text-center text-sm text-slate-500">Scores will appear here after the first scan.</p>;

  const H = 180, top = 22, bottom = 24, left = 34, right = 8;
  const plotW = Math.max(0, width - left - right);
  const plotH = H - top - bottom;
  const band = plotW / Math.max(data.length, 1);
  const colW = Math.min(24, band * 0.6);
  const y = (v: number) => top + plotH - (v / 100) * plotH;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} className="block overflow-visible">
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--chart-axis)" : "var(--chart-grid)"} strokeWidth={1} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular" fontSize={11} fill="var(--ink-muted)">{t}%</text>
            </g>
          ))}
          {data.map((s, i) => {
            const v = s.score!;
            const x = left + band * i + (band - colW) / 2;
            const h = (v / 100) * plotH;
            const r = Math.min(4, h, colW / 2);
            const y0 = y(0), yt = y(v);
            const prev = data[i - 1]?.score;
            const delta = prev != null ? v - prev : null;
            const isLast = i === data.length - 1;
            return (
              <g key={s.id} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
                {/* hit target spans the full band, taller than the mark */}
                <rect
                  x={left + band * i}
                  y={top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  className={cx("outline-none", onSelect && "cursor-pointer")}
                  onClick={() => onSelect?.(s.id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect?.(s.id)}
                  {...bind(
                    <>
                      <TipTitle>{v}% · grade {s.grade}</TipTitle>
                      <p>{new Date(s.createdAt).toLocaleString()}</p>
                      <p className="text-slate-500">
                        {s.summary?.failed ?? 0} issue{s.summary?.failed === 1 ? "" : "s"} · {s.trigger}
                        {delta != null && delta !== 0 && ` · ${delta > 0 ? "+" : ""}${delta} vs previous`}
                      </p>
                    </>,
                    `${fmt(s.createdAt)}: score ${v} percent, grade ${s.grade}`,
                  )}
                />
                {/* a 0% scan still gets a 2px stub so every scan is visible */}
                {h === 0 && <rect pointerEvents="none" x={x} y={y0 - 2} width={colW} height={2} fill="var(--status-critical)" />}
                {h > 0 && (
                  <path
                    pointerEvents="none"
                    d={`M${x},${y0} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + colW - r} Q${x + colW},${yt} ${x + colW},${yt + r} V${y0} Z`}
                    fill="var(--series-1)"
                    opacity={hi === i || (hi === null && isLast) ? 1 : 0.6}
                  />
                )}
                {isLast && (
                  <text x={x + colW / 2} y={yt - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink-primary)" pointerEvents="none">
                    {v}%
                  </text>
                )}
              </g>
            );
          })}
          <text x={left} y={H - 6} fontSize={11} fill="var(--ink-muted)">{fmt(data[0].createdAt)}</text>
          {data.length > 1 && (
            <text x={width - right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--ink-muted)">{fmt(data[data.length - 1].createdAt)}</text>
          )}
        </svg>
      )}
      {node}
      <SrTable caption="Security score by scan" head={["Date", "Score", "Grade"]} rows={data.map((s) => [new Date(s.createdAt).toLocaleString(), `${s.score}%`, s.grade ?? ""])} />
    </div>
  );
}

// ------------------------------------------------------------------ per-site scores (dashboard)

export interface SiteScore {
  id: number;
  name: string;
  score: number | null;
  grade: string | null;
}

export function SiteScoreBars({ sites, onSelect }: { sites: SiteScore[]; onSelect: (id: number) => void }) {
  const { ref, bind, node } = useTooltip();
  const rows = [...sites].sort((a, b) => (a.score ?? -1) - (b.score ?? -1));
  return (
    <div ref={ref} className="relative space-y-2">
      {rows.map((s) => {
        const tone = scoreTone(s.score);
        const word = { good: "Good", warning: "Needs work", critical: "At risk", none: "Not scanned yet" }[tone];
        return (
          <div key={s.id} className="flex items-center gap-3 text-sm">
            <span className="w-32 truncate text-slate-700 sm:w-44" title={s.name}>{s.name}</span>
            <div
              className="h-3.5 flex-1 cursor-pointer rounded-r outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              onClick={() => onSelect(s.id)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(s.id)}
              {...bind(
                <><TipTitle>{s.name}</TipTitle>{s.score != null ? `${s.score}% · grade ${s.grade} · ${word}` : word}</>,
                `${s.name}: ${s.score != null ? `${s.score} percent, grade ${s.grade}, ${word}` : word}`,
              )}
            >
              {s.score != null && s.score > 0 && (
                <div className="h-full rounded-r" style={{ width: `${s.score}%`, background: TONE_COLOR[tone] }} />
              )}
            </div>
            <span className="tabular w-20 text-right text-slate-700">
              {s.score != null ? <>{s.score}% <span className="font-bold text-slate-500">{s.grade}</span></> : <span className="text-slate-500">–</span>}
            </span>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--chart-grid)] pt-2 text-xs text-slate-500">
        {(["good", "warning", "critical"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[t] }} aria-hidden />
            {{ good: "Good (80%+)", warning: "Needs work (60–79%)", critical: "At risk (<60%)" }[t]}
          </span>
        ))}
      </div>
      {node}
      <SrTable caption="Security score by site" head={["Site", "Score", "Grade"]} rows={rows.map((s) => [s.name, s.score != null ? `${s.score}%` : "not scanned", s.grade ?? ""])} />
    </div>
  );
}

// ------------------------------------------------------------------ share of issues (tall segmented bar)

export function SeverityShareBar({ counts }: { counts: Record<Severity, number> }) {
  const { ref, bind, node } = useTooltip();
  const parts = SEVERITIES.filter((s) => s !== "info");
  const total = parts.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return <p className="text-sm text-slate-500">No open issues across your sites.</p>;
  const ink: Record<Severity, string> = { critical: "#fff", high: "#0b0b0b", medium: "#0b0b0b", low: "#fff", info: "#fff" };
  return (
    <div ref={ref} className="relative">
      <div className="flex h-7 gap-0.5">
        {parts.filter((s) => counts[s] > 0).map((s) => {
          const share = pct(counts[s], total);
          return (
            <div
              key={s}
              className="flex items-center rounded px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              style={{ flexGrow: counts[s], flexBasis: 0, background: SEVERITY_COLOR[s], color: ink[s] }}
              {...bind(
                <><TipTitle>{SEVERITY_LABEL[s]}</TipTitle>{counts[s]} issues · {share}% of open issues</>,
                `${SEVERITY_LABEL[s]}: ${counts[s]} issues, ${share} percent`,
              )}
            >
              {share >= 9 && `${share}%`}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        {parts.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <SeverityDot severity={s} />
            {SEVERITY_LABEL[s]} <span className="tabular text-slate-500">{counts[s]}</span>
          </span>
        ))}
      </div>
      {node}
      <SrTable caption="Open issues by severity" head={["Severity", "Issues", "Share"]} rows={parts.map((s) => [SEVERITY_LABEL[s], counts[s], `${pct(counts[s], total)}%`])} />
    </div>
  );
}
