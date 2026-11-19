import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage, isActive, siteName, type ScanLevel, type SiteListItem } from "../api";
import { useSites } from "../hooks";
import { AddSiteForm, DeleteSiteButton } from "./SiteManagement";
import { PLAN, PLANS } from "../plans";
import { Alert, Button, Card, cx, GradeBadge, LevelBadge, SiteIcon, Spinner, StatusPill, timeAgo } from "./ui";

/** Choose a test level, add sites and run security tests — the Security page's "run" area. */
export function RunPanel() {
  const qc = useQueryClient();
  const sites = useSites();
  const [params, setParams] = useSearchParams();
  const level = (["free", "solid", "tight"].includes(params.get("level") ?? "") ? params.get("level") : "solid") as ScanLevel;
  const focusSite = Number(params.get("site")) || null;
  const setLevel = (l: ScanLevel) => {
    const next = new URLSearchParams(params);
    next.set("level", l);
    setParams(next, { replace: true });
  };

  const [pending, setPending] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});

  const list = sites.data ?? [];
  const runnable = list.filter((s) => s.verifiedAt && !isActive(s.latestScan));
  const running = list.filter((s) => isActive(s.latestScan));

  // Arriving from a Dashboard plan button ("Run a Tight test"): start that test on every verified site.
  // The trigger travels in navigation state (not the URL) so a refresh or bookmark never re-runs tests.
  const location = useLocation();
  const navigate = useNavigate();
  const autorunDone = useRef(false);
  const [autorunNote, setAutorunNote] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  useEffect(() => {
    const wanted = (location.state as { autorun?: boolean } | null)?.autorun;
    if (!wanted || autorunDone.current || !sites.data) return;
    autorunDone.current = true;
    navigate(location.pathname + location.search + location.hash, { replace: true, state: null });
    const targets = sites.data.filter((s) => s.verifiedAt && !isActive(s.latestScan));
    const name = PLAN[level].name;
    if (targets.length === 0) {
      setAutorunNote({
        tone: "warning",
        text: sites.data.length === 0
          ? `Add a website and verify it below, then run the ${name} test.`
          : `None of your websites can be tested yet. Verify ownership first, then run the ${name} test.`,
      });
      return;
    }
    setAutorunNote({ tone: "info", text: `Started the ${name} test on ${targets.length} website${targets.length === 1 ? "" : "s"}. Results appear below as each one finishes.` });
    targets.forEach((s) => run(s, level));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, sites.data]);

  async function run(site: SiteListItem, runLevel: ScanLevel = level) {
    setPending((p) => new Set(p).add(site.id));
    setErrors(({ [site.id]: _, ...rest }) => rest);
    try {
      await api.post(`/sites/${site.id}/scans`, { level: runLevel });
    } catch (err) {
      setErrors((e) => ({ ...e, [site.id]: errorMessage(err) }));
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(site.id);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["sites"] });
    }
  }


  return (
    <Card className="space-y-6" >
      <div id="run" className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Run a security test</h2>
          <p className="text-sm text-slate-500">Choose a test level, then run it on any verified website.</p>
        </div>
        {running.length > 0 && (
          <span className="flex items-center gap-2 text-sm text-cyan-800">
            <Spinner className="size-4" /> {running.length} test{running.length === 1 ? "" : "s"} running
          </span>
        )}
      </div>

      {autorunNote && <Alert tone={autorunNote.tone} title={autorunNote.text} />}

      {/* ---- level switch (no prices here; plans and prices live on the Dashboard) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-slate-900">Test level</span>
          <div role="radiogroup" aria-label="Test level" className="inline-flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {PLANS.map((p) => (
              <button
                key={p.level}
                role="radio"
                aria-checked={p.level === level}
                onClick={() => setLevel(p.level)}
                className={cx("rounded-md px-4 py-1.5 font-medium", p.level === level ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600">
          <b className="text-slate-800">{PLAN[level].name} test checks:</b> {PLAN[level].checks.join(" · ")}
        </p>
      </div>

      {/* ---- sites */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Your sites</h3>
          {runnable.length > 1 && (
            <Button variant="secondary" onClick={() => runnable.forEach((s) => run(s))} disabled={pending.size > 0}>
              Run {PLAN[level].name} test on all {runnable.length} sites
            </Button>
          )}
        </div>
        {sites.isLoading && <Spinner />}
        {list.length === 0 && !sites.isLoading && <p className="text-sm text-slate-500">Add your first site below to run a test.</p>}
        <ul hidden={list.length === 0} className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {list.map((s) => {
            const active = isActive(s.latestScan);
            const done = s.latestCompleted;
            return (
              <li key={s.id} className={cx("flex flex-wrap items-center gap-3 px-4 py-3", focusSite === s.id && "bg-cyan-50/50")}>
                <SiteIcon url={s.url} name={siteName(s)} className="size-9" />
                <div className="min-w-0 flex-1 basis-40">
                  <Link to={`/sites/${s.id}`} className="block truncate font-medium text-slate-900 hover:underline">{siteName(s)}</Link>
                  <p className="truncate text-xs text-slate-500">
                    {active ? (
                      <>Testing now · {s.latestScan && <LevelBadge level={s.latestScan.level} />}</>
                    ) : done ? (
                      <>Last tested {timeAgo(done.finishedAt)} · <LevelBadge level={done.level} /></>
                    ) : s.verifiedAt ? "Not tested yet" : "Ownership not verified"}
                  </p>
                  {errors[s.id] && <p className="mt-1 text-xs text-red-700">{errors[s.id]}</p>}
                  {s.latestScan?.status === "failed" && !active && <p className="mt-1 text-xs text-red-700">Last test failed: {s.latestScan.error}</p>}
                </div>
                {done?.score != null && !active && (
                  <span className="tabular text-sm font-semibold text-slate-900">{done.score}%</span>
                )}
                <GradeBadge grade={done?.grade ?? null} size="sm" />
                {!s.verifiedAt ? (
                  <Link to={`/sites/${s.id}`} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                    Verify ownership
                  </Link>
                ) : active ? (
                  <StatusPill status={s.latestScan!.status} />
                ) : (
                  <Button onClick={() => run(s)} loading={pending.has(s.id)} className="min-w-36">
                    Run {PLAN[level].name} test
                  </Button>
                )}
                <DeleteSiteButton site={s} />
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- add a site */}
      <div className="space-y-2 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Add a website</h3>
        <AddSiteForm />
      </div>
    </Card>
  );
}
