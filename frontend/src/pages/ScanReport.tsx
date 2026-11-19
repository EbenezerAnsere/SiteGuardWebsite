import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage, isActive, siteName, type Scan } from "../api";
import { CategoryBars, ScoreMeter, SeverityBars } from "../components/charts";
import { FindingsReport } from "../components/FindingsReport";
import { Alert, Card, CardTitle, ErrorBox, GradeBadge, LevelBadge, pct, SiteIcon, Spinner, StatusPill } from "../components/ui";

interface ScanSite {
  id: number;
  url: string;
  hostname: string;
  name: string | null;
}

export function ScanReport() {
  const id = Number(useParams().id);
  const q = useQuery({
    queryKey: ["scan-report", id],
    queryFn: async () => (await api.get<{ scan: Scan; site: ScanSite }>(`/scans/${id}`)).data,
    refetchInterval: (query) => (isActive(query.state.data?.scan) ? 3000 : false),
  });

  if (q.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (q.isError || !q.data) return <ErrorBox>{errorMessage(q.error)}</ErrorBox>;
  const { scan, site } = q.data;
  const total = scan.summary ? scan.summary.passed + scan.summary.failed : 0;
  const critical = scan.summary?.counts.critical ?? 0;

  return (
    <div className="space-y-6">
      <Link to={`/sites/${site.id}`} className="text-sm text-slate-500 hover:text-slate-900">← {siteName(site)}</Link>
      <div className="flex flex-wrap items-center gap-4">
        <SiteIcon url={site.url} name={siteName(site)} className="size-14" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{siteName(site)} · scan #{scan.id}</h1>
          <p className="text-sm text-slate-500">{new Date(scan.createdAt).toLocaleString()} · {scan.trigger} · <LevelBadge level={scan.level} /></p>
        </div>
        <StatusPill status={scan.status} />
        <GradeBadge grade={scan.grade} size="lg" />
      </div>

      {scan.status === "failed" && <Alert tone="warning" title="This scan failed">{scan.error}</Alert>}
      {critical > 0 && <Alert tone="critical" title={`${critical} critical vulnerabilit${critical === 1 ? "y was" : "ies were"} found in this scan`} />}
      {isActive(scan) && <Card className="py-10 text-center text-slate-500">Scan in progress…</Card>}

      {scan.summary && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card><ScoreMeter score={scan.score} /></Card>
          <Card>
            <p className="text-sm text-slate-500">Checks passed</p>
            <p className="text-3xl font-semibold text-slate-900">{pct(scan.summary.passed, total)}%</p>
            <p className="text-xs text-slate-500">{scan.summary.passed} of {total} checks</p>
          </Card>
          <Card>
            <p className="text-sm text-slate-500">Open issues</p>
            <p className="text-3xl font-semibold text-slate-900">{scan.summary.failed}</p>
            <p className="text-xs text-slate-500">{scan.summary.newIssues.length} new since the previous scan</p>
          </Card>
        </div>
      )}
      {scan.summary && scan.findings && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Card>
            <CardTitle hint="Failed checks in this scan">Issues by severity</CardTitle>
            <SeverityBars counts={scan.summary.counts} />
          </Card>
          <Card>
            <CardTitle hint="Share of checks passed in each area, weakest first">Pass rate by category</CardTitle>
            <CategoryBars findings={scan.findings} />
          </Card>
        </div>
      )}
      {scan.findings && <FindingsReport findings={scan.findings} summary={scan.summary} />}
    </div>
  );
}
