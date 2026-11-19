import dns from "node:dns/promises";
import net from "node:net";
import type { Finding, PerformanceMetrics, ScanLevel, Severity } from "../db/schema.js";
import { safeFetch, type FetchResult } from "./net.js";
import { measurePerformance } from "./performance.js";
import { getTlsInfo, legacyTlsProtocol } from "./tls.js";

type Add = (f: Finding) => void;

const pass = (id: string, category: string, title: string, evidence?: string): Finding => ({
  id, category, title, severity: "info", passed: true, description: "", evidence,
});

/**
 * Runs the checks for a scan level against a site. Each level includes everything below it:
 *  - free:  HTTPS, certificate, security headers, cookies
 *  - solid: + legacy TLS, CORS, page content & vulnerable libraries, security.txt, performance
 *  - tight: + probing for exposed sensitive files, email SPF/DMARC
 * Throws TargetError if the site itself can't be reached.
 */
export async function runChecks(
  targetUrl: string,
  level: ScanLevel = "tight",
): Promise<{ findings: Finding[]; performance: PerformanceMetrics | null }> {
  const findings: Finding[] = [];
  const add: Add = (f) => findings.push(f);
  const solid = level !== "free";
  const tight = level === "tight";

  const main = await safeFetch(targetUrl, { maxBytes: 5_000_000, headers: { "accept-encoding": "br, gzip, deflate" } });
  const performance = solid ? measurePerformance(main) : null;
  const finalUrl = new URL(main.url);
  const isHttps = finalUrl.protocol === "https:";

  const guarded = (name: string, fn: () => Promise<void>) =>
    fn().catch((err: Error) =>
      add({
        id: `error.${name}`, category: "Scanner", title: `${name} check could not complete`, severity: "info",
        passed: false, description: "The scanner could not finish this check, so its result is unknown.",
        evidence: err.message,
      }),
    );

  checkHeaders(main, isHttps, add);
  checkCookies(main, isHttps, add);
  if (solid) checkContent(main, isHttps, add);
  const skip = Promise.resolve();
  await Promise.all([
    guarded("Transport", () => checkTransport(finalUrl, isHttps, add)),
    isHttps ? guarded("TLS", () => checkTls(finalUrl, add, solid)) : skip,
    solid ? guarded("CORS", () => checkCors(finalUrl, add)) : skip,
    solid ? guarded("security.txt", () => checkSecurityTxt(finalUrl.origin, add)) : skip,
    tight ? guarded("Exposed files", () => checkExposedFiles(finalUrl.origin, add)) : skip,
    tight ? guarded("Email DNS", () => checkEmailDns(finalUrl.hostname, add)) : skip,
  ]);
  return { findings, performance };
}

// ---------------------------------------------------------------- transport / TLS

async function checkTransport(finalUrl: URL, isHttps: boolean, add: Add) {
  if (!isHttps) {
    add({
      id: "transport.https", category: "Transport", title: "Site is not served over HTTPS", severity: "high", passed: false,
      description: "Traffic between visitors and the site is unencrypted, so passwords, cookies and page content can be read or changed by anyone on the network path.",
      evidence: `Final URL: ${finalUrl.href}`,
      remediation: "Get a TLS certificate (e.g. free from Let's Encrypt) and serve the site over HTTPS.",
    });
    return;
  }
  add(pass("transport.https", "Transport", "Site is served over HTTPS"));

  const httpUrl = `http://${finalUrl.hostname}/`;
  let res: FetchResult;
  try {
    res = await safeFetch(httpUrl, { follow: false, maxBytes: 1000, timeoutMs: 6000 });
  } catch {
    add(pass("transport.redirect", "Transport", "Plain HTTP is not served", "Port 80 did not respond"));
    return;
  }
  const loc = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && loc && new URL(loc, httpUrl).protocol === "https:") {
    add(pass("transport.redirect", "Transport", "HTTP redirects to HTTPS", `GET ${httpUrl} → ${res.status} ${loc}`));
  } else {
    add({
      id: "transport.redirect", category: "Transport", title: "HTTP does not redirect to HTTPS", severity: "medium", passed: false,
      description: "Visitors who type the address or follow an old http:// link stay on an unencrypted connection.",
      evidence: `GET ${httpUrl} → ${res.status}`,
      remediation: "Return a 301 redirect from every http:// URL to its https:// equivalent.",
    });
  }
}

