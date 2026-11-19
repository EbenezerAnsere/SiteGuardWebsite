import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";
import { errorMessage, gradeFor, isActive, PENALTY, siteName } from "./api";
import { pct, scoreTone, timeAgo } from "./components/ui";
import { GLOSSARY, TERM_CATEGORIES, termForFinding } from "./glossary";
import { PLAN, PLANS, priceLabel } from "./plans";

describe("score helpers", () => {
  it("uses the same penalties as the backend scorer", () => {
    expect(PENALTY).toEqual({ critical: 40, high: 20, medium: 10, low: 4, info: 0 });
  });

  it.each([
    [95, false, "A"], [90, false, "A"], [85, false, "B"], [72, false, "C"], [61, false, "D"], [59, false, "F"], [100, true, "F"],
  ] as const)("gradeFor(%i, critical=%s) = %s", (score, critical, grade) => {
    expect(gradeFor(score, critical)).toBe(grade);
  });

  it("rounds percentages and never divides by zero", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(2, 3)).toBe(67);
    expect(pct(5, 0)).toBe(0);
  });

  it("maps scores to status tones at 80% and 60%", () => {
    expect([scoreTone(80), scoreTone(79), scoreTone(60), scoreTone(59), scoreTone(null)]).toEqual(["good", "warning", "warning", "critical", "none"]);
  });

  it("formats relative times", () => {
    const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
    expect(timeAgo(null)).toBe("never");
    expect(timeAgo(ago(10))).toBe("just now");
    expect(timeAgo(ago(300))).toBe("5 min ago");
    expect(timeAgo(ago(7200))).toBe("2 h ago");
    expect(timeAgo(ago(3 * 86400))).toBe("3 d ago");
  });
});

describe("site helpers", () => {
  it("prefers the site name and falls back to the hostname", () => {
    expect(siteName({ name: "Shop", hostname: "shop.test" })).toBe("Shop");
    expect(siteName({ name: null, hostname: "shop.test" })).toBe("shop.test");
    expect(siteName({ name: "", hostname: "shop.test" })).toBe("shop.test");
  });

  it("treats queued and running scans as active", () => {
    expect([isActive({ status: "queued" }), isActive({ status: "running" }), isActive({ status: "completed" }), isActive(null)]).toEqual([true, true, false, false]);
  });
});

describe("errorMessage", () => {
  const axiosError = (status?: number, data?: unknown) => {
    const err = new AxiosError("Request failed");
    if (status) err.response = { status, data, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
    return err;
  };

  it("shows the server's error message", () => {
    expect(errorMessage(axiosError(422, { error: "The verification file was not found" }))).toBe("The verification file was not found");
  });

  it("explains when the backend cannot be reached", () => {
    expect(errorMessage(axiosError())).toMatch(/Cannot reach the server/);
  });

  it("falls back to a generic message", () => {
    expect(errorMessage(new Error("boom"))).toBe("Something went wrong");
    expect(errorMessage(axiosError(500, "<html>"))).toBe("Something went wrong");
  });
});

describe("plans", () => {
  it("offers Free, Solid and Tight in order", () => {
    expect(PLANS.map((p) => p.level)).toEqual(["free", "solid", "tight"]);
    expect(PLAN.solid.name).toBe("Solid");
  });

  it("prices each level, with Free at zero and higher levels costing more", () => {
    expect(PLAN.free.price).toBe(0);
    expect(PLAN.solid.price).toBeGreaterThan(0);
    expect(PLAN.tight.price).toBeGreaterThan(PLAN.solid.price);
    expect(priceLabel(PLAN.free)).toBe("Free");
    expect(priceLabel(PLAN.solid)).toMatch(/^\$\d+$/);
  });

  it("describes what each level checks", () => {
    for (const p of PLANS) expect(p.checks.length).toBeGreaterThan(0);
  });
});

describe("glossary", () => {
  // Every finding / performance-check id the backend scanner can produce.
  const scannerIds = [
    "transport.https", "transport.redirect", "tls.certificate", "tls.legacy", "headers.hsts", "headers.csp", "headers.framing",
    "headers.nosniff", "headers.referrer", "headers.permissions", "disclosure.headers", "disclosure.generator", "disclosure.securitytxt",
    "cookies.secure", "cookies.httponly", "cookies.samesite", "cors.reflection", "content.form-http", "content.mixed", "content.dirlisting",
    "email.spf", "email.dmarc", "exposure:/.env", "exposure:/.git/HEAD", "library:jquery",
    "perf.ttfb", "perf.load", "perf.size", "perf.compression", "perf.cache", "perf.redirects", "perf.requests", "perf.blocking",
  ];
  const termIds = new Set(GLOSSARY.map((t) => t.id));

  it("has unique term ids in known categories", () => {
    expect(termIds.size).toBe(GLOSSARY.length);
    for (const t of GLOSSARY) expect(TERM_CATEGORIES).toContain(t.category);
  });

  it.each(scannerIds)("links finding %s to an existing glossary term", (id) => {
    const term = termForFinding(id);
    expect(term).not.toBeNull();
    expect(termIds.has(term!)).toBe(true);
  });

  it("returns null for unknown ids", () => {
    expect(termForFinding("something.new")).toBeNull();
  });
});
