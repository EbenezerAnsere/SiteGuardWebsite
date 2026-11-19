import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card, cx } from "../components/ui";
import { GLOSSARY, TERM_CATEGORIES, type TermCategory } from "../glossary";

export function TerminologyPage() {
  const { hash } = useLocation();
  const target = hash.slice(1);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TermCategory | "all">("all");

  // Arriving from a "What does this mean?" link: clear filters and scroll to the term.
  useEffect(() => {
    if (!target) return;
    setQuery("");
    setCategory("all");
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [target]);

  const q = query.trim().toLowerCase();
  const terms = GLOSSARY.filter((t) => category === "all" || t.category === category).filter(
    (t) => !q || `${t.term} ${t.aka ?? ""} ${t.definition}`.toLowerCase().includes(q),
  );
  const groups = TERM_CATEGORIES.map((c) => ({ category: c, terms: terms.filter((t) => t.category === c) })).filter((g) => g.terms.length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Terminology</h1>
        <p className="text-sm text-slate-500">Plain-language explanations of the security and performance terms used in SiteGuard reports.</p>
      </div>

      <div className="space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search terms, e.g. CSP, cookie, DMARC…"
          aria-label="Search terms"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-cyan-500"
        />
        <div className="flex flex-wrap gap-2">
          {(["all", ...TERM_CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cx(
                "rounded-full border px-3 py-1 text-sm",
                category === c ? "border-cyan-600 bg-cyan-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400",
              )}
            >
              {c === "all" ? `All (${GLOSSARY.length})` : c}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="py-10 text-center text-slate-500">No terms match “{query}”.</p>}

      {groups.map((g) => (
        <section key={g.category} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{g.category}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.terms.map((t) => (
              <Card key={t.id} className={cx("scroll-mt-24 transition", target === t.id && "ring-2 ring-cyan-500")}>
                <div id={t.id}>
                  <h3 className="font-semibold text-slate-900">{t.term}</h3>
                  {t.aka && <p className="text-xs text-slate-500">{t.aka}</p>}
                  <p className="mt-2 text-sm text-slate-700">{t.definition}</p>
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Why it matters: </span>
                    {t.why}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
