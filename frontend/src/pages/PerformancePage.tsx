import { Fragment, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage, siteName, type PerformanceMetrics } from "../api";
import { msTone, ResponseTimeBars } from "../components/charts-extra";
import { ScoreMeter } from "../components/charts";
import { Alert, AlertIcon, Card, CardTitle, cx, ErrorBox, pct, Spinner, TONE_COLOR } from "../components/ui";
import { termForFinding } from "../glossary";
import { useLatestResults } from "../hooks";

const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const resourceCount = (p: PerformanceMetrics) => p.resources.scripts + p.resources.stylesheets + p.resources.images + p.resources.iframes;

export function PerformancePage() {
  const results = useLatestResults();
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(null);

  if (results.isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (results.isError) return <ErrorBox>{errorMessage(results.error)}</ErrorBox>;

  const data = results.data ?? [];
  const measured = data.filter((r) => r.scan.performance).map((r) => ({ site: r.site, perf: r.scan.performance! }));
  const missing = data.length - measured.length;
  const avg = (f: (p: PerformanceMetrics) => number) => (measured.length ? Math.round(measured.reduce((s, m) => s + f(m.perf), 0) / measured.length) : 0);
  const avgMs = avg((p) => p.ttfbMs);
  const compressed = measured.filter((m) => m.perf.compression).length;
  const slow = measured.filter((m) => m.perf.ttfbMs > 800);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Performance</h1>
        <p className="text-sm text-slate-500">
          How quickly each homepage responds, measured from SiteGuard's server during every scan. Visitor experience also depends on their location, device and the images and scripts the page loads.
        </p>
      </div>

      {data.length === 0 ? (
        <Card className="py-10 text-center text-slate-500">
          No scan results yet. <Link to="/" className="text-cyan-700 hover:underline">Add and verify a site</Link> to measure its performance.
        </Card>
      ) : (
        <>
          {slow.length > 0 && (
            <Alert tone="warning" title={`${slow.length} site${slow.length === 1 ? " responds" : "s respond"} slower than 800 ms`}>
              {slow.map((m) => siteName(m.site)).join(", ")}. Slow servers make every page feel sluggish.
            </Alert>
          )}
          {missing > 0 && (
            <Alert tone="info" title={`${missing} site${missing === 1 ? " has" : "s have"} no performance data yet`}>
              Run a new scan on {missing === 1 ? "it" : "them"} to collect speed measurements.
            </Alert>
          )}

          {measured.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="sm:col-span-2 lg:col-span-1"><ScoreMeter score={avg((p) => p.score)} label="Average performance score" /></Card>
                <Card>
                  <p className="text-sm text-slate-500">Average server response</p>
                  <p className="mt-1 flex items-center gap-2 text-3xl font-semibold text-slate-900">
                    <span className="size-2.5 rounded-full" style={{ background: TONE_COLOR[msTone(avgMs)] }} aria-hidden />
                    {avgMs} <span className="text-lg text-slate-500">ms</span>
                  </p>
                  <p className="text-xs text-slate-500">Target: under 400 ms</p>
                </Card>
                <Card>
                  <p className="text-sm text-slate-500">Average page size</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-900">{fmtBytes(avg((p) => p.pageBytes))}</p>
                  <p className="text-xs text-slate-500">HTML only · target under 500 KB</p>
                </Card>
                <Card>
                  <p className="text-sm text-slate-500">Compression enabled</p>
                  <p className="mt-1 text-3xl font-semibold text-slate-900">{pct(compressed, measured.length)}%</p>
                  <p className="text-xs text-slate-500">{compressed} of {measured.length} sites use gzip or Brotli</p>
                </Card>
              </div>

              <Card>
                <CardTitle hint="Time to first byte of the homepage, slowest first. Click a bar to open the site.">Server response time by site</CardTitle>
                <ResponseTimeBars rows={measured.map((m) => ({ id: m.site.id, name: siteName(m.site), ms: m.perf.ttfbMs }))} onSelect={(id) => navigate(`/sites/${id}`)} />
              </Card>

              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Site</th>
                      <th className="px-4 py-3 text-right font-semibold">Score</th>
                      <th className="px-4 py-3 text-right font-semibold">Response</th>
                      <th className="px-4 py-3 text-right font-semibold">Download</th>
                      <th className="px-4 py-3 text-right font-semibold">Size</th>
                      <th className="px-4 py-3 text-right font-semibold">Resources</th>
                      <th className="px-4 py-3 font-semibold">Compression</th>
                      <th className="px-4 py-3 font-semibold">Caching</th>
                    </tr>
                  </thead>
                  <tbody className="tabular divide-y divide-slate-100">
                    {measured.map(({ site, perf }) => {
                      const failing = perf.checks.filter((c) => !c.passed);
                      const isOpen = open === site.id;
                      return (
                        <Fragment key={site.id}>
                          <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(isOpen ? null : site.id)} aria-expanded={isOpen}>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-2 font-medium text-slate-900">
                                <span className={cx("text-slate-400 transition", isOpen && "rotate-90")}>›</span>
                                {siteName(site)}
                              </span>
                              <span className="pl-4 text-xs text-slate-500">{failing.length ? `${failing.length} improvement${failing.length === 1 ? "" : "s"} available` : "All checks passed"}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900">{perf.score}%</td>
                            <td className="px-4 py-3 text-right">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-2 rounded-full" style={{ background: TONE_COLOR[msTone(perf.ttfbMs)] }} aria-hidden />
                                {perf.ttfbMs} ms
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">{perf.totalMs} ms</td>
                            <td className="px-4 py-3 text-right">{fmtBytes(perf.pageBytes)}</td>
                            <td className="px-4 py-3 text-right">{resourceCount(perf)}</td>
                            <td className="px-4 py-3">{perf.compression ?? <span className="text-slate-400">none</span>}</td>
                            <td className="max-w-[180px] truncate px-4 py-3" title={perf.cacheControl ?? undefined}>{perf.cacheControl ?? <span className="text-slate-400">not set</span>}</td>
                          </tr>
                          {isOpen && (
                            <tr>
                              <td colSpan={8} className="bg-slate-50 px-4 py-4">
                                <ul className="grid gap-2 md:grid-cols-2">
                                  {perf.checks.map((c) => {
                                    const term = termForFinding(c.id);
                                    return (
                                      <li key={c.id} className="flex gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
                                        <AlertIcon tone={c.passed ? "good" : c.impact >= 15 ? "critical" : "warning"} className="mt-0.5 size-4" />
                                        <div className="min-w-0 flex-1">
                                          <p className="flex justify-between gap-2 font-medium text-slate-900">
                                            {c.title}
                                            {!c.passed && <span className="shrink-0 text-xs font-semibold text-red-700">−{c.impact} pts</span>}
                                          </p>
                                          <p className="text-xs text-slate-600">{c.detail}</p>
                                          {!c.passed && c.remediation && <p className="mt-1 text-xs text-slate-700"><b className="text-emerald-800">Fix:</b> {c.remediation}</p>}
                                          {term && <Link to={`/terminology#${term}`} className="mt-1 inline-block text-xs text-cyan-700 hover:underline">What does this mean?</Link>}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
