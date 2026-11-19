import type { Finding, Severity } from "../db/schema.js";

/** Points each failed check removes from the 0–100 security score. */
export const PENALTY: Record<Severity, number> = { critical: 40, high: 20, medium: 10, low: 4, info: 0 };

export function scoreFindings(findings: Finding[]) {
  const failed = findings.filter((f) => !f.passed);
  const score = Math.max(0, 100 - failed.reduce((sum, f) => sum + PENALTY[f.severity], 0));
  // Any critical issue caps the grade at F regardless of everything else.
  const hasCritical = failed.some((f) => f.severity === "critical");
  const grade = hasCritical ? "F" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade };
}
