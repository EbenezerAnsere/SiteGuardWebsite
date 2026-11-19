import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hardenedSite, serve, weakSite, type Fixture } from "../test/fixtures.js";
import { runChecks } from "./checks.js";
import { TargetError } from "./net.js";
import { scoreFindings } from "./score.js";

let weak: Fixture;
let hardened: Fixture;
beforeAll(async () => {
  [weak, hardened] = await Promise.all([serve(weakSite()), serve(hardenedSite)]);
});
afterAll(async () => {
  await Promise.all([weak.close(), hardened.close()]);
});

const ids = (findings: { id: string; passed: boolean }[], passed = false) =>
  findings.filter((f) => f.passed === passed).map((f) => f.id);

describe("runChecks on a deliberately weak site", () => {
  it("finds the exposed secrets with a Tight test", async () => {
    const { findings } = await runChecks(weak.url, "tight");
    const failed = findings.filter((f) => !f.passed);
    const critical = failed.filter((f) => f.severity === "critical").map((f) => f.id).sort();
    expect(critical).toEqual(["exposure:/.env", "exposure:/.git/HEAD"]);
    expect(scoreFindings(findings).grade).toBe("F");
  });

  it("reports every planted weakness", async () => {
    const { findings } = await runChecks(weak.url, "tight");
    expect(ids(findings)).toEqual(
      expect.arrayContaining([
        "transport.https", "cors.reflection", "content.form-http", "library:jquery", "disclosure.generator",
        "disclosure.headers", "headers.csp", "headers.framing", "cookies.httponly", "cookies.samesite",
      ]),
    );
    const cors = findings.find((f) => f.id === "cors.reflection")!;
    expect(cors.severity).toBe("high");
    expect(findings.find((f) => f.id === "library:jquery")!.title).toContain("1.12.4");
  });
});

describe("runChecks on a hardened site", () => {
  it("raises no false alarms for files that are not there (soft 404 pages)", async () => {
    const { findings } = await runChecks(hardened.url, "tight");
    expect(findings.filter((f) => f.id.startsWith("exposure:"))).toEqual([]);
    expect(ids(findings, true)).toContain("exposure.none");
  });

  it("passes the header, cookie and CORS checks", async () => {
    const { findings } = await runChecks(hardened.url, "tight");
    expect(ids(findings, true)).toEqual(
      expect.arrayContaining(["headers.csp", "headers.framing", "headers.nosniff", "headers.referrer", "cors.reflection", "disclosure.securitytxt"]),
    );
    // Served over plain HTTP in tests, so this is the only high-severity issue.
    expect(findings.filter((f) => !f.passed && f.severity === "high").map((f) => f.id)).toEqual(["transport.https"]);
  });
});

describe("scan levels", () => {
  it("runs more checks at each higher level", async () => {
    const [free, solid, tight] = await Promise.all((["free", "solid", "tight"] as const).map((l) => runChecks(weak.url, l)));
    expect(free.findings.length).toBeLessThan(solid.findings.length);
    expect(solid.findings.length).toBeLessThan(tight.findings.length);
  });

  it("only probes for exposed files in a Tight test", async () => {
    const [free, solid] = await Promise.all([runChecks(weak.url, "free"), runChecks(weak.url, "solid")]);
    for (const r of [free, solid]) expect(r.findings.some((f) => f.id.startsWith("exposure"))).toBe(false);
  });

  it("measures performance from Solid upwards", async () => {
    expect((await runChecks(weak.url, "free")).performance).toBeNull();
    expect((await runChecks(weak.url, "solid")).performance?.score).toBeTypeOf("number");
  });

  it("keeps Free to basic categories", async () => {
    const { findings } = await runChecks(weak.url, "free");
    const categories = new Set(findings.map((f) => f.category));
    expect([...categories].sort()).toEqual(["Cookies", "Headers", "Information disclosure", "Transport"]);
  });
});

describe("unreachable sites", () => {
  it("fail with a TargetError the user can read", async () => {
    await expect(runChecks("http://127.0.0.1:1", "free")).rejects.toBeInstanceOf(TargetError);
  });
});