async function checkTls(finalUrl: URL, add: Add, probeLegacy: boolean) {
  const port = Number(finalUrl.port) || 443;
  const info = await getTlsInfo(finalUrl.hostname, port);
  const days = Math.floor((info.validTo.getTime() - Date.now()) / 86_400_000);
  const evidence = `Issuer: ${info.issuer} · Expires: ${info.validTo.toISOString().slice(0, 10)} (${days} days) · Protocol: ${info.protocol}`;
  const cert = (severity: Severity, title: string, description: string): Finding => ({
    id: "tls.certificate", category: "TLS", title, severity, passed: false, description, evidence,
    remediation: "Renew the certificate and enable automatic renewal (e.g. certbot or your host's managed certificates).",
  });

  if (days < 0) add(cert("critical", "TLS certificate has expired", "Browsers show a full-page security warning and most visitors cannot reach the site."));
  else if (!info.authorized) add({ ...cert("high", "TLS certificate is not trusted", "Browsers will warn visitors, and the connection may be open to interception."), evidence: `${info.authorizationError} · ${evidence}`, remediation: "Use a certificate from a trusted CA that matches the hostname, and serve the full intermediate chain." });
  else if (days < 14) add(cert("medium", `TLS certificate expires in ${days} days`, "The site will become unreachable without warnings when the certificate expires."));
  else if (days < 30) add(cert("low", `TLS certificate expires in ${days} days`, "Renewal is due soon."));
  else add(pass("tls.certificate", "TLS", "TLS certificate is valid", evidence));

  if (!probeLegacy) return;
  const legacy = await legacyTlsProtocol(finalUrl.hostname, port);
  if (legacy) {
    add({
      id: "tls.legacy", category: "TLS", title: `Deprecated protocol ${legacy} is accepted`, severity: "high", passed: false,
      description: "TLS 1.0 and 1.1 have known weaknesses (BEAST, POODLE-style downgrades) and are rejected by PCI DSS and modern browsers.",
      evidence: `Handshake succeeded with ${legacy}`,
      remediation: "Allow only TLS 1.2 and TLS 1.3 in your web server or load balancer.",
    });
  } else {
    add(pass("tls.legacy", "TLS", "Only modern TLS versions are accepted"));
  }
}

// ---------------------------------------------------------------- headers

function parseCsp(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), values);
  }
  return map;
}

