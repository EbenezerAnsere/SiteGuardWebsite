import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, errorMessage, isActive, siteName, VERIFIED_VIA_LABEL, type Finding, type ScanLevel, type Scan, type ScanListItem, type SiteWithVerification } from "../api";
import { CategoryBars, ScoreHistoryChart, ScoreMeter, SeverityBars } from "../components/charts";
import { FindingsReport } from "../components/FindingsReport";
import { PLANS, priceLabel } from "../plans";
import { PracticeTargets } from "../components/PracticeTargets";
import { DeleteSiteButton } from "../components/SiteManagement";
import {
  Alert, Button, Card, CardTitle, cx, ErrorBox, GradeBadge, LevelBadge, pct, SiteIcon, Spinner, StatusPill, timeAgo,
} from "../components/ui";

export function SiteDetail() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: ["site", id],
    queryFn: async () => (await api.get<{ site: SiteWithVerification; scans: ScanListItem[] }>(`/sites/${id}`)).data,
    refetchInterval: (q) => (isActive(q.state.data?.scans[0]) ? 3000 : false),
  });

  const latestCompletedId = detail.data?.scans.find((s) => s.status === "completed")?.id;
  const report = useQuery({
    queryKey: ["scan", latestCompletedId],
    queryFn: async () => (await api.get<{ scan: Scan }>(`/scans/${latestCompletedId}`)).data.scan,
    enabled: !!latestCompletedId,
  });

  // When a new scan completes, the cross-site pages (Security, Recommendations, Performance) need fresh data.
  useEffect(() => {
    if (latestCompletedId) qc.invalidateQueries({ queryKey: ["latest-results"] });
  }, [latestCompletedId, qc]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["site", id] });
    qc.invalidateQueries({ queryKey: ["sites"] });
    qc.invalidateQueries({ queryKey: ["latest-results"] });
  };
  const update = useMutation({
    mutationFn: (patch: { name?: string; monitoring?: boolean; monitorIntervalHours?: number; scanLevel?: ScanLevel }) => api.patch(`/sites/${id}`, patch),
    onSuccess: refresh,
  });
  if (detail.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (detail.isError || !detail.data) return <ErrorBox>{errorMessage(detail.error)}</ErrorBox>;

  const { site, scans } = detail.data;
  const latest = scans[0];
  const completed = scans.find((s) => s.status === "completed");
  const findings = report.data?.findings ?? null;
  const total = completed?.summary ? completed.summary.passed + completed.summary.failed : 0;

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-slate-500 hover:text-slate-900">← Dashboard</Link>

      {/* ---- header */}
      <div className="flex flex-wrap items-center gap-4">
        <SiteIcon url={site.url} name={siteName(site)} className="size-14" />
        <div className="min-w-0 flex-1">
          <EditableName value={site.name ?? ""} fallback={site.hostname} saving={update.isPending} onSave={(name) => update.mutate({ name })} />
          <a href={site.url} target="_blank" rel="noreferrer noopener" className="text-sm text-cyan-700 hover:underline">{site.url}</a>
          {completed && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              Last tested {timeAgo(completed.finishedAt)} <LevelBadge level={completed.level} />
            </p>
          )}
        </div>
        {site.verifiedAt && (
          <div className="flex items-center gap-3">
            {latest && isActive(latest) && <StatusPill status={latest.status} />}
            {!isActive(latest) && (
              <Link to={`/security?site=${site.id}#run`} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
                Run a test
              </Link>
            )}
          </div>
        )}
        <GradeBadge grade={completed?.grade ?? null} size="lg" />
        <DeleteSiteButton site={site} variant="button" />
      </div>
      {update.isError && <ErrorBox>{errorMessage(update.error)}</ErrorBox>}

      {!site.verifiedAt ? (
        <VerifyPanel site={site} onVerified={refresh} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-6">
            <SiteWarnings latest={latest} completed={completed} findings={findings} />

            {!completed ? (
              <Card className="py-10 text-center text-slate-500">
                {isActive(latest) ? "First scan in progress…" : "No completed tests yet. Use “Run a test” to run the first one on the Security page."}
              </Card>
            ) : (
              <>
                {/* ---- headline numbers */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <Card className="sm:col-span-1"><ScoreMeter score={completed.score} /></Card>
                  <Card>
                    <p className="text-sm text-slate-500">Checks passed</p>
                    <p className="text-3xl font-semibold text-slate-900">{pct(completed.summary?.passed ?? 0, total)}%</p>
                    <p className="text-xs text-slate-500">{completed.summary?.passed} of {total} checks</p>
                  </Card>
                  <Card>
                    <p className="text-sm text-slate-500">Since previous scan</p>
                    <p className="text-3xl font-semibold text-slate-900">
                      <span className="text-red-600">+{completed.summary?.newIssues.length ?? 0}</span>
                      <span className="mx-1 text-slate-400">/</span>
                      <span className="text-emerald-700">−{completed.summary?.resolvedIssues.length ?? 0}</span>
                    </p>
                    <p className="text-xs text-slate-500">new issues / fixed issues</p>
                  </Card>
                </div>

                {/* ---- charts */}
                <div className="grid items-start gap-4 md:grid-cols-2">
                  <Card>
                    <CardTitle hint="Failed checks in the latest scan">Issues by severity</CardTitle>
                    {completed.summary && <SeverityBars counts={completed.summary.counts} />}
                  </Card>
                  <Card>
                    <CardTitle hint="Share of checks passed in each area, weakest first">Pass rate by category</CardTitle>
                    {findings ? <CategoryBars findings={findings} /> : <Spinner />}
                  </Card>
                </div>
                <Card>
                  <CardTitle hint="Security score of each completed scan, oldest to newest. Click a column to open that scan.">Score history</CardTitle>
                  <ScoreHistoryChart scans={scans} onSelect={(scanId) => navigate(`/scans/${scanId}`)} />
                </Card>

                {/* ---- findings */}
                <section className="space-y-3">
                  <h2 className="font-semibold text-slate-900">Findings</h2>
                  {report.isLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                  ) : findings ? (
                    <FindingsReport findings={findings} summary={report.data!.summary} />
                  ) : (
                    <ErrorBox>{errorMessage(report.error)}</ErrorBox>
                  )}
                </section>
              </>
            )}
          </div>

          <aside className="space-y-4">
            <Card className="space-y-3">
              <h2 className="font-semibold text-slate-900">Monitoring</h2>
              <label className="flex items-center justify-between text-sm text-slate-700">
                Scheduled scans
                <input
                  type="checkbox"
                  className="size-4 accent-cyan-600"
                  checked={site.monitoring}
                  onChange={(e) => update.mutate({ monitoring: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
                Frequency
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  value={site.monitorIntervalHours}
                  disabled={!site.monitoring}
                  onChange={(e) => update.mutate({ monitorIntervalHours: Number(e.target.value) })}
                >
                  <option value={6}>Every 6 hours</option>
                  <option value={12}>Every 12 hours</option>
                  <option value={24}>Daily</option>
                  <option value={168}>Weekly</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
                Scheduled test
                <select
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-900"
                  value={site.scanLevel}
                  disabled={!site.monitoring}
                  onChange={(e) => update.mutate({ scanLevel: e.target.value as ScanLevel })}
                >
                  {PLANS.map((p) => <option key={p.level} value={p.level}>{p.name} ({priceLabel(p)})</option>)}
                </select>
              </label>
              <p className="text-xs text-slate-500">
                Verified {timeAgo(site.verifiedAt)}
                {site.verifiedVia && ` via ${VERIFIED_VIA_LABEL[site.verifiedVia]}`}
              </p>
            </Card>

            <Card className="space-y-2">
              <h2 className="font-semibold text-slate-900">Test history</h2>
              {scans.length === 0 && <p className="text-sm text-slate-500">No scans yet.</p>}
              <ul className="divide-y divide-slate-200">
                {scans.slice(0, 15).map((s, i) => {
                  const prev = scans.slice(i + 1).find((p) => p.status === "completed");
                  const delta = s.score != null && prev?.score != null ? s.score - prev.score : null;
                  return (
                    <li key={s.id}>
                      <Link to={`/scans/${s.id}`} className="flex items-center gap-3 py-2 text-sm hover:text-slate-900">
                        <GradeBadge grade={s.grade} size="sm" />
                        <span className="flex-1 text-slate-500">
                          {timeAgo(s.createdAt)} <span className="text-slate-400">· {s.trigger}</span>
                          <span className="block"><LevelBadge level={s.level} /></span>
                        </span>
                        {s.status !== "completed" ? (
                          <StatusPill status={s.status} />
                        ) : (
                          <span className="tabular text-slate-700">
                            {s.score}%
                            {delta != null && delta !== 0 && (
                              <span className={cx("ml-1 text-xs", delta > 0 ? "text-emerald-700" : "text-red-600")}>
                                {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                              </span>
                            )}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>

          </aside>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ warnings

function SiteWarnings({ latest, completed, findings }: { latest?: ScanListItem; completed?: ScanListItem; findings: Finding[] | null }) {
  const issues = (findings ?? []).filter((f) => !f.passed);
  const critical = issues.filter((f) => f.severity === "critical");
  const high = issues.filter((f) => f.severity === "high");
  const cert = issues.find((f) => f.id === "tls.certificate");
  const fresh = completed?.summary?.newIssues ?? [];
  const freshTitles = issues.filter((f) => fresh.includes(f.id)).map((f) => f.title);

  const banners = [];
  if (latest?.status === "failed") {
    banners.push(<Alert key="failed" tone="warning" title="The last scan failed">{latest.error}</Alert>);
  }
  if (critical.length) {
    banners.push(
      <Alert key="crit" tone="critical" title={`${critical.length} critical vulnerabilit${critical.length === 1 ? "y" : "ies"}: fix immediately`}>
        <ul className="list-disc pl-5">{critical.map((f) => <li key={f.id}>{f.title}</li>)}</ul>
      </Alert>,
    );
  }
  if (high.length) {
    banners.push(
      <Alert key="high" tone="warning" title={`${high.length} high-severity issue${high.length === 1 ? "" : "s"}`}>
        <ul className="list-disc pl-5">{high.map((f) => <li key={f.id}>{f.title}</li>)}</ul>
      </Alert>,
    );
  }
  if (cert && cert.severity !== "critical" && cert.severity !== "high") {
    banners.push(<Alert key="cert" tone="warning" title={cert.title}>{cert.evidence}</Alert>);
  }
  if (freshTitles.length) {
    banners.push(
      <Alert key="new" tone="info" title={`${freshTitles.length} new issue${freshTitles.length === 1 ? "" : "s"} since the previous scan`}>
        {freshTitles.join(" · ")}
      </Alert>,
    );
  }
  if (findings && !critical.length && !high.length && latest?.status !== "failed") {
    banners.push(<Alert key="ok" tone="good" title="No critical or high-severity issues">Keep monitoring on so you hear about new problems.</Alert>);
  }
  return banners.length ? <div className="space-y-2">{banners}</div> : null;
}

// ------------------------------------------------------------------ name editing

function EditableName({ value, fallback, saving, onSave }: { value: string; fallback: string; saving: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="truncate text-2xl font-bold text-slate-900">{value || fallback}</h1>
        <button
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          aria-label="Rename site"
          title="Rename site"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim());
        setEditing(false);
      }}
    >
      <input
        autoFocus
        value={draft}
        maxLength={60}
        placeholder={fallback}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        aria-label="Site name"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-lg font-semibold text-slate-900 outline-none focus:border-cyan-500"
      />
      <Button type="submit" loading={saving}>Save</Button>
      <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  );
}

// ------------------------------------------------------------------ verification

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-cyan-800">{value}</code>
        <Button
          variant="secondary"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function VerifyPanel({ site, onVerified }: { site: SiteWithVerification; onVerified: () => void }) {
  const [method, setMethod] = useState<"file" | "dns">("file");
  const verify = useMutation({ mutationFn: () => api.post(`/sites/${site.id}/verify`, { method }), onSuccess: onVerified });
  const v = site.verification;
  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Ownership not verified">
        SiteGuard only scans sites whose owners have proved control of them. Scanning sites without permission may be illegal.
      </Alert>
      <Card className="space-y-5">
        <h2 className="text-lg font-semibold text-slate-900">Verify you own this site</h2>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(["file", "dns"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={cx("flex-1 rounded-md px-3 py-1.5 font-medium", method === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
            >
              {m === "file" ? "Upload a file" : "DNS TXT record"}
            </button>
          ))}
        </div>
        {method === "file" ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>Create a file at this URL whose content is the token below:</p>
            <CopyField label="File URL" value={v.fileUrl} />
            <CopyField label="File content" value={v.fileContent} />
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-700">
            <p>Add a TXT record to your DNS. Changes can take a few minutes to appear.</p>
            <CopyField label="Host / name" value={v.dnsHost} />
            <CopyField label="TXT value" value={v.dnsValue} />
          </div>
        )}
        {verify.isError && <ErrorBox>{errorMessage(verify.error)}</ErrorBox>}
        <Button onClick={() => verify.mutate()} loading={verify.isPending}>Verify ownership</Button>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Don't own this site?</h2>
          <p className="mt-1 text-sm text-slate-600">
            Only the owner of <b>{site.hostname}</b> can upload the file or add the DNS record, so verification can't succeed from here.
            Sites built for practising UI or API test automation haven't given permission for security scanning either.
          </p>
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          <li className="flex gap-2">
            <span className="font-semibold text-slate-900">Ask the owner:</span>
            <span>send them the file URL and token above, or ask for written permission to test.</span>
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-slate-900">Have written permission?</span>
            <span>
              A SiteGuard administrator can add <code className="rounded bg-slate-100 px-1 text-xs">{site.hostname}</code> to{" "}
              <code className="rounded bg-slate-100 px-1 text-xs">SCAN_AUTHORIZED_HOSTS</code> in the server settings, then click Verify ownership.
            </span>
          </li>
        </ul>
        <div className="space-y-2 border-t border-slate-200 pt-4">
          <p className="text-sm font-semibold text-slate-900">Just want to practise? These sites invite security scanning:</p>
          <PracticeTargets />
        </div>
      </Card>
    </div>
  );
}
