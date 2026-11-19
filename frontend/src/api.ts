import axios, { AxiosError } from "axios";

export const api = axios.create({ baseURL: "/api", withCredentials: true });

export function errorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (!err.response) return "Cannot reach the server. Is the backend running?";
  }
  return "Something went wrong";
}

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export interface User {
  id: number;
  email: string;
}

export interface Finding {
  id: string;
  category: string;
  title: string;
  severity: Severity;
  passed: boolean;
  description: string;
  evidence?: string;
  remediation?: string;
}

export interface ScanSummary {
  counts: Record<Severity, number>;
  passed: number;
  failed: number;
  newIssues: string[];
  resolvedIssues: string[];
}

export type ScanStatus = "queued" | "running" | "completed" | "failed";
export type ScanLevel = "free" | "solid" | "tight";

export interface ScanListItem {
  id: number;
  siteId: number;
  status: ScanStatus;
  trigger: "manual" | "scheduled";
  level: ScanLevel;
  score: number | null;
  grade: string | null;
  summary: ScanSummary | null;
  performance: PerformanceMetrics | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface Scan extends ScanListItem {
  findings: Finding[] | null;
}

export interface Site {
  id: number;
  url: string;
  hostname: string;
  name: string | null;
  verifiedAt: string | null;
  verifiedVia: "file" | "dns" | "test-target" | "authorized-host" | null;
  monitoring: boolean;
  monitorIntervalHours: number;
  scanLevel: ScanLevel;
  lastScanAt: string | null;
  createdAt: string;
}

export interface SiteWithVerification extends Site {
  verification: { filePath: string; fileUrl: string; fileContent: string; dnsHost: string; dnsValue: string };
}

export interface SiteListItem extends Site {
  latestScan: ScanListItem | null;
  latestCompleted: ScanListItem | null;
}

export const isActive = (s?: { status: ScanStatus } | null) => s?.status === "queued" || s?.status === "running";

export const siteName = (s: { name?: string | null; hostname: string }) => s.name || s.hostname;

export interface PerfCheck {
  id: string;
  title: string;
  passed: boolean;
  impact: number;
  detail: string;
  remediation?: string;
}

export interface PerformanceMetrics {
  score: number;
  ttfbMs: number;
  totalMs: number;
  pageBytes: number;
  truncated: boolean;
  redirects: number;
  compression: string | null;
  cacheControl: string | null;
  resources: { scripts: number; stylesheets: number; images: number; iframes: number };
  checks: PerfCheck[];
}

/** One row per site: its latest completed scan, from GET /api/findings. */
export interface LatestResult {
  site: { id: number; name: string | null; hostname: string; url: string };
  scan: {
    id: number;
    level: ScanLevel;
    score: number | null;
    grade: string | null;
    summary: ScanSummary | null;
    findings: Finding[] | null;
    performance: PerformanceMetrics | null;
    finishedAt: string | null;
  };
}

/** Points each failed check removes from the security score (mirrors the backend). */
export const PENALTY: Record<Severity, number> = { critical: 40, high: 20, medium: 10, low: 4, info: 0 };

export function gradeFor(score: number, hasCritical: boolean) {
  if (hasCritical) return "F";
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
}

export interface TestTarget {
  host: string;
  url: string;
  name: string;
  owner: string;
  description: string;
}

export const VERIFIED_VIA_LABEL: Record<NonNullable<Site["verifiedVia"]>, string> = {
  file: "verification file",
  dns: "DNS TXT record",
  "test-target": "public scanner test site",
  "authorized-host": "administrator authorization",
};