function checkHeaders(main: FetchResult, isHttps: boolean, add: Add) {
  const h = main.headers;

  if (isHttps) {
    const hsts = h.get("strict-transport-security");
    const age = Number(/max-age=(\d+)/i.exec(hsts ?? "")?.[1] ?? 0);
    if (!hsts) {
      add({
        id: "headers.hsts", category: "Headers", title: "Strict-Transport-Security header missing", severity: "medium", passed: false,
        description: "Without HSTS, an attacker on the network can downgrade a visitor's first request to plain HTTP (SSL stripping).",
        remediation: "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains",
      });
    } else if (age < 15_552_000) {
      add({
        id: "headers.hsts", category: "Headers", title: "HSTS max-age is too short", severity: "low", passed: false,
        description: "A short max-age means browsers forget the HTTPS-only rule quickly.", evidence: `Strict-Transport-Security: ${hsts}`,
        remediation: "Use max-age of at least 15552000 (180 days); 31536000 is common.",
      });
    } else add(pass("headers.hsts", "Headers", "HSTS is enabled", hsts));
  }

  const csp = h.get("content-security-policy");
  const directives = csp ? parseCsp(csp) : new Map<string, string[]>();
  if (!csp) {
    add({
      id: "headers.csp", category: "Headers", title: "Content-Security-Policy header missing", severity: "medium", passed: false,
      description: "A CSP is the main browser-side defence that limits the damage of cross-site scripting (XSS).",
      remediation: "Start with Content-Security-Policy-Report-Only to find what the site loads, then enforce a policy such as: default-src 'self'; object-src 'none'; frame-ancestors 'self'",
    });
  } else {
    const script = directives.get("script-src") ?? directives.get("default-src");
    const weak: string[] = [];
    if (!script) weak.push("no script-src or default-src, so scripts are unrestricted");
    else {
      const hasNonceOrHash = script.some((v) => /^'(nonce-|sha256-|sha384-|sha512-|strict-dynamic)/.test(v));
      if (script.includes("'unsafe-inline'") && !hasNonceOrHash) weak.push("'unsafe-inline' allows injected inline scripts");
      if (script.includes("'unsafe-eval'")) weak.push("'unsafe-eval' allows eval()");
      if (script.some((v) => v === "*" || v === "https:" || v === "http:" || v === "data:")) weak.push("scripts may load from any host");
    }
    if (weak.length) {
      add({
        id: "headers.csp", category: "Headers", title: "Content-Security-Policy is weak", severity: "low", passed: false,
        description: `The policy does not stop most XSS: ${weak.join("; ")}.`, evidence: `Content-Security-Policy: ${csp}`,
        remediation: "Replace 'unsafe-inline' with nonces or hashes, remove 'unsafe-eval', and list specific script hosts.",
      });
    } else add(pass("headers.csp", "Headers", "Content-Security-Policy is set", csp));
  }

  const xfo = h.get("x-frame-options");
  if (!xfo && !directives.has("frame-ancestors")) {
    add({
      id: "headers.framing", category: "Headers", title: "Site can be embedded in frames (clickjacking)", severity: "medium", passed: false,
      description: "Another site can load this page in an invisible iframe and trick users into clicking buttons on it.",
      remediation: "Add Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: DENY).",
    });
  } else add(pass("headers.framing", "Headers", "Clickjacking protection is set", xfo ? `X-Frame-Options: ${xfo}` : "CSP frame-ancestors"));

  if (h.get("x-content-type-options")?.toLowerCase() !== "nosniff") {
    add({
      id: "headers.nosniff", category: "Headers", title: "X-Content-Type-Options: nosniff missing", severity: "low", passed: false,
      description: "Browsers may guess (sniff) content types, which can turn an uploaded file into executable script.",
      remediation: "Add: X-Content-Type-Options: nosniff",
    });
  } else add(pass("headers.nosniff", "Headers", "MIME sniffing is disabled"));

  const referrer = h.get("referrer-policy");
  if (!referrer || /^(unsafe-url|no-referrer-when-downgrade)$/i.test(referrer.trim())) {
    add({
      id: "headers.referrer", category: "Headers", title: referrer ? "Referrer-Policy leaks full URLs" : "Referrer-Policy header missing", severity: "low", passed: false,
      description: "Full URLs (which can contain tokens or IDs) may be sent to third-party sites in the Referer header.",
      evidence: referrer ? `Referrer-Policy: ${referrer}` : undefined,
      remediation: "Add: Referrer-Policy: strict-origin-when-cross-origin",
    });
  } else add(pass("headers.referrer", "Headers", "Referrer-Policy is set", referrer));

  if (!h.get("permissions-policy")) {
    add({
      id: "headers.permissions", category: "Headers", title: "Permissions-Policy header missing", severity: "info", passed: false,
      description: "Optional hardening: limits which browser features (camera, geolocation…) the page and its iframes can use.",
      remediation: "Add, for example: Permissions-Policy: camera=(), microphone=(), geolocation=()",
    });
  } else add(pass("headers.permissions", "Headers", "Permissions-Policy is set"));

  const leaks = ["server", "x-powered-by", "x-aspnet-version", "x-aspnetmvc-version", "x-generator"]
    .map((name) => [name, h.get(name)] as const)
    .filter(([name, v]) => v && (name !== "server" || /\d/.test(v)));
  if (leaks.length) {
    add({
      id: "disclosure.headers", category: "Information disclosure", title: "Software versions disclosed in headers", severity: "low", passed: false,
      description: "Version numbers let attackers look up known vulnerabilities for the exact software you run.",
      evidence: leaks.map(([n, v]) => `${n}: ${v}`).join("\n"),
      remediation: "Remove X-Powered-By and similar headers and hide version numbers in the Server header (e.g. nginx server_tokens off).",
    });
  } else add(pass("disclosure.headers", "Information disclosure", "No software versions in headers"));
}

// ---------------------------------------------------------------- cookies

function checkCookies(main: FetchResult, isHttps: boolean, add: Add) {
  const cookies = main.headers.getSetCookie();
  if (!cookies.length) return;
  const noSecure: string[] = [], noHttpOnly: string[] = [], noSameSite: string[] = [];
  for (const raw of cookies) {
    const [pair, ...attrs] = raw.split(";");
    const name = pair.split("=")[0].trim();
    const a = attrs.map((s) => s.trim().toLowerCase());
    if (isHttps && !a.includes("secure")) noSecure.push(name);
    if (!a.includes("httponly")) noHttpOnly.push(name);
    if (!a.some((x) => x.startsWith("samesite="))) noSameSite.push(name);
  }
  const fail = (id: string, title: string, severity: Severity, names: string[], description: string, remediation: string) =>
    names.length
      ? add({ id, category: "Cookies", title, severity, passed: false, description, evidence: `Cookies: ${names.join(", ")}`, remediation })
      : add(pass(id, "Cookies", title.replace(/ without .*/, " flags are set")));
  if (isHttps) fail("cookies.secure", "Cookies set without Secure flag", "medium", noSecure,
    "These cookies can also be sent over plain HTTP, where they can be intercepted.", "Add the Secure attribute to every cookie.");
  fail("cookies.httponly", "Cookies set without HttpOnly flag", "low", noHttpOnly,
    "JavaScript can read these cookies, so an XSS bug could steal them. This matters most for session cookies.", "Add HttpOnly to any cookie that JavaScript does not need to read (always for session cookies).");
  fail("cookies.samesite", "Cookies set without SameSite attribute", "low", noSameSite,
    "Without an explicit SameSite value, cookies may be sent on cross-site requests, which helps CSRF attacks.", "Add SameSite=Lax (or Strict) to cookies.");
}

// ---------------------------------------------------------------- CORS

async function checkCors(finalUrl: URL, add: Add) {
  const probe = "https://cors-probe.invalid";
  const res = await safeFetch(finalUrl.href, { headers: { origin: probe }, maxBytes: 1000 });
  const acao = res.headers.get("access-control-allow-origin");
  const creds = res.headers.get("access-control-allow-credentials")?.toLowerCase() === "true";
  if (acao === probe || acao === "null") {
    add({
      id: "cors.reflection", category: "CORS", title: creds ? "CORS allows any origin with credentials" : "CORS reflects any origin",
      severity: creds ? "high" : "medium", passed: false,
      description: creds
        ? "Any website a logged-in user visits can read responses from this site using their cookies, exposing private data."
        : "Any website can read responses from this site from a visitor's browser.",
      evidence: `Origin: ${probe}\n→ Access-Control-Allow-Origin: ${acao}${creds ? "\n→ Access-Control-Allow-Credentials: true" : ""}`,
      remediation: "Only return Access-Control-Allow-Origin for an explicit allow-list of trusted origins.",
    });
  } else add(pass("cors.reflection", "CORS", "CORS does not trust arbitrary origins", `Access-Control-Allow-Origin: ${acao ?? "(not set)"}`));
}

// ---------------------------------------------------------------- exposed files

interface Probe {
  path: string;
  title: string;
  severity: Severity;
  description: string;
  remediation: string;
  matches: (r: FetchResult) => boolean;
}

const isHtml = (r: FetchResult) =>
  (r.headers.get("content-type") ?? "").includes("text/html") || /^\s*<(!doctype|html)/i.test(r.body);

const SECRETS_REMEDIATION = "Block the path in your web server config, remove the file from the web root, and rotate any credentials it contained.";
const isPhpInfo = (r: FetchResult) => /<title>\s*phpinfo\(\)\s*<\/title>/i.test(r.body) || (r.body.includes("PHP Version") && r.body.includes("PHP License"));

const PROBES: Probe[] = [
  { path: "/.git/HEAD", title: "Git repository is publicly accessible", severity: "critical",
    description: "Attackers can download your source code and full commit history, including any secrets ever committed.",
    remediation: SECRETS_REMEDIATION, matches: (r) => /^(ref: refs\/|[0-9a-f]{40}$)/.test(r.body.trim()) },
  { path: "/.env", title: "Environment file (.env) is publicly accessible", severity: "critical",
    description: ".env files usually hold database passwords, API keys and signing secrets.",
    remediation: SECRETS_REMEDIATION, matches: (r) => !isHtml(r) && /^[A-Z][A-Z0-9_]*=/m.test(r.body) },
  { path: "/backup.sql", title: "Database dump is publicly accessible", severity: "critical",
    description: "A downloadable database backup can expose every user record and password hash.",
    remediation: SECRETS_REMEDIATION, matches: (r) => !isHtml(r) && /(CREATE TABLE|INSERT INTO)/i.test(r.body) },
  { path: "/dump.sql", title: "Database dump is publicly accessible", severity: "critical",
    description: "A downloadable database backup can expose every user record and password hash.",
    remediation: SECRETS_REMEDIATION, matches: (r) => !isHtml(r) && /(CREATE TABLE|INSERT INTO)/i.test(r.body) },
  { path: "/wp-config.php.bak", title: "WordPress config backup is publicly accessible", severity: "critical",
    description: "The backup is served as plain text, revealing database credentials and auth salts.",
    remediation: SECRETS_REMEDIATION, matches: (r) => r.body.includes("DB_PASSWORD") },
  { path: "/.htpasswd", title: ".htpasswd file is publicly accessible", severity: "high",
    description: "Password hashes can be downloaded and cracked offline.",
    remediation: SECRETS_REMEDIATION, matches: (r) => !isHtml(r) && /^[^:\s]+:\S{8,}$/m.test(r.body) },
  { path: "/.svn/entries", title: "Subversion metadata is publicly accessible", severity: "high",
    description: "SVN metadata can be used to reconstruct source code.",
    remediation: SECRETS_REMEDIATION, matches: (r) => !isHtml(r) && /^\d+\s*$/.test(r.body.split("\n")[0]) },
  { path: "/server-status", title: "Apache server-status page is public", severity: "medium",
    description: "Shows live requests, client IPs and internal URLs.",
    remediation: "Restrict mod_status to localhost or an admin network.", matches: (r) => r.body.includes("Apache Server Status") },
  { path: "/phpinfo.php", title: "phpinfo() page is public", severity: "medium",
    description: "Reveals PHP version, modules, file paths and sometimes environment variables.",
    remediation: "Delete phpinfo files from production.", matches: isPhpInfo },
  { path: "/info.php", title: "phpinfo() page is public", severity: "medium",
    description: "Reveals PHP version, modules, file paths and sometimes environment variables.",
    remediation: "Delete phpinfo files from production.", matches: isPhpInfo },
  { path: "/.DS_Store", title: ".DS_Store file is publicly accessible", severity: "low",
    description: "macOS folder metadata lists file names in the directory, which can reveal hidden files.",
    remediation: "Delete .DS_Store files from the server and block them in your web server config.", matches: (r) => r.body.includes("Bud1") },
];

async function checkExposedFiles(origin: string, add: Add) {
  const hits = await Promise.all(
    PROBES.map(async (p) => {
      try {
        const r = await safeFetch(origin + p.path, { follow: false, maxBytes: 200_000, timeoutMs: 8000 });
        return r.status === 200 && p.matches(r) ? { p, r } : null;
      } catch {
        return null;
      }
    }),
  );
  let found = 0;
  for (const hit of hits) {
    if (!hit) continue;
    found++;
    const { p, r } = hit;
    add({
      id: `exposure:${p.path}`, category: "Exposed files", title: p.title, severity: p.severity, passed: false,
      description: p.description, evidence: `GET ${p.path} → 200 (${r.body.length} bytes, content verified)`, remediation: p.remediation,
    });
  }
  if (!found) add(pass("exposure.none", "Exposed files", "No common sensitive files exposed", `Checked ${PROBES.length} paths`));
}

async function checkSecurityTxt(origin: string, add: Add) {
  const r = await safeFetch(`${origin}/.well-known/security.txt`, { maxBytes: 20_000, timeoutMs: 8000 });
  if (r.status === 200 && /^contact:/im.test(r.body)) {
    add(pass("disclosure.securitytxt", "Disclosure policy", "security.txt is published"));
  } else {
    add({
      id: "disclosure.securitytxt", category: "Disclosure policy", title: "No security.txt file", severity: "info", passed: false,
      description: "security.txt tells researchers how to report vulnerabilities to you (RFC 9116).",
      remediation: "Publish /.well-known/security.txt with at least Contact: and Expires: fields.",
    });
  }
}

// ---------------------------------------------------------------- email DNS

async function txtRecords(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENODATA" || code === "ENOTFOUND") return [];
    throw err;
  }
}

