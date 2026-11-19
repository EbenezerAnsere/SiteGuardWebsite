import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage, type SiteWithVerification, type TestTarget } from "../api";
import { useSites } from "../hooks";
import { Button, cx } from "./ui";

/** Public sites whose owners invite security scanning: added already verified, one click each. */
export function PracticeTargets({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sites = useSites();
  const targets = useQuery({
    queryKey: ["test-targets"],
    queryFn: async () => (await api.get<{ targets: TestTarget[] }>("/test-targets")).data.targets,
    staleTime: Infinity,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const added = new Set((sites.data ?? []).map((s) => s.hostname));

  async function add(t: TestTarget) {
    setBusy(t.host);
    setError(null);
    try {
      const { data } = await api.post<{ site: SiteWithVerification }>("/sites", { url: t.url, name: t.name });
      await qc.invalidateQueries({ queryKey: ["sites"] });
      navigate(`/security?site=${data.site.id}#run`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!targets.data?.length) return null;
  return (
    <div className="space-y-2">
      <ul className={cx("grid gap-2", compact ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2")}>
        {targets.data.map((t) => (
          <li key={t.host} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900" title={t.name}>{t.name}</p>
              <p className="truncate text-xs text-slate-500">{t.host} · by {t.owner}</p>
              {!compact && <p className="mt-1 text-xs text-slate-600">{t.description}</p>}
            </div>
            {added.has(t.host) ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">Added</span>
            ) : (
              <Button variant="secondary" className="shrink-0 px-3 py-1.5" loading={busy === t.host} disabled={!!busy} onClick={() => add(t)}>
                Add
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
