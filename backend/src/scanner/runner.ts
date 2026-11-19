import { and, desc, eq, inArray, isNotNull, lt, ne, or, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { scans, sites, type Finding, type ScanLevel, type ScanSummary, type Severity } from "../db/schema.js";
import { runChecks } from "./checks.js";
import { TargetError } from "./net.js";

const PENALTY: Record<Severity, number> = { critical: 40, high: 20, medium: 10, low: 4, info: 0 };

export function scoreFindings(findings: Finding[]) {
  const failed = findings.filter((f) => !f.passed);
  const score = Math.max(0, 100 - failed.reduce((sum, f) => sum + PENALTY[f.severity], 0));
  // Any critical issue caps the grade at F regardless of everything else.
  const hasCritical = failed.some((f) => f.severity === "critical");
  const grade = hasCritical ? "F" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade };
}

const issueIds = (findings: Finding[] | null | undefined) =>
  new Set((findings ?? []).filter((f) => !f.passed && f.severity !== "info").map((f) => f.id));

// --- small in-process queue so a burst of scans doesn't open hundreds of sockets at once
const MAX_CONCURRENT = 3;
let active = 0;
const queue: number[] = [];

export function enqueueScan(scanId: number) {
  queue.push(scanId);
  drain();
}

function drain() {
  while (active < MAX_CONCURRENT && queue.length) {
    const id = queue.shift()!;
    active++;
    executeScan(id)
      .catch((err) => console.error(`scan ${id} crashed`, err))
      .finally(() => {
        active--;
        drain();
      });
  }
}

async function executeScan(scanId: number) {
  const [row] = await db
    .select({ scan: scans, site: sites })
    .from(scans)
    .innerJoin(sites, eq(scans.siteId, sites.id))
    .where(eq(scans.id, scanId));
  if (!row) return;
  const { site, scan } = row;

  await db.update(scans).set({ status: "running", startedAt: new Date() }).where(eq(scans.id, scanId));
  try {
    const { findings, performance } = await runChecks(site.url, scan.level);
    const { score, grade } = scoreFindings(findings);

    // Compare with the previous scan of the same level only: a lighter scan skips checks,
    // which would otherwise show up as "fixed" issues.
    const [previous] = await db
      .select({ findings: scans.findings })
      .from(scans)
      .where(and(eq(scans.siteId, site.id), eq(scans.status, "completed"), eq(scans.level, scan.level), ne(scans.id, scanId)))
      .orderBy(desc(scans.createdAt))
      .limit(1);
    const current = issueIds(findings);
    const before = previous ? issueIds(previous.findings) : null;

    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) if (!f.passed) counts[f.severity]++;
    const summary: ScanSummary = {
      counts,
      passed: findings.filter((f) => f.passed).length,
      failed: findings.filter((f) => !f.passed).length,
      newIssues: before ? [...current].filter((id) => !before.has(id)) : [],
      resolvedIssues: before ? [...before].filter((id) => !current.has(id)) : [],
    };

    await db
      .update(scans)
      .set({ status: "completed", score, grade, summary, findings, performance, finishedAt: new Date() })
      .where(eq(scans.id, scanId));
  } catch (err) {
    const message = err instanceof TargetError ? err.message : "Unexpected scanner error";
    if (!(err instanceof TargetError)) console.error(`scan ${scanId} failed`, err);
    await db.update(scans).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(scans.id, scanId));
  } finally {
    await db.update(sites).set({ lastScanAt: new Date() }).where(eq(sites.id, site.id));
  }
}

/** Creates a scan row and queues it. */
export async function startScan(siteId: number, trigger: "manual" | "scheduled", level: ScanLevel) {
  const [scan] = await db.insert(scans).values({ siteId, status: "queued", trigger, level }).returning();
  enqueueScan(scan.id);
  return scan;
}

/** Scans left "running" by a previous process will never finish; mark them failed. */
export async function failInterruptedScans() {
  await db
    .update(scans)
    .set({ status: "failed", error: "Scan was interrupted by a server restart", finishedAt: new Date() })
    .where(inArray(scans.status, ["queued", "running"]));
}

/** Every 10 minutes, re-scan verified sites whose monitoring interval has elapsed. */
export function startScheduler() {
  const tick = async () => {
    try {
      const due = await db
        .select({ id: sites.id, level: sites.scanLevel })
        .from(sites)
        .where(
          and(
            eq(sites.monitoring, true),
            isNotNull(sites.verifiedAt),
            or(isNull(sites.lastScanAt), lt(sites.lastScanAt, sql`now() - make_interval(hours => ${sites.monitorIntervalHours})`)),
          ),
        );
      for (const { id, level } of due) {
        const [busy] = await db
          .select({ id: scans.id })
          .from(scans)
          .where(and(eq(scans.siteId, id), inArray(scans.status, ["queued", "running"])))
          .limit(1);
        if (!busy) await startScan(id, "scheduled", level);
      }
    } catch (err) {
      console.error("scheduler tick failed", err);
    }
  };
  setTimeout(tick, 15_000);
  setInterval(tick, 10 * 60_000);
}