async function checkEmailDns(hostname: string, add: Add) {
  if (net.isIP(hostname) || hostname === "localhost") return;
  const domain = hostname.replace(/^www\./, "");
  const [root, dmarc] = await Promise.all([txtRecords(domain), txtRecords(`_dmarc.${domain}`)]);

  const spf = root.find((r) => /^v=spf1\b/i.test(r));
  if (!spf) {
    add({
      id: "email.spf", category: "Email security", title: `No SPF record for ${domain}`, severity: "low", passed: false,
      description: `Anyone can send email that claims to come from @${domain}, which makes phishing in your name easier.`,
      remediation: `Publish a TXT record on ${domain}, e.g. "v=spf1 include:<your mail provider> -all" (or "v=spf1 -all" if the domain sends no mail).`,
    });
  } else if (/\+all\b/i.test(spf)) {
    add({
      id: "email.spf", category: "Email security", title: "SPF record allows every sender (+all)", severity: "high", passed: false,
      description: "+all authorises every server on the internet to send mail as your domain.", evidence: spf,
      remediation: "Replace +all with -all (or ~all) and list only your real mail servers.",
    });
  } else add(pass("email.spf", "Email security", "SPF record is published", spf));

  const dm = dmarc.find((r) => /^v=DMARC1\b/i.test(r));
  if (!dm) {
    add({
      id: "email.dmarc", category: "Email security", title: `No DMARC record for ${domain}`, severity: "low", passed: false,
      description: "Without DMARC, receiving mail servers have no instruction to reject spoofed mail from your domain.",
      remediation: `Publish a TXT record at _dmarc.${domain}, e.g. "v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}".`,
    });
  } else if (/\bp=none\b/i.test(dm)) {
    add({
      id: "email.dmarc", category: "Email security", title: "DMARC policy is monitor-only (p=none)", severity: "low", passed: false,
      description: "Spoofed mail is reported but still delivered.", evidence: dm,
      remediation: "After reviewing reports, move to p=quarantine and then p=reject.",
    });
  } else add(pass("email.dmarc", "Email security", "DMARC is enforced", dm));
}

