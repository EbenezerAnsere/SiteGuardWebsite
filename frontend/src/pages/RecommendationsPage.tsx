import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, PENALTY, SEVERITIES, siteName, type Severity } from "../api";
import { PotentialScoreBars } from "../components/charts-extra";
import { Card, CardTitle, cx, ErrorBox, SeverityBadge, Spinner } from "../components/ui";
import { termForFinding } from "../glossary";
import { useLatestResults } from "../hooks";

type Priority = "now" | "soon" | "later";
const PRIORITY: Record<Priority, { label: string; hint: string; severities: Severity[] }> = {
  now: { label: "Fix now", hint: "Critical and high: exploitable or seriously weakening", severities: ["critical", "high"] },
  soon: { label: "Fix soon", hint: "Medium: makes attacks easier", severities: ["medium"] },
  later: { label: "Nice to have", hint: "Low and info: hardening and best practice", severities: ["low", "info"] },
};

interface Rec {
  key: string;
  kind: "security" | "performance";
  title: string;
  severity?: Severity;
  priority: Priority;
  description: string;
  remediation?: string;
  sites: { id: number; name: string; detail?: string }[];
  gainPerSite: number;
  termId: string | null;
}

export function RecommendationsPage() {
  const results = useLatestResults();
  const [tab, setTab] = useState<Priority | "performance">("now");

  if (results.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (results.isError) return <ErrorBox>{errorMessage(results.error)}</ErrorBox>;
  const data = results.data ?? [];

  // Group identical findings across sites so each fix appears once.
  const recs = new Map<string, Rec>();
  for (const r of data) {
    const site = { id: r.site.id, name: siteName(r.site) };
    for (const f of r.scan.findings ?? []) {
      if (f.passed || f.category === "Scanner") continue;
      const priority = (Object.keys(PRIORITY) as Priority[]).find((p) => PRIORITY[p].severities.includes(f.severity))!;
      const rec = recs.get(f.id) ?? {
        key: f.id, kind: "security" as const, title: f.title, severity: f.severity, priority, description: f.description,
        remediation: f.remediation, sites: [], gainPerSite: PENALTY[f.severity], termId: termForFinding(f.id),
      };
      rec.sites.push(site);
      recs.set(f.id, rec);
    }
    for (const c of r.scan.performance?.checks ?? []) {
      if (c.passed) continue;
      const key = `perf:${c.id}`;
      const rec = recs.get(key) ?? {
        key, kind: "performance" as const, title: c.title, priority: "soon" as Priority, description: "",
        remediation: c.remediation, sites: [], gainPerSite: c.impact, termId: termForFinding(c.id),
      };
      rec.sites.push({ ...site, detail: c.detail });
      recs.set(key, rec);
    }
  }
  const all = [...recs.values()];
  const security = all.filter((r) => r.kind === "security");
  const perf = all.filter((r) => r.kind === "performance").sort((a, b) => b.gainPerSite * b.sites.length - a.gainPerSite * a.sites.length);
  const byPriority = (p: Priority) =>
    security
      .filter((r) => r.priority === p)
      .sort((a, b) => SEVERITIES.indexOf(a.severity!) - SEVERITIES.indexOf(b.severity!) || b.sites.length - a.sites.length);

  // Score each site would reach if every critical and high issue were fixed.
  const potential = data
    .filter((r) => r.scan.score != null)
    .map((r) => {
      const remaining = (r.scan.findings ?? []).filter((f) => !f.passed && f.severity !== "critical" && f.severity !== "high");
      const score = Math.max(0, 100 - remaining.reduce((s, f) => s + PENALTY[f.severity], 0));
      return { id: r.site.id, name: siteName(r.site), current: r.scan.score!, potential: score };
    });

  const shown = tab === "performance" ? perf : byPriority(tab);
  const tabs: [Priority | "performance", string, number][] = [
    ["now", PRIORITY.now.label, byPriority("now").length],
    ["soon", PRIORITY.soon.label, byPriority("soon").length],
    ["later", PRIORITY.later.label, byPriority("later").length],
    ["performance", "Performance", perf.length],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Recommendations</h1>
        <p className="text-sm text-slate-500">A prioritised to-do list built from your latest scans. Each fix is listed once, with every site it applies to.</p>
      </div>

      {data.length === 0 ? (
        <Card className="py-10 text-center text-slate-500">
          No scan results yet. <Link to="/" className="text-cyan-700 hover:underline">Add and verify a site</Link> to get recommendations.
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {(["now", "soon", "later"] as const).map((p) => (
              <button key={p} onClick={() => setTab(p)} className="text-left">
                <Card className={cx("h-full transition hover:border-slate-400", tab === p && "ring-2 ring-cyan-500")}>
                  <p className="text-sm text-slate-500">{PRIORITY[p].label}</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-900">{byPriority(p).length}</p>
                  <p className="text-xs text-slate-500">{PRIORITY[p].hint}</p>
                </Card>
              </button>
            ))}
          </div>

          {potential.length > 0 && (
            <Card>
              <CardTitle hint="Security score now, and the score each site would reach after fixing its critical and high issues">Potential improvement</CardTitle>
              <PotentialScoreBars rows={potential} />
            </Card>
          )}

          <section className="space-y-3">
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
              {tabs.map(([key, label, n]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cx("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium", tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
                >
                  {label} <span className="text-slate-500">{n}</span>
                </button>
              ))}
            </div>
            {shown.length === 0 && <p className="py-8 text-center text-slate-500">Nothing to fix in this group.</p>}
            <ol className="space-y-3">
              {shown.map((r, i) => <RecCard key={r.key} rec={r} rank={i + 1} />)}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function RecCard({ rec: r, rank }: { rec: Rec; rank: number }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{rank}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {r.severity ? <SeverityBadge severity={r.severity} /> : <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-800">Performance</span>}
            <h3 className="font-semibold text-slate-900">{r.title}</h3>
          </div>
          {r.description && <p className="text-sm text-slate-600">{r.description}</p>}
          {r.remediation && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-slate-800">
              <span className="font-semibold text-emerald-800">How to fix: </span>
              {r.remediation}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Affects:</span>
            {r.sites.map((s) => (
              <Link key={s.id} to={`/sites/${s.id}`} title={s.detail} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-700 hover:border-slate-400">
                {s.name}
              </Link>
            ))}
            {r.termId && <Link to={`/terminology#${r.termId}`} className="ml-auto text-xs font-medium text-cyan-700 hover:underline">What does this mean?</Link>}
          </div>
        </div>
        {r.gainPerSite > 0 && (
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-emerald-700">+{r.gainPerSite}</p>
            <p className="text-xs text-slate-500">{r.kind === "performance" ? "perf." : "security"} points{r.sites.length > 1 ? " per site" : ""}</p>
          </div>
        )}
      </div>
    </li>
  );
}

