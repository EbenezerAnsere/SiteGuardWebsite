import { describe, expect, it } from "vitest";
import type { FetchResult } from "./net.js";
import { measurePerformance } from "./performance.js";

function response(overrides: Omit<Partial<FetchResult>, "headers"> & { headers?: Record<string, string> } = {}): FetchResult {
  const { headers, ...rest } = overrides;
  const body = rest.body ?? "<!doctype html><html><head></head><body>hi</body></html>";
  return {
    url: "https://site.test/",
    status: 200,
    body,
    bytes: Buffer.byteLength(body),
    truncated: false,
    redirects: 0,
    ttfbMs: 120,
    totalMs: 150,
    ...rest,
    headers: new Headers({ "content-type": "text/html", "content-encoding": "br", "cache-control": "no-cache", ...headers }),
  };
}
const failing = (r: ReturnType<typeof measurePerformance>) => r.checks.filter((c) => !c.passed).map((c) => c.id).sort();

describe("measurePerformance", () => {
  it("scores a fast, compressed, cached page at 100%", () => {
    const r = measurePerformance(response());
    expect(r.score).toBe(100);
    expect(failing(r)).toEqual([]);
  });

  it("penalises slow server responses in two steps", () => {
    expect(measurePerformance(response({ ttfbMs: 600, totalMs: 650 })).score).toBe(85);
    expect(measurePerformance(response({ ttfbMs: 900, totalMs: 950 })).score).toBe(70);
  });

  it("flags uncompressed HTML over 1 KB, but not tiny responses", () => {
    const big = "<html><body>" + "<p>text</p>".repeat(200) + "</body></html>";
    const r = measurePerformance(response({ body: big, bytes: big.length, headers: { "content-encoding": "" } }));
    expect(failing(r)).toContain("perf.compression");
    expect(failing(measurePerformance(response({ headers: { "content-encoding": "" } })))).not.toContain("perf.compression");
  });

  it("counts resources and render-blocking scripts", () => {
    const html = `<html><head><script src="a.js"></script><script src="b.js"></script><script src="c.js" defer></script>
<script type="module" src="d.js"></script><link rel="stylesheet" href="s.css"></head><body><img src="x.png"><iframe src="f"></iframe></body></html>`;
    const r = measurePerformance(response({ body: html, bytes: html.length }));
    expect(r.resources).toEqual({ scripts: 4, stylesheets: 1, images: 1, iframes: 1 });
    const blocking = r.checks.find((c) => c.id === "perf.blocking")!;
    expect(blocking.passed).toBe(false);
    expect(blocking.detail).toMatch(/^2 scripts/);
  });

  it("flags missing caching headers and redirect chains", () => {
    const r = measurePerformance(response({ redirects: 2, headers: { "cache-control": "" } }));
    expect(failing(r)).toEqual(["perf.cache", "perf.redirects"]);
  });

  it("never scores below zero", () => {
    const html = "<html><head>" + '<script src="x.js"></script>'.repeat(80) + "</head></html>";
    const r = measurePerformance(response({ body: html, bytes: 3_000_000, ttfbMs: 5000, totalMs: 9000, redirects: 4, headers: { "content-encoding": "", "cache-control": "" } }));
    expect(r.score).toBe(0);
  });
});
