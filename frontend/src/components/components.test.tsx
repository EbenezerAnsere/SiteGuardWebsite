import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeverityBars, SeverityShareBar } from "./charts";
import { Alert, GradeBadge, LevelBadge, SeverityBadge } from "./ui";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("badges", () => {
  it("labels severities in words, not just colour", () => {
    expect(text(renderToStaticMarkup(<SeverityBadge severity="critical" />))).toBe("critical");
  });

  it("shows a dash when a site has no grade yet", () => {
    const html = renderToStaticMarkup(<GradeBadge grade={null} />);
    expect(text(html)).toBe("–");
    expect(html).toContain('title="Not scanned yet"');
  });

  it("names the test level", () => {
    expect(text(renderToStaticMarkup(<LevelBadge level="tight" />))).toBe("Tight test");
    expect(text(renderToStaticMarkup(<LevelBadge level="solid" suffix="" />))).toBe("Solid");
  });
});

describe("Alert", () => {
  it("announces critical alerts and labels the tone for screen readers", () => {
    const html = renderToStaticMarkup(<Alert tone="critical" title="2 critical vulnerabilities" />);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("Critical: 2 critical vulnerabilities");
  });

  it("uses a polite status role for other tones", () => {
    expect(renderToStaticMarkup(<Alert tone="info" title="Note" />)).toContain('role="status"');
  });
});

describe("charts", () => {
  const counts = { critical: 1, high: 1, medium: 2, low: 0, info: 0 };

  it("SeverityBars shows counts with shares that add up", () => {
    const t = text(renderToStaticMarkup(<SeverityBars counts={counts} />));
    expect(t).toContain("Critical 1 · 25%");
    expect(t).toContain("Medium 2 · 50%");
    expect(t).toContain("4 open issues in total");
  });

  it("every chart includes a data table for screen readers", () => {
    const html = renderToStaticMarkup(<SeverityShareBar counts={counts} />);
    expect(html).toContain('<table class="sr-only">');
    expect(html).toContain("<caption>Open issues by severity</caption>");
  });

  it("SeverityShareBar handles the no-issues case", () => {
    const zero = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    expect(text(renderToStaticMarkup(<SeverityShareBar counts={zero} />))).toBe("No open issues across your sites.");
  });
});
