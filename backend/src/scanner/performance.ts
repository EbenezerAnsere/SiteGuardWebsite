import type { PerfCheck, PerformanceMetrics } from "../db/schema.js";
import type { FetchResult } from "./net.js";

const kb = (n: number) => `${Math.round(n / 1024)} KB`;

/** Derives speed metrics and checks from the homepage response the security scan already fetched. */
export function measurePerformance(main: FetchResult): PerformanceMetrics {
  const type = main.headers.get("content-type") ?? "";
  const isHtml = type.includes("text/html") || /^\s*<(!doctype|html)/i.test(main.body);
  const html = isHtml ? main.body : "";
  const head = html.split(/<\/head>/i)[0] ?? "";

  const resources = {
    scripts: (html.match(/<script\b[^>]*\bsrc\s*=/gi) ?? []).length,
    stylesheets: (html.match(/<link\b[^>]*rel\s*=\s*["']?stylesheet/gi) ?? []).length,
    images: (html.match(/<img\b/gi) ?? []).length,
    iframes: (html.match(/<iframe\b/gi) ?? []).length,
  };
  const requests = resources.scripts + resources.stylesheets + resources.images + resources.iframes;
  const blocking = (head.match(/<script\b[^>]*\bsrc\s*=[^>]*>/gi) ?? []).filter(
    (tag) => !/\b(async|defer)\b/i.test(tag) && !/type\s*=\s*["']?module/i.test(tag),
  ).length;
  const compression = main.headers.get("content-encoding");
  const cacheControl = main.headers.get("cache-control");

  const checks: PerfCheck[] = [];
  const check = (c: PerfCheck) => checks.push(c);

  const t = main.ttfbMs;
  check({
    id: "perf.ttfb", title: "Server response time", passed: t <= 400, impact: t <= 400 ? 0 : t <= 800 ? 15 : 30,
    detail: `${t} ms until the first byte (target: under 400 ms)`,
    remediation: "Cache rendered pages, put a CDN in front of the site, and look for slow database queries or server-side API calls.",
  });
  const total = main.totalMs;
  check({
    id: "perf.load", title: "Page download time", passed: total <= 1000, impact: total <= 1000 ? 0 : total <= 2000 ? 10 : 20,
    detail: `${total} ms to download the HTML (target: under 1 s)`,
    remediation: "Reduce the HTML size and server response time; stream the response if the page is built slowly.",
  });
  const size = main.bytes;
  check({
    id: "perf.size", title: "HTML page size", passed: size <= 500 * 1024,
    impact: size <= 500 * 1024 ? 0 : size <= 1024 * 1024 ? 5 : size <= 2 * 1024 * 1024 ? 10 : 20,
    detail: `${kb(size)}${main.truncated ? "+ (measurement capped)" : ""} of HTML (target: under 500 KB)`,
    remediation: "Remove inlined data and large inline scripts/styles; load content on demand.",
  });
  const compressible = size > 1024 && /text\/|javascript|json|xml|svg/.test(type);
  check({
    id: "perf.compression", title: "Text compression", passed: !compressible || !!compression, impact: compressible && !compression ? 15 : 0,
    detail: compression ? `Compressed with ${compression}` : compressible ? "HTML is sent uncompressed" : "Response too small to need compression",
    remediation: "Enable Brotli or gzip compression for HTML, CSS and JavaScript in your web server or CDN.",
  });
  check({
    id: "perf.cache", title: "Caching policy", passed: !!cacheControl, impact: cacheControl ? 0 : 5,
    detail: cacheControl ? `Cache-Control: ${cacheControl}` : "No Cache-Control header, so browsers and CDNs guess how long to cache",
    remediation: "Send an explicit Cache-Control header (e.g. no-cache for HTML plus long max-age with hashed filenames for static assets).",
  });
  check({
    id: "perf.redirects", title: "Redirect chain", passed: main.redirects <= 1, impact: main.redirects <= 1 ? 0 : 10,
    detail: main.redirects === 0 ? "No redirects" : `${main.redirects} redirect${main.redirects === 1 ? "" : "s"} before the page loads`,
    remediation: "Link directly to the final URL and collapse chains like http → https → www into a single redirect.",
  });
  check({
    id: "perf.requests", title: "Number of resources", passed: requests <= 30, impact: requests <= 30 ? 0 : requests <= 60 ? 5 : 10,
    detail: `${requests} scripts, stylesheets, images and frames referenced in the HTML (target: 30 or fewer)`,
    remediation: "Bundle scripts and styles, lazy-load images below the fold, and remove unused third-party tags.",
  });
  check({
    id: "perf.blocking", title: "Render-blocking scripts", passed: blocking <= 1, impact: blocking <= 1 ? 0 : 5,
    detail: blocking ? `${blocking} script${blocking === 1 ? "" : "s"} in <head> without async or defer` : "No render-blocking scripts in <head>",
    remediation: "Add defer (or async) to scripts in <head>, or move them to the end of <body>.",
  });

  const score = Math.max(0, 100 - checks.reduce((s, c) => s + c.impact, 0));
  return {
    score, ttfbMs: t, totalMs: total, pageBytes: size, truncated: main.truncated, redirects: main.redirects,
    compression, cacheControl, resources, checks,
  };
}
