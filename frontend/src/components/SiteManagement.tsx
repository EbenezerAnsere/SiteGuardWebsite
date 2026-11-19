import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage, siteName, type Site, type SiteWithVerification } from "../api";
import { PracticeTargets } from "./PracticeTargets";
import { Button, cx, ErrorBox } from "./ui";

// ------------------------------------------------------------------ modal

/** Accessible modal: focuses its first control, closes on Esc or backdrop click, restores focus on close. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the effect (which would move focus) on every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, button:not([data-close]), a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div ref={panel} className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">{title}</h2>
          <button data-close className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ add

type Added = { site: SiteWithVerification; preauthorized: string | null };

/** Name + address form for adding a website, with the result and practice-site shortcuts. */
export function AddSiteForm({ autoFocus = false, stacked = false, onOpenSite }: { autoFocus?: boolean; stacked?: boolean; onOpenSite?: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Added | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Enter the website address, e.g. https://example.com");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<Added>("/sites", { url: url.trim(), name: name.trim() || undefined });
      setAdded(data);
      setUrl("");
      setName("");
      qc.invalidateQueries({ queryKey: ["sites"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500";
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className={cx("grid gap-2", !stacked && "sm:grid-cols-[1fr_2fr_auto]")}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Online shop)" maxLength={60} aria-label="Site name" className={input} autoFocus={autoFocus} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-website.com" aria-label="Website address" className={input} />
        <Button type="submit" loading={busy}>Add website</Button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {added && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-slate-800">
          <span className="min-w-0 flex-1">
            <b>{siteName(added.site)}</b> was added.{" "}
            {added.preauthorized ? `It is ready to test: ${added.preauthorized}.` : "Next, verify that you own it so it can be tested."}
          </span>
          <Link to={`/sites/${added.site.id}`} onClick={onOpenSite} className="shrink-0 font-semibold text-cyan-700 hover:underline">
            {added.preauthorized ? "Open site" : "Verify ownership"} →
          </Link>
        </div>
      )}
      <details className="pt-1">
        <summary className="cursor-pointer text-sm font-medium text-cyan-700 hover:underline">
          No site of your own yet? Practise on public sites that invite security scanning
        </summary>
        <div className="pt-3">
          <PracticeTargets compact />
        </div>
      </details>
    </form>
  );
}

export function AddSiteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a website">
      <p className="mb-4 text-sm text-slate-600">Add a site you own. You'll be asked to verify ownership before it can be tested.</p>
      <AddSiteForm autoFocus stacked onOpenSite={onClose} />
    </Modal>
  );
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);

/** A button that opens the add-website dialog. */
export function AddSiteButton({ variant = "primary", label = "Add website", className }: { variant?: "primary" | "icon"; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "icon" ? (
        <button onClick={() => setOpen(true)} className={cx("rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900", className)} aria-label={label} title={label}>
          <PlusIcon />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)} className={className}>
          <PlusIcon /> {label}
        </Button>
      )}
      <AddSiteDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

// ------------------------------------------------------------------ delete

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
  </svg>
);

/** Delete a website (and its test history) after confirmation. Works for verified and unverified sites. */
export function DeleteSiteButton({ site, variant = "icon", className }: { site: Pick<Site, "id" | "name" | "hostname">; variant?: "icon" | "button"; className?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = `Delete ${siteName(site)}`;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/sites/${site.id}`);
      setOpen(false);
      // Leave the page of the deleted site before its cached data is dropped.
      if (location.pathname.startsWith(`/sites/${site.id}`)) navigate("/", { replace: true });
      qc.removeQueries({ queryKey: ["site", site.id] });
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["latest-results"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className={cx("relative z-10 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-700", className)}
          aria-label={label}
          title={label}
        >
          <TrashIcon />
        </button>
      ) : (
        <Button variant="danger" onClick={() => setOpen(true)} className={className}>
          <TrashIcon /> Delete website
        </Button>
      )}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Delete this website?">
        <p className="text-sm text-slate-700">
          <b>{siteName(site)}</b>
          {site.name && <span className="text-slate-500"> ({site.hostname})</span>} and all of its test results, history and monitoring will be
          permanently deleted. This can't be undone.
        </p>
        <p className="mt-2 text-sm text-slate-500">You can add the site again later, but you'll need to verify ownership again.</p>
        {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <TrashIcon /> {busy ? "Deleting…" : "Delete website"}
          </button>
        </div>
      </Modal>
    </>
  );
}
