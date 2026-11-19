import { useState } from "react";
import { Link } from "react-router-dom";
import { termForFinding } from "../glossary";
import { SEVERITIES, type Finding, type ScanSummary } from "../api";
import { cx, SeverityBadge } from "./ui";

type Filter = "issues" | "passed" | "all";

export function FindingsReport({ findings, summary }: { findings: Finding[]; summary: ScanSummary | null }) {
  const [filter, setFilter] = useState<Filter>("issues");
  const newIds = new Set(summary?.newIssues ?? []);
  const rank = (f: Finding) => (f.passed ? 99 : SEVERITIES.indexOf(f.severity));
  const visible = findings
    .filter((f) => (filter === "all" ? true : filter === "passed" ? f.passed : !f.passed))
    .sort((a, b) => rank(a) - rank(b) || a.category.localeCompare(b.category));

  const tabs: [Filter, string, number][] = [
    ["issues", "Issues", findings.filter((f) => !f.passed).length],
    ["passed", "Passed", findings.filter((f) => f.passed).length],
    ["all", "All checks", findings.length],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {tabs.map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cx("flex-1 rounded-md px-3 py-1.5 font-medium", filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900")}
          >
            {label} <span className="text-slate-500">{n}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 && <p className="py-6 text-center text-slate-500">Nothing to show here.</p>}
      <ul className="space-y-2">
        {visible.map((f) => (
          <FindingRow key={f.id} finding={f} isNew={newIds.has(f.id)} />
        ))}
      </ul>
    </div>
  );
}

export function FindingRow({ finding: f, isNew = false, site }: { finding: Finding; isNew?: boolean; site?: { id: number; name: string } }) {
  const [open, setOpen] = useState(false);
  const expandable = !f.passed || !!f.evidence;
  const term = termForFinding(f.id);
  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
        onClick={() => setOpen(!open)}
        disabled={!expandable}
        aria-expanded={open}
      >
        {f.passed ? (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs text-emerald-700">✓</span>
        ) : (
          <SeverityBadge severity={f.severity} />
        )}
        <span className={cx("min-w-0 flex-1 text-sm", f.passed ? "text-slate-700" : "font-medium text-slate-900")}>
          {f.title}
          {site && <span className="block text-xs font-normal text-slate-500">{site.name}</span>}
        </span>
        {isNew && <span className="rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-fuchsia-700">New</span>}
        <span className="hidden text-xs text-slate-500 sm:inline">{f.category}</span>
        {expandable && <span className={cx("text-slate-500 transition", open && "rotate-90")}>›</span>}
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-200 px-4 py-3 text-sm">
          {f.description && <p className="text-slate-700">{f.description}</p>}
          {f.evidence && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence</p>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-700">{f.evidence}</pre>
            </div>
          )}
          {f.remediation && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">How to fix</p>
              <p className="text-slate-700">{f.remediation}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs">
            {term && (
              <Link to={`/terminology#${term}`} className="font-medium text-cyan-700 hover:underline">
                What does this mean?
              </Link>
            )}
            {site && (
              <Link to={`/sites/${site.id}`} className="font-medium text-cyan-700 hover:underline">
                Open {site.name}
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
