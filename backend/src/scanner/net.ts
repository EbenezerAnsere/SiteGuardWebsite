import dns from "node:dns/promises";
import net from "node:net";

/** An error whose message is safe to show to the user (e.g. "host unreachable"). */
export class TargetError extends Error {}

const UA = "SecurityAppScanner/1.0 (+authorized security scan)";

// Private, loopback, link-local and other reserved ranges. Blocking these stops the
// scanner from being used to probe internal infrastructure (SSRF).
const blocked = new net.BlockList();
const v4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const v6: [string, number][] = [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]];
for (const [a, p] of v4) blocked.addSubnet(a, p, "ipv4");
for (const [a, p] of v6) blocked.addSubnet(a, p, "ipv6");

export function isBlockedIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(ip, net.isIPv6(ip) ? "ipv6" : "ipv4");
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (process.env.SCAN_ALLOW_PRIVATE_TARGETS === "true") return;
  const host = hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new TargetError(`Could not resolve ${host}`);
    }
  }
  if (addresses.length === 0) throw new TargetError(`Could not resolve ${host}`);
  const bad = addresses.find(isBlockedIp);
  if (bad) {
    throw new TargetError(`${host} resolves to a private or reserved address (${bad}); scanning it is blocked`);
  }
}

export interface FetchResult {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  /** Decoded body size in bytes (capped at maxBytes). */
  bytes: number;
  truncated: boolean;
  redirects: number;
  /** Time from the first request to the final response's headers, including redirects. */
  ttfbMs: number;
  /** Time until the body was fully read. */
  totalMs: number;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  follow?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

/** fetch() that checks every hop (including redirects) against the private-address blocklist. */
export async function safeFetch(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const { follow = true, maxBytes = 1_000_000, timeoutMs = 10_000 } = opts;
  let current = new URL(url);
  const started = performance.now();
  for (let hop = 0; hop <= 5; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new TargetError(`Refusing to follow redirect to ${current.protocol} URL`);
    }
    await assertPublicHost(current.hostname);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": UA, ...opts.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name;
      throw new TargetError(`Could not connect to ${current.origin} (${cause})`);
    }
    const location = res.headers.get("location");
    if (follow && res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    const ttfbMs = Math.round(performance.now() - started);
    const { text, bytes, truncated } = await readLimited(res, maxBytes);
    return {
      url: current.href, status: res.status, headers: res.headers, body: text, bytes, truncated,
      redirects: hop, ttfbMs, totalMs: Math.round(performance.now() - started),
    };
  }
  throw new TargetError("Too many redirects");
}

async function readLimited(res: Response, maxBytes: number) {
  if (!res.body) return { text: "", bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // A single network chunk can be larger than the remaining budget: keep only what fits,
      // so the body (and the reported size) never exceeds maxBytes.
      const room = maxBytes - total;
      if (value.byteLength >= room) {
        if (room > 0) chunks.push(value.subarray(0, room));
        total += Math.max(room, 0);
        truncated = value.byteLength > room || !(await reader.read()).done;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { text: Buffer.concat(chunks).toString("utf8"), bytes: total, truncated };
}
