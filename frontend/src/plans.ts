import type { ScanLevel } from "./api";

/**
 * Test plans shown on the Dashboard and in the Security page's test picker.
 * Prices are placeholders: change them here. Billing is not connected, so every level can be run.
 */
export interface Plan {
  level: ScanLevel;
  name: string;
  price: number;
  currency: string;
  period: string;
  tagline: string;
  /** What this level checks, beyond the levels below it. */
  checks: string[];
  highlight?: boolean;
}

export const PLANS: Plan[] = [
  {
    level: "free",
    name: "Free",
    price: 0,
    currency: "$",
    period: "forever",
    tagline: "Quick security check",
    checks: ["HTTPS & HTTP→HTTPS redirect", "TLS certificate validity & expiry", "Security headers (CSP, HSTS, clickjacking…)", "Cookie flags"],
  },
  {
    level: "solid",
    name: "Solid",
    price: 19,
    currency: "$",
    period: "per month",
    tagline: "Standard test for live sites",
    checks: ["Everything in Free", "Outdated TLS versions", "CORS misconfiguration", "Vulnerable JavaScript libraries", "Mixed content & insecure forms", "Version leaks & security.txt", "Performance analysis"],
    highlight: true,
  },
  {
    level: "tight",
    name: "Tight",
    price: 49,
    currency: "$",
    period: "per month",
    tagline: "Full, in-depth test",
    checks: ["Everything in Solid", "Probing for exposed secrets (.env, .git, backups, database dumps)", "Admin & debug pages (phpinfo, server-status)", "Email spoofing protection (SPF & DMARC)"],
  },
];

export const PLAN: Record<ScanLevel, Plan> = Object.fromEntries(PLANS.map((p) => [p.level, p])) as Record<ScanLevel, Plan>;

export const priceLabel = (p: Plan) => (p.price === 0 ? "Free" : `${p.currency}${p.price}`);
