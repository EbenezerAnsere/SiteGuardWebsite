import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { errorMessage, SEVERITIES, siteName, type Finding, type Severity } from "../api";
import { CategorySeverityBars } from "../components/charts-extra";
import { SeverityShareBar } from "../components/charts";
import { FindingRow } from "../components/FindingsReport";
import { RunPanel } from "../components/RunPanel";
import { Alert, Card, CardTitle, cx, ErrorBox, pct, SEVERITY_LABEL, SeverityDot, Spinner } from "../components/ui";
import { useLatestResults, useSites } from "../hooks";

interface Issue {
  finding: Finding;
  site: { id: number; name: string };
}

export function SecurityPage() {
  const results = useLatestResults();
  const qc = useQueryClient();
  const allSites = useSites();
  // When any test finishes, reload the issue list below.
  const completedKey = (allSites.data ?? []).map((s) => s.latestCompleted?.id ?? 0).join(",");
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["latest-results"] });
  }, [completedKey, qc]);
  const [severities, setSeverities] = useState<Set<Severity>>(new Set(["critical", "high", "medium", "low"]));
  const [siteId, setSiteId] = useState<number | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const issues: Issue[] = useMemo(
    () =>
      (results.data ?? []).flatMap((r) =>
        (r.scan.findings ?? [])
          .filter((f) => !f.passed && f.category !== "Scanner")
          .map((finding) => ({ finding, site: { id: r.site.id, name: siteName(r.site) } })),
      ),
    [results.data],
  );


  const sites = (results.data ?? []).map((r) => ({ id: r.site.id, name: siteName(r.site) }));
  const categories = [...new Set(issues.map((i) => i.finding.category))].sort();
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, issues.filter((i) => i.finding.severity === s).length])) as Record<Severity, number>;
  const byCategory = categories.map((c) => ({
    category: c,
    counts: Object.fromEntries(SEVERITIES.map((s) => [s, issues.filter((i) => i.finding.category === c && i.finding.severity === s).length])) as Record<Severity, number>,
  }));
  const sitesWith = (sev: Severity) => new Set(issues.filter((i) => i.finding.severity === sev).map((i) => i.site.id)).size;
  const actionable = issues.filter((i) => i.finding.severity !== "info").length;

  const q = query.trim().toLowerCase();
  const visible = issues
    .filter((i) => severities.has(i.finding.severity))
    .filter((i) => siteId === "all" || i.site.id === siteId)
    .filter((i) => category === "all" || i.finding.category === category)
    .filter((i) => !q || `${i.finding.title} ${i.finding.description} ${i.site.name}`.toLowerCase().includes(q))
    .sort((a, b) => SEVERITIES.indexOf(a.finding.severity) - SEVERITIES.indexOf(b.finding.severity) || a.site.name.localeCompare(b.site.name));

  const toggle = (s: Severity) => {
    const next = new Set(severities);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setSeverities(next);
  };
  const select = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Security</h1>
        <p className="text-sm text-slate-500">Run security tests, then work through every open vulnerability from the latest test of each site.</p>
      </div>

      <RunPanel />

      <h2 className="pt-2 text-lg font-semibold text-slate-900">Open issues</h2>
      {results.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : results.isError ? (
        <ErrorBox>{errorMessage(results.error)}</ErrorBox>
      ) : sites.length === 0 ? (
        <Card className="py-10 text-center text-slate-500">No test results yet. Run a test above to see security issues here.</Card>
      ) : (
        <>
          {counts.critical > 0 ? (
            <Alert tone="critical" title={`${counts.critical} critical vulnerabilit${counts.critical === 1 ? "y" : "ies"} on ${sitesWith("critical")} site${sitesWith("critical") === 1 ? "" : "s"}`}>
              Critical issues can be exploited right now. Start with these, then work down the list.
            </Alert>
          ) : counts.high > 0 ? (
            <Alert tone="warning" title={`${counts.high} high-severity issue${counts.high === 1 ? "" : "s"} to fix`} />
          ) : (
            <Alert tone="good" title="No critical or high-severity issues" />
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["critical", "high", "medium", "low"] as const).map((s) => (
              <Card key={s}>
                <p className="flex items-center gap-2 text-sm text-slate-500"><SeverityDot severity={s} />{SEVERITY_LABEL[s]}</p>
                <p className="mt-1 text-3xl font-semibold text-slate-900">{counts[s]}</p>
                <p className="text-xs text-slate-500">{pct(counts[s], actionable)}% of open issues</p>
              </Card>
            ))}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
            <Card>
              <CardTitle hint="Open issues in each area, coloured by severity">Issues by category</CardTitle>
              <CategorySeverityBars rows={byCategory} />
            </Card>
            <Card>
              <CardTitle hint="Share of all open issues">Severity mix</CardTitle>
              <SeverityShareBar counts={counts} />
            </Card>
          </div>

          {/* filters: one row above the list */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggle(s)}
                  aria-pressed={severities.has(s)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm",
                    severities.has(s) ? "border-slate-400 bg-white text-slate-900 shadow-sm" : "border-slate-200 bg-slate-100 text-slate-400",
                  )}
                >
                  <SeverityDot severity={s} />
                  {SEVERITY_LABEL[s]} <span className="tabular text-slate-500">{counts[s]}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search issues…" aria-label="Search issues" className={select} />
              <select value={siteId} onChange={(e) => setSiteId(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Filter by site" className={select}>
                <option value="all">All sites</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className={select}>
                <option value="all">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p className="text-sm text-slate-500">Showing {visible.length} of {issues.length} issues</p>
            <ul className="space-y-2">
              {visible.map((i) => <FindingRow key={`${i.site.id}-${i.finding.id}`} finding={i.finding} site={i.site} />)}
            </ul>
            {visible.length === 0 && <p className="py-6 text-center text-slate-500">No issues match these filters.</p>}
          </section>
        </>
      )}
    </div>
  );
}
