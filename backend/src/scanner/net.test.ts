import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { serve, type Fixture } from "../test/fixtures.js";
import { assertPublicHost, isBlockedIp, safeFetch, TargetError } from "./net.js";

describe("isBlockedIp (SSRF guard)", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "private 10/8"],
    ["172.16.5.4", "private 172.16/12"],
    ["192.168.1.1", "private 192.168/16"],
    ["169.254.169.254", "cloud metadata / link-local"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "unspecified"],
    ["::1", "IPv6 loopback"],
    ["fd00::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link-local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows public address %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

describe("assertPublicHost", () => {
  afterEach(() => {
    process.env.SCAN_ALLOW_PRIVATE_TARGETS = "true";
  });

  it.each(["127.0.0.1", "localhost", "[::1]", "169.254.169.254"])("refuses %s when private targets are not allowed", async (host) => {
    process.env.SCAN_ALLOW_PRIVATE_TARGETS = "false";
    await expect(assertPublicHost(host)).rejects.toBeInstanceOf(TargetError);
  });

  it("allows private hosts only when explicitly enabled", async () => {
    process.env.SCAN_ALLOW_PRIVATE_TARGETS = "true";
    await expect(assertPublicHost("127.0.0.1")).resolves.toBeUndefined();
  });
});

describe("safeFetch", () => {
  let site: Fixture;
  beforeAll(async () => {
    site = await serve((req, res) => {
      if (req.url === "/start") return res.writeHead(302, { location: "/final" }).end();
      if (req.url === "/loop") return res.writeHead(302, { location: "/loop" }).end();
      if (req.url === "/to-file") return res.writeHead(302, { location: "file:///etc/passwd" }).end();
      if (req.url === "/big") return res.end("x".repeat(50_000));
      res.end("final page");
    });
  });
  afterAll(() => site.close());

  it("follows redirects and reports timing and redirect count", async () => {
    const r = await safeFetch(`${site.url}/start`);
    expect(r.status).toBe(200);
    expect(r.body).toBe("final page");
    expect(r.url).toBe(`${site.url}/final`);
    expect(r.redirects).toBe(1);
    expect(r.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(r.totalMs).toBeGreaterThanOrEqual(r.ttfbMs);
  });

  it("can return the redirect itself instead of following it", async () => {
    const r = await safeFetch(`${site.url}/start`, { follow: false });
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/final");
  });

  it("refuses to follow a redirect to a non-HTTP scheme", async () => {
    await expect(safeFetch(`${site.url}/to-file`)).rejects.toThrow(/Refusing to follow redirect/);
  });

  it("gives up on redirect loops", async () => {
    await expect(safeFetch(`${site.url}/loop`)).rejects.toThrow(/Too many redirects/);
  });

  it("caps the body at exactly maxBytes, even when one network chunk is larger", async () => {
    const r = await safeFetch(`${site.url}/big`, { maxBytes: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.bytes).toBe(1000);
    expect(r.body).toHaveLength(1000);
  });

  it("does not mark a body that exactly fits the limit as truncated", async () => {
    const r = await safeFetch(`${site.url}/big`, { maxBytes: 50_000 });
    expect(r.truncated).toBe(false);
    expect(r.bytes).toBe(50_000);
  });

  it("refuses the local fixture itself when private targets are blocked", async () => {
    process.env.SCAN_ALLOW_PRIVATE_TARGETS = "false";
    try {
      await expect(safeFetch(site.url)).rejects.toThrow(/private or reserved address/);
    } finally {
      process.env.SCAN_ALLOW_PRIVATE_TARGETS = "true";
    }
  });

  it("reports an unreachable host as a TargetError", async () => {
    await expect(safeFetch("http://127.0.0.1:1", { timeoutMs: 3000 })).rejects.toBeInstanceOf(TargetError);
  });
});
