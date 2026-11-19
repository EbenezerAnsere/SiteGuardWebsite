import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ScanLevel, ScanStatus, Severity } from "../api";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ brand

export function LogoMark({ className = "size-8" }: { className?: string }) {
  // Unique per instance: a shared id breaks when the first copy sits in a hidden (display:none) sidebar.
  const gradientId = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path d="M16 2l12 4.5v8.7c0 7.3-5.1 13.4-12 14.8C9.1 28.6 4 22.5 4 15.2V6.5L16 2z" fill={`url(#${gradientId})`} />
      <circle cx="16" cy="15" r="6.5" fill="none" stroke="#0f172a" strokeWidth="2" />
      <circle cx="16" cy="15" r="2" fill="#0f172a" />
      <path d="M16 15l5.2-4.6" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={size === "lg" ? "size-12" : "size-8"} />
      <span className="leading-tight">
        <span className={cx("block font-extrabold tracking-tight text-slate-900", size === "lg" ? "text-2xl" : "text-lg")}>
          Site<span className="text-cyan-700">Guard</span>
        </span>
        {size === "lg" && <span className="block text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Security monitoring</span>}
      </span>
    </span>
  );
}

/** The site's own favicon, falling back to its initial when there isn't one. */
export function SiteIcon({ url, name, className = "size-10" }: { url: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cx("grid shrink-0 place-items-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200", className)}>
      {failed ? (
        <span className="text-sm font-bold uppercase text-slate-700">{name.replace(/^www\./, "").charAt(0)}</span>
      ) : (
        <img
          src={`${url}/favicon.ico`}
          alt=""
          referrerPolicy="no-referrer"
          className="size-3/5 object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

// ------------------------------------------------------------------ basics

export function Spinner({ className = "size-6" }: { className?: string }) {
  return <span className={cx("inline-block animate-spin rounded-full border-2 border-slate-300 border-t-cyan-600", className)} aria-label="Loading" />;
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-cyan-600 text-white hover:bg-cyan-700",
  secondary: "border border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200",
  danger: "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
};

export function Button({
  variant = "primary", loading, children, className, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant], className,
      )}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>{children}</div>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-semibold text-slate-900">{children}</h2>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{children}</div>;
}

// ------------------------------------------------------------------ warnings

export type AlertTone = "critical" | "warning" | "info" | "good";

const ALERT_STYLE: Record<AlertTone, string> = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-300 bg-amber-50",
  info: "border-sky-200 bg-sky-50",
  good: "border-emerald-200 bg-emerald-50",
};
const ALERT_LABEL: Record<AlertTone, string> = { critical: "Critical", warning: "Warning", info: "Notice", good: "All clear" };

export function AlertIcon({ tone, className = "size-5" }: { tone: AlertTone; className?: string }) {
  const color = { critical: "var(--status-critical)", warning: "var(--status-warning)", info: "var(--series-1)", good: "var(--status-good)" }[tone];
  return (
    <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {tone === "critical" && <><path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z" /><path d="M12 8v5M12 16.5v.01" /></>}
      {tone === "warning" && <><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17v.01" /></>}
      {tone === "info" && <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>}
      {tone === "good" && <><circle cx="12" cy="12" r="10" /><path d="M8 12l3 3 5-6" /></>}
    </svg>
  );
}

export function Alert({ tone, title, children, action }: { tone: AlertTone; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3", ALERT_STYLE[tone])}>
      <AlertIcon tone={tone} className="mt-0.5 size-5" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-slate-900">
          <span className="sr-only">{ALERT_LABEL[tone]}: </span>
          {title}
        </p>
        {children && <div className="mt-1 text-slate-700">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ severity / grade / status

export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
export const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "var(--sev-critical)", high: "var(--sev-high)", medium: "var(--sev-medium)", low: "var(--sev-low)", info: "var(--sev-info)",
};
// Text inside the fill: white on the dark fills, near-black on the light ones.
const SEVERITY_INK: Record<Severity, string> = { critical: "#ffffff", high: "#0b0b0b", medium: "#0b0b0b", low: "#ffffff", info: "#ffffff" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className="inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"
      style={{ background: SEVERITY_COLOR[severity], color: SEVERITY_INK[severity] }}
    >
      {severity}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: Severity }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[severity] }} aria-hidden />;
}

/** Status tone for a 0–100 score: used by meters, bars and grade badges. */
export function scoreTone(score: number | null | undefined): "good" | "warning" | "critical" | "none" {
  if (score == null) return "none";
  return score >= 80 ? "good" : score >= 60 ? "warning" : "critical";
}
export const TONE_COLOR = { good: "var(--status-good)", warning: "var(--status-warning)", critical: "var(--status-critical)", none: "var(--sev-info)" };

const GRADE_STYLE: Record<string, string> = {
  A: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  B: "bg-lime-50 text-lime-800 ring-lime-400",
  C: "bg-amber-50 text-amber-800 ring-amber-300",
  D: "bg-orange-50 text-orange-700 ring-orange-300",
  F: "bg-red-50 text-red-700 ring-red-300",
};

export function GradeBadge({ grade, size = "md" }: { grade: string | null; size?: "xs" | "sm" | "md" | "lg" }) {
  return (
    <span
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-xl font-black",
        size === "lg" ? "size-20 text-4xl ring-2" : size === "sm" ? "size-8 rounded-lg text-sm ring-2" : size === "xs" ? "size-6 rounded-md text-xs ring-1" : "size-11 text-xl ring-2",
        grade ? GRADE_STYLE[grade] : "bg-slate-100 text-slate-500 ring-slate-200",
      )}
      title={grade ? `Grade ${grade}` : "Not scanned yet"}
    >
      {grade ?? "–"}
    </span>
  );
}

const LEVEL_STYLE: Record<ScanLevel, string> = {
  free: "bg-slate-100 text-slate-700 ring-slate-300",
  solid: "bg-cyan-50 text-cyan-800 ring-cyan-300",
  tight: "bg-indigo-50 text-indigo-800 ring-indigo-300",
};
const LEVEL_NAME: Record<ScanLevel, string> = { free: "Free", solid: "Solid", tight: "Tight" };

/** Which test level a scan ran at. */
export function LevelBadge({ level, suffix = " test" }: { level: ScanLevel; suffix?: string }) {
  return (
    <span className={cx("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", LEVEL_STYLE[level])}>
      {LEVEL_NAME[level]}{suffix}
    </span>
  );
}

export function StatusPill({ status }: { status: ScanStatus }) {
  const style: Record<ScanStatus, string> = {
    queued: "text-slate-700 bg-slate-100",
    running: "text-cyan-700 bg-cyan-50",
    completed: "text-emerald-700 bg-emerald-50",
    failed: "text-red-700 bg-red-50",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", style[status])}>
      {(status === "running" || status === "queued") && <Spinner className="size-3" />}
      {status}
    </span>
  );
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