// ---------------------------------------------------------------- page content

function versionLt(a: string, b: string): boolean {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

interface LibRule {
  key: string;
  name: string;
  patterns: RegExp[];
  vulnerable: (v: string) => boolean;
  advisory: string;
  fixed: string;
}

const LIBS: LibRule[] = [
  { key: "jquery", name: "jQuery",
    patterns: [/jquery[-.]?(\d+\.\d+\.\d+)(?:\.slim)?(?:\.min)?\.js/i, /jquery@(\d+\.\d+\.\d+)/i, /jquery\/(\d+\.\d+\.\d+)\//i],
    vulnerable: (v) => versionLt(v, "3.5.0"), advisory: "CVE-2020-11022 / CVE-2020-11023: XSS when passing HTML to jQuery DOM methods", fixed: "3.5.0" },
  { key: "bootstrap", name: "Bootstrap",
    patterns: [/bootstrap@(\d+\.\d+\.\d+)/i, /bootstrap\/(\d+\.\d+\.\d+)\//i, /bootstrap[-.](\d+\.\d+\.\d+)(?:\.min)?\.(?:js|css)/i],
    vulnerable: (v) => versionLt(v, "3.4.1") || (!versionLt(v, "4.0.0") && versionLt(v, "4.3.1")),
    advisory: "CVE-2019-8331: XSS in tooltip/popover data-template", fixed: "3.4.1 / 4.3.1" },
  { key: "angularjs", name: "AngularJS",
    patterns: [/angular(?:js)?@(1\.\d+\.\d+)/i, /angular\.js\/(1\.\d+\.\d+)\//i, /angularjs\/(1\.\d+\.\d+)\//i],
    vulnerable: () => true, advisory: "AngularJS (1.x) reached end of life in January 2022 and receives no security fixes", fixed: "a supported framework" },
  { key: "lodash", name: "Lodash",
    patterns: [/lodash@(\d+\.\d+\.\d+)/i, /lodash\.js\/(\d+\.\d+\.\d+)\//i],
    vulnerable: (v) => versionLt(v, "4.17.21"), advisory: "CVE-2021-23337: command injection via template(); CVE-2020-8203: prototype pollution", fixed: "4.17.21" },
];

function checkContent(main: FetchResult, isHttps: boolean, add: Add) {
  if (!isHtml(main)) return;
  const html = main.body;

  if (/<form\b[^>]*\baction\s*=\s*["']http:\/\//i.test(html)) {
    add({
      id: "content.form-http", category: "Content", title: "Form submits data over plain HTTP", severity: "high", passed: false,
      description: "Anything typed into this form (including passwords) is sent unencrypted.",
      remediation: "Change the form action to an https:// URL (or a relative URL).",
    });
  }

  if (isHttps) {
    const active = [
      ...[...html.matchAll(/<(?:script|iframe)\b[^>]*\bsrc\s*=\s*["'](http:\/\/[^"']+)/gi)].map((m) => m[1]),
      ...[...html.matchAll(/<link\b[^>]*>/gi)]
        .filter((m) => /rel\s*=\s*["']?stylesheet/i.test(m[0]))
        .map((m) => /href\s*=\s*["'](http:\/\/[^"']+)/i.exec(m[0])?.[1])
        .filter((u): u is string => !!u),
    ];
    if (active.length) {
      add({
        id: "content.mixed", category: "Content", title: "Scripts or styles loaded over HTTP (mixed content)", severity: "medium", passed: false,
        description: "An attacker on the network can replace these files and take over the page. Browsers usually block them, breaking the site.",
        evidence: active.slice(0, 5).join("\n"), remediation: "Load every script, stylesheet and iframe over https://.",
      });
    } else add(pass("content.mixed", "Content", "No mixed active content"));
  }

  if (/<title>\s*Index of \//i.test(html)) {
    add({
      id: "content.dirlisting", category: "Content", title: "Directory listing is enabled", severity: "medium", passed: false,
      description: "Visitors can browse every file in the directory, including ones not meant to be linked.",
      remediation: "Disable autoindex (nginx) or Options -Indexes (Apache).",
    });
  }

  const detected: string[] = [];
  for (const lib of LIBS) {
    const version = lib.patterns.map((p) => p.exec(html)?.[1]).find(Boolean);
    if (!version) continue;
    detected.push(`${lib.name} ${version}`);
    if (lib.vulnerable(version)) {
      add({
        id: `library:${lib.key}`, category: "Vulnerable components", title: `Vulnerable ${lib.name} ${version}`, severity: "medium", passed: false,
        description: lib.advisory, evidence: `Detected ${lib.name} ${version} in page source`, remediation: `Upgrade to ${lib.fixed} or later.`,
      });
    }
  }
  if (detected.length) add(pass("library.inventory", "Vulnerable components", "JavaScript libraries detected", detected.join(", ")));

  const generator =
    /<meta[^>]+name\s*=\s*["']generator["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ??
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']generator["']/i.exec(html)?.[1];
  if (generator && /\d/.test(generator)) {
    add({
      id: "disclosure.generator", category: "Information disclosure", title: "CMS/platform version disclosed", severity: "low", passed: false,
      description: "The generator meta tag tells attackers which version to target. Make sure this version is fully patched.",
      evidence: `<meta name="generator" content="${generator}">`,
      remediation: "Keep the platform updated and remove the version from the generator tag.",
    });
  }
}
