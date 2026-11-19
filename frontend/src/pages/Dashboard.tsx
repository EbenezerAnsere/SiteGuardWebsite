import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage, isActive, SEVERITIES, siteName, type Severity, type SiteListItem } from "../api";
import { ScoreMeter, SeverityShareBar, SiteScoreBars } from "../components/charts";
import { SiteActivity, TestPlans } from "../components/DashboardSections";
import { AddSiteButton, DeleteSiteButton } from "../components/SiteManagement";
import {
  Alert, Card, CardTitle, cx, ErrorBox, GradeBadge, LevelBadge, pct, scoreTone, SeverityBadge, SiteIcon, Spinner, StatusPill, timeAgo, TONE_COLOR,
  type AlertTone,
} from "../components/ui";

interface Attention {
  key: string;
  tone: AlertTone;
  title: ReactNode;
  body?: ReactNode;
  siteId: number;
}

function needsAttention(sites: SiteListItem[]): Attention[] {
  const out: Attention[] = [];
  for (const s of sites) {
    const name = siteName(s);
    const c = s.latestCompleted?.summary?.counts;
    if (c?.critical) out.push({ key: `${s.id}c`, tone: "critical", siteId: s.id, title: `${name}: ${c.critical} critical vulnerabilit${c.critical === 1 ? "y" : "ies"}`, body: "Exposed secrets or broken encryption. Fix these first." });
    else if (c?.high) out.push({ key: `${s.id}h`, tone: "warning", siteId: s.id, title: `${name}: ${c.high} high-severity issue${c.high === 1 ? "" : "s"}` });
    if (s.latestScan?.status === "failed") out.push({ key: `${s.id}f`, tone: "warning", siteId: s.id, title: `${name}: last scan failed`, body: s.latestScan.error });
    const fresh = s.latestCompleted?.summary?.newIssues.length ?? 0;
    if (fresh) out.push({ key: `${s.id}n`, tone: "warning", siteId: s.id, title: `${name}: ${fresh} new issue${fresh === 1 ? "" : "s"} since the previous scan` });
    if (!s.verifiedAt) out.push({ key: `${s.id}v`, tone: "info", siteId: s.id, title: `${name} is not verified yet`, body: "Verify ownership to start scanning." });
    else if (!s.monitoring) out.push({ key: `${s.id}m`, tone: "info", siteId: s.id, title: `Monitoring is paused for ${name}` });
  }
  const order: Record<AlertTone, number> = { critical: 0, warning: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof TONE_COLOR }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
        {tone && <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[tone] }} aria-hidden />}
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const sites = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<{ sites: SiteListItem[] }>("/sites")).data.sites,
    refetchInterval: (q) => (q.state.data?.some((s) => isActive(s.latestScan)) ? 3000 : 30_000),
  });

  if (sites.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (sites.isError) return <ErrorBox>{errorMessage(sites.error)}</ErrorBox>;

  const list = sites.data ?? [];
  const scanned = list.filter((s) => s.latestCompleted?.score != null);
  const avgScore = scanned.length ? Math.round(scanned.reduce((sum, s) => sum + s.latestCompleted!.score!, 0) / scanned.length) : null;
  const totals = Object.fromEntries(SEVERITIES.map((sev) => [sev, 0])) as Record<Severity, number>;
  let passed = 0, failed = 0;
  for (const s of list) {
    const sum = s.latestCompleted?.summary;
    if (!sum) continue;
    for (const sev of SEVERITIES) totals[sev] += sum.counts[sev];
    passed += sum.passed;
    failed += sum.failed;
  }
  const verified = list.filter((s) => s.verifiedAt).length;
  const healthy = scanned.filter((s) => scoreTone(s.latestCompleted!.score) === "good").length;
  const urgent = totals.critical + totals.high;
  const alerts = needsAttention(list);
  const shownAlerts = showAllAlerts ? alerts : alerts.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Results from your latest security tests, how your sites are being monitored, and the available test plans.</p>
        </div>
        <AddSiteButton />
      </div>

      {/* ---- warnings */}
      {list.length > 0 && (
        <section aria-label="Needs attention" className="space-y-2">
          {alerts.length === 0 ? (
            scanned.length > 0 && <Alert tone="good" title="No urgent problems found">Every scanned site is free of critical and high-severity issues.</Alert>
          ) : (
            <>
              {shownAlerts.map((a) => (
                <Alert
                  key={a.key}
                  tone={a.tone}
                  title={a.title}
                  action={<Link to={`/sites/${a.siteId}`} className="rounded-lg px-3 py-1.5 text-sm font-medium text-cyan-700 hover:bg-slate-100">View</Link>}
                >
                  {a.body}
                </Alert>
              ))}
              {alerts.length > 4 && (
                <button className="text-sm text-cyan-700 hover:underline" onClick={() => setShowAllAlerts(!showAllAlerts)}>
                  {showAllAlerts ? "Show fewer" : `Show all ${alerts.length} warnings`}
                </button>
              )}
            </>
          )}
        </section>
      )}

      {/* ---- headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2 lg:col-span-1">
          <ScoreMeter score={avgScore} label="Average security score" />
        </Card>
        <StatTile label="Sites monitored" value={list.length} sub={`${pct(verified, list.length)}% verified · ${verified} of ${list.length}`} />
        <StatTile
          label="Healthy sites"
          value={`${pct(healthy, scanned.length)}%`}
          sub={`${healthy} of ${scanned.length} scanned sites score 80% or more`}
          tone={scanned.length ? scoreTone(pct(healthy, scanned.length)) : undefined}
        />
        <StatTile
          label="Checks passed"
          value={`${pct(passed, passed + failed)}%`}
          sub={`${urgent} critical/high issue${urgent === 1 ? "" : "s"} open`}
          tone={urgent ? "critical" : passed ? "good" : undefined}
        />
      </div>

      {/* ---- charts */}
      {scanned.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Card>
            <CardTitle hint="Latest completed scan per site, lowest first. Click a bar to open the site.">Score by site</CardTitle>
            <SiteScoreBars
              sites={list.filter((s) => s.verifiedAt).map((s) => ({ id: s.id, name: siteName(s), score: s.latestCompleted?.score ?? null, grade: s.latestCompleted?.grade ?? null }))}
              onSelect={(id) => navigate(`/sites/${id}`)}
            />
          </Card>
          <Card>
            <CardTitle hint="Share of all open issues across your sites">Open issues by severity</CardTitle>
            <SeverityShareBar counts={totals} />
          </Card>
        </div>
      )}

      {/* ---- how the sites are being run */}
      {list.length > 0 && <SiteActivity sites={list} />}

      {/* ---- plans */}
      <TestPlans sites={list} />

      {/* ---- site list */}
      {list.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center text-slate-500">
          <p>No websites yet. Add your first one to start testing.</p>
          <AddSiteButton />
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Your sites</h2>
            <span className="text-sm text-slate-500">{list.length} website{list.length === 1 ? "" : "s"}</span>
          </div>
          {list.map((site) => {
            const done = site.latestCompleted;
            const tone = scoreTone(done?.score);
            return (
              <div
                key={site.id}
                className="relative flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 hover:shadow"
              >
                <SiteIcon url={site.url} name={siteName(site)} />
                <div className="min-w-0 flex-1 basis-48">
                  <Link to={`/sites/${site.id}`} className="truncate font-semibold text-slate-900 after:absolute after:inset-0 after:rounded-xl">
                    {siteName(site)}
                  </Link>
                  <p className="truncate text-sm text-slate-500">
                    {site.name ? `${site.hostname} · ` : ""}
                    {site.verifiedAt
                      ? `${site.lastScanAt ? `tested ${timeAgo(site.lastScanAt)}` : "not tested yet"} · ${site.monitoring ? `every ${site.monitorIntervalHours}h` : "monitoring paused"}`
                      : "ownership not verified"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!site.verifiedAt && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Verify to test</span>}
                  {done && <LevelBadge level={done.level} />}
                  {isActive(site.latestScan) && <StatusPill status={site.latestScan!.status} />}
                  {done?.summary &&
                    SEVERITIES.filter((s) => s !== "info" && done.summary!.counts[s] > 0).map((s) => (
                      <span key={s} className="flex items-center gap-1 text-sm text-slate-700">
                        <SeverityBadge severity={s} /> {done.summary!.counts[s]}
                      </span>
                    ))}
                </div>
                {done?.score != null && (
                  <div className="w-24">
                    <p className="tabular text-right text-sm font-semibold text-slate-900">{done.score}%</p>
                    <div className="mt-1 h-1.5 rounded-full" style={{ background: `color-mix(in srgb, ${TONE_COLOR[tone]} 22%, var(--surface))` }}>
                      <div className={cx("h-full rounded-full")} style={{ width: `${done.score}%`, background: TONE_COLOR[tone] }} />
                    </div>
                  </div>
                )}
                <GradeBadge grade={done?.grade ?? null} />
                <DeleteSiteButton site={site} />
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
