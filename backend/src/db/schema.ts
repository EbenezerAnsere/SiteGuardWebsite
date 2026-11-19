import { boolean, integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** How deep a scan goes: free = quick check, solid = standard test, tight = full test. */
export type ScanLevel = "free" | "solid" | "tight";
export const SCAN_LEVELS: ScanLevel[] = ["free", "solid", "tight"];

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

export interface PerfCheck {
  id: string;
  title: string;
  passed: boolean;
  /** Points taken off the performance score when this check fails. */
  impact: number;
  detail: string;
  remediation?: string;
}

/** Homepage speed measured from the scanner's location during a scan. */
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

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sites = pgTable(
  "sites",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name"),
    hostname: text("hostname").notNull(),
    verificationToken: text("verification_token").notNull(),
    verifiedAt: timestamp("verified_at"),
    verifiedVia: text("verified_via").$type<"file" | "dns" | "test-target" | "authorized-host">(),
    monitoring: boolean("monitoring").default(true).notNull(),
    monitorIntervalHours: integer("monitor_interval_hours").default(24).notNull(),
    /** Level used for scheduled scans. */
    scanLevel: text("scan_level").$type<ScanLevel>().default("tight").notNull(),
    lastScanAt: timestamp("last_scan_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("sites_user_idx").on(t.userId)],
);

export const scans = pgTable(
  "scans",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    status: text("status").$type<"queued" | "running" | "completed" | "failed">().notNull(),
    trigger: text("trigger").$type<"manual" | "scheduled">().notNull(),
    level: text("level").$type<ScanLevel>().default("tight").notNull(),
    score: integer("score"),
    grade: text("grade"),
    summary: jsonb("summary").$type<ScanSummary>(),
    findings: jsonb("findings").$type<Finding[]>(),
    performance: jsonb("performance").$type<PerformanceMetrics>(),
    error: text("error"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("scans_site_created_idx").on(t.siteId, t.createdAt)],
);
