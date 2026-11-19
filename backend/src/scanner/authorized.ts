/**
 * Hosts that may be scanned without file/DNS ownership verification.
 *
 * 1. PUBLIC_TEST_TARGETS: sites whose operators publish them specifically so that security
 *    scanners can be tested against them. Only add a site here if its owner explicitly invites
 *    automated security scanning — a site meant for UI/API test practice does not qualify.
 * 2. SCAN_AUTHORIZED_HOSTS (env): hosts the person running SiteGuard has written permission to
 *    test (e.g. a client engagement). Comma-separated; "*.example.com" matches subdomains.
 */
export interface TestTarget {
  host: string;
  url: string;
  name: string;
  owner: string;
  description: string;
}

export const PUBLIC_TEST_TARGETS: TestTarget[] = [
  {
    host: "testphp.vulnweb.com", url: "http://testphp.vulnweb.com", name: "Acunetix test site (PHP)", owner: "Acunetix / Invicti",
    description: "Deliberately vulnerable PHP shop published for testing web vulnerability scanners.",
  },
  {
    host: "testhtml5.vulnweb.com", url: "http://testhtml5.vulnweb.com", name: "Acunetix test site (HTML5)", owner: "Acunetix / Invicti",
    description: "Deliberately vulnerable single-page app published for testing scanners.",
  },
  {
    host: "testasp.vulnweb.com", url: "http://testasp.vulnweb.com", name: "Acunetix test site (ASP)", owner: "Acunetix / Invicti",
    description: "Deliberately vulnerable classic ASP forum published for testing scanners.",
  },
  {
    host: "public-firing-range.appspot.com", url: "https://public-firing-range.appspot.com", name: "Google Firing Range", owner: "Google",
    description: "Test bed for web application security scanners, with known XSS and other flaws.",
  },
  {
    host: "badssl.com", url: "https://badssl.com", name: "badssl.com", owner: "badssl.com project",
    description: "Subdomains with intentionally broken TLS (expired.badssl.com, self-signed.badssl.com…) for testing TLS checks.",
  },
];

function matches(pattern: string, hostname: string) {
  const p = pattern.trim().toLowerCase();
  if (!p) return false;
  if (p.startsWith("*.")) return hostname.endsWith(p.slice(1)) || hostname === p.slice(2);
  return hostname === p;
}

export type Preauthorization = { via: "test-target" | "authorized-host"; detail: string };

/** Whether a host may be scanned without the owner placing a file or DNS record. */
export function preauthorization(hostname: string): Preauthorization | null {
  const host = hostname.toLowerCase();
  const target = PUBLIC_TEST_TARGETS.find((t) => host === t.host || (t.host === "badssl.com" && host.endsWith(".badssl.com")));
  if (target) return { via: "test-target", detail: `${target.name} is a public test site that invites security scanning` };

  const allowed = (process.env.SCAN_AUTHORIZED_HOSTS ?? "").split(",");
  if (allowed.some((p) => matches(p, host))) {
    return { via: "authorized-host", detail: "Listed in SCAN_AUTHORIZED_HOSTS by the SiteGuard administrator" };
  }
  return null;
}
