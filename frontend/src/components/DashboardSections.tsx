import { useState } from "react";
import { Link } from "react-router-dom";
import { isActive, type ScanLevel, type SiteListItem } from "../api";
import { PLAN, PLANS, priceLabel } from "../plans";
import { SrTable, TipTitle, useTooltip } from "./charts";
import { Card, CardTitle, cx, LevelBadge, pct, Spinner } from "./ui";

// ------------------------------------------------------------------ how the sites are being run

// First three slots of the validated categorical palette (they pass all-pairs CVD checks).
const LEVEL_COLOR: Record<ScanLevel, string> = { free: "#2a78d6", solid: "#eb6834", tight: "#1baf7a" };

function ActivityMeter({ label, part, whole }: { label: string; part: number; whole: number }) {
  const value = pct(part, whole);
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between gap-2">
        <span className="text-slate-700">{label}</span>
        <span className="tabular text-slate-900">
          <b>{value}%</b> <span className="text-slate-500">({part} of {whole})</span>
        </span>
      </div>
      <div
        className="h-2 rounded-full"
        style={{ background: "var(--series-1-track)" }}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${part} of ${whole} sites`}
      >
        {value > 0 && <div className="h-full rounded-full" style={{ width: `${value}%`, background: "var(--series-1)" }} />}
      </div>
    </div>
  );
}

export function SiteActivity({ sites }: { sites: SiteListItem[] }) {
  const { ref, bind, node } = useTooltip();
  const n = sites.length;
  // Read the clock once per mount, not on every render.
  const [dayAgo] = useState(() => Date.now() - 24 * 3600 * 1000);
  const verified = sites.filter((s) => s.verifiedAt).length;
  const tested = sites.filter((s) => s.latestCompleted).length;
  const recent = sites.filter((s) => s.latestCompleted?.finishedAt && new Date(s.latestCompleted.finishedAt).getTime() > dayAgo).length;
  const monitored = sites.filter((s) => s.verifiedAt && s.monitoring).length;
  const running = sites.filter((s) => isActive(s.latestScan)).length;
  const levels = PLANS.map((p) => ({ plan: p, count: sites.filter((s) => s.latestCompleted?.level === p.level).length }));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
      <Card>
        <CardTitle hint={`Across all ${n} site${n === 1 ? "" : "s"} you have added`}>Site activity</CardTitle>
        <div className="space-y-3">
          <ActivityMeter label="Ownership verified" part={verified} whole={n} />
          <ActivityMeter label="Tested at least once" part={tested} whole={n} />
          <ActivityMeter label="Tested in the last 24 hours" part={recent} whole={n} />
          <ActivityMeter label="Scheduled monitoring on" part={monitored} whole={n} />
        </div>
        <p className="mt-4 flex items-center gap-2 border-t border-[var(--chart-grid)] pt-3 text-sm text-slate-600">
          {running > 0 ? (
            <>
              <Spinner className="size-4" /> <b className="text-slate-900">{running}</b> test{running === 1 ? " is" : "s are"} running now ({pct(running, n)}% of sites)
            </>
          ) : (
            <>
              No tests running right now ·{" "}
              <Link to="/security#run" className="font-medium text-cyan-700 hover:underline">Run a test</Link>
            </>
          )}
        </p>
      </Card>
      <Card>
        <CardTitle hint="Share of tested sites by the level of their latest test">Test level mix</CardTitle>
        {tested === 0 ? (
          <p className="text-sm text-slate-500">No test results yet.</p>
        ) : (
          <div ref={ref} className="relative">
            <div className="flex h-7 gap-0.5">
              {levels.filter((l) => l.count > 0).map((l) => {
                const share = pct(l.count, tested);
                return (
                  <div
                    key={l.plan.level}
                    className="flex items-center rounded px-2 text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
                    style={{ flexGrow: l.count, flexBasis: 0, background: LEVEL_COLOR[l.plan.level] }}
                    {...bind(
                      <><TipTitle>{l.plan.name} test</TipTitle>{l.count} site{l.count === 1 ? "" : "s"} · {share}% of tested sites</>,
                      `${l.plan.name}: ${l.count} sites, ${share} percent`,
                    )}
                  >
                    {share >= 12 && `${share}%`}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
              {levels.map((l) => (
                <span key={l.plan.level} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm" style={{ background: LEVEL_COLOR[l.plan.level] }} aria-hidden />
                  {l.plan.name} <span className="tabular text-slate-500">{l.count}</span>
                </span>
              ))}
            </div>
            {node}
            <SrTable caption="Tested sites by test level" head={["Level", "Sites", "Share"]} rows={levels.map((l) => [l.plan.name, l.count, `${pct(l.count, tested)}%`])} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ plans & prices

export function TestPlans({ sites }: { sites: SiteListItem[] }) {
  return (
    <section className="space-y-3" aria-labelledby="plans-title">
      <div>
        <h2 id="plans-title" className="font-semibold text-slate-900">Test plans</h2>
        <p className="text-sm text-slate-500">Each level includes everything in the level before it.</p>
      </div>
      <div className="grid gap-4 pt-2 md:grid-cols-3">
        {PLANS.map((p) => {
          const using = sites.filter((s) => s.latestCompleted?.level === p.level).length;
          return (
            <div
              key={p.level}
              className={cx("relative flex flex-col rounded-xl border bg-white p-5 shadow-sm", p.highlight ? "border-cyan-600 ring-1 ring-cyan-600" : "border-slate-200")}
            >
              {p.highlight && <span className="absolute -top-3 left-5 rounded-full bg-cyan-600 px-2.5 py-0.5 text-xs font-semibold text-white">Most popular</span>}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                <LevelBadge level={p.level} suffix="" />
              </div>
              <p className="text-sm text-slate-500">{p.tagline}</p>
              <p className="mt-4">
                <span className="text-4xl font-bold text-slate-900">{priceLabel(p)}</span>
                <span className="ml-1 text-sm text-slate-500">{p.price === 0 ? p.period : `/ ${p.period.replace("per ", "")}`}</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                {p.checks.map((c) => (
                  <li key={c} className="flex gap-2">
                    <svg viewBox="0 0 24 24" className="mt-0.5 size-4 shrink-0" fill="none" stroke="var(--status-good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">{using > 0 ? `${using} of your sites last tested at this level` : "Not used by your sites yet"}</p>
              <Link
                to={`/security?level=${p.level}#run`}
                state={{ autorun: true }}
                className={cx(
                  "mt-3 rounded-lg px-4 py-2 text-center text-sm font-semibold transition",
                  p.highlight ? "bg-cyan-600 text-white hover:bg-cyan-700" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
                )}
              >
                Run a {PLAN[p.level].name} test
              </Link>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">Choosing a plan opens the Security page and starts that test on all your verified websites. Billing is not set up yet, so every level can be run at no cost for now.</p>
    </section>
  );
}
