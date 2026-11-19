export type TermCategory = "Scores" | "Encryption" | "Browser protections" | "Attacks" | "Exposure" | "Email" | "Performance" | "SiteGuard";

export interface Term {
  id: string;
  term: string;
  aka?: string;
  category: TermCategory;
  definition: string;
  why: string;
}

export const TERM_CATEGORIES: TermCategory[] = ["Scores", "Encryption", "Browser protections", "Attacks", "Exposure", "Email", "Performance", "SiteGuard"];

export const GLOSSARY: Term[] = [
  // ---- scores
  { id: "security-score", term: "Security score", category: "Scores",
    definition: "A number from 0 to 100% for each scan. Every site starts at 100 and loses points for each failed check: critical −40, high −20, medium −10, low −4. Info findings cost nothing.",
    why: "One number lets you compare sites and see whether a site is getting safer over time." },
  { id: "grade", term: "Grade (A–F)", category: "Scores",
    definition: "A letter derived from the security score: A is 90%+, B 80%+, C 70%+, D 60%+, F below 60%. Any critical finding means an F regardless of the score.",
    why: "A critical issue such as an exposed password file is serious enough on its own to fail a site." },
  { id: "severity", term: "Severity", aka: "Critical, High, Medium, Low, Info", category: "Scores",
    definition: "How dangerous a finding is. Critical: can be exploited right now to steal data. High: a serious weakness. Medium: makes attacks easier. Low: hardening advice. Info: optional good practice.",
    why: "Severity tells you what to fix first. Work from critical down." },
  { id: "vulnerability", term: "Vulnerability", category: "Scores",
    definition: "A weakness in a website, its configuration or its software that an attacker could use to do something they shouldn't, such as read data or take over accounts.",
    why: "Not every weakness is exploitable today, but each one widens the paths an attacker can take." },
  { id: "cve", term: "CVE", aka: "Common Vulnerabilities and Exposures", category: "Scores",
    definition: "A public ID (e.g. CVE-2020-11022) given to a specific, known vulnerability in a piece of software.",
    why: "If a library you use has a CVE, attackers already know how to exploit it. Upgrade to a fixed version." },

  // ---- encryption
  { id: "https", term: "HTTPS", category: "Encryption",
    definition: "HTTP sent over an encrypted TLS connection. The padlock in the browser's address bar shows the site uses HTTPS.",
    why: "Without HTTPS, anyone on the same Wi-Fi or network path can read passwords and change what visitors see." },
  { id: "tls", term: "TLS", aka: "Transport Layer Security (formerly SSL)", category: "Encryption",
    definition: "The encryption protocol behind HTTPS. Versions 1.2 and 1.3 are current; 1.0 and 1.1 are deprecated because of known weaknesses.",
    why: "Servers that still accept TLS 1.0/1.1 can be pushed into using weaker encryption." },
  { id: "tls-certificate", term: "TLS certificate", category: "Encryption",
    definition: "A file, signed by a trusted certificate authority, that proves a server really is the website it claims to be. Certificates expire and must be renewed.",
    why: "An expired or untrusted certificate makes browsers show a full-page warning, and most visitors leave." },
  { id: "hsts", term: "HSTS", aka: "Strict-Transport-Security header", category: "Encryption",
    definition: "A response header telling browsers to only ever connect to the site over HTTPS for a set period (max-age).",
    why: "Stops 'SSL stripping', where an attacker downgrades a visitor's first visit to plain HTTP." },
  { id: "mixed-content", term: "Mixed content", category: "Encryption",
    definition: "An HTTPS page that loads scripts, styles or frames over plain HTTP.",
    why: "Those files can be swapped by an attacker in transit, which hands them control of the page. Browsers usually block them, breaking the site." },

  // ---- browser protections
  { id: "csp", term: "Content Security Policy", aka: "CSP", category: "Browser protections",
    definition: "A response header listing where the page may load scripts, styles, images and frames from. 'unsafe-inline' and 'unsafe-eval' weaken it a lot.",
    why: "A good CSP is the strongest browser-side defence against cross-site scripting (XSS)." },
  { id: "clickjacking", term: "Clickjacking", category: "Browser protections",
    definition: "Loading your page inside an invisible frame on another site so visitors unknowingly click your buttons. Prevented by CSP frame-ancestors or X-Frame-Options.",
    why: "Can trick logged-in users into changing settings, making payments or granting permissions." },
  { id: "mime-sniffing", term: "MIME sniffing", aka: "X-Content-Type-Options: nosniff", category: "Browser protections",
    definition: "Browsers guessing a file's type from its content instead of trusting the Content-Type header. The nosniff header turns this off.",
    why: "Without it, an uploaded file that looks like text could be run as a script." },
  { id: "referrer-policy", term: "Referrer-Policy", category: "Browser protections",
    definition: "A header controlling how much of the current URL is sent to other sites in the Referer header when a visitor clicks a link or loads a resource.",
    why: "Full URLs can contain tokens, emails or record IDs that should not leak to third parties." },
  { id: "permissions-policy", term: "Permissions-Policy", category: "Browser protections",
    definition: "A header that switches off browser features (camera, microphone, geolocation…) the site doesn't use, for the page and any embedded frames.",
    why: "Limits what a compromised script or third-party widget can do." },
  { id: "cookie-flags", term: "Cookie flags", aka: "Secure, HttpOnly, SameSite", category: "Browser protections",
    definition: "Secure: cookie only sent over HTTPS. HttpOnly: JavaScript can't read it. SameSite: cookie not sent on most cross-site requests.",
    why: "Together they protect login sessions from being intercepted, stolen by XSS or abused by CSRF." },
  { id: "cors", term: "CORS", aka: "Cross-Origin Resource Sharing", category: "Browser protections",
    definition: "Headers that tell browsers which other websites may read responses from your site. 'Reflecting' any origin, especially with credentials, effectively disables this protection.",
    why: "A loose CORS policy lets any website a user visits read their private data from your site." },

  // ---- attacks
  { id: "xss", term: "Cross-site scripting", aka: "XSS", category: "Attacks",
    definition: "Getting malicious JavaScript to run on a trusted site, usually by injecting it through input that the site displays without escaping.",
    why: "Injected scripts can steal sessions, capture passwords as they are typed, or act as the user." },
  { id: "csrf", term: "Cross-site request forgery", aka: "CSRF", category: "Attacks",
    definition: "Tricking a logged-in user's browser into sending an unwanted request (e.g. 'change email') to a site where they have a session.",
    why: "SameSite cookies and CSRF tokens stop the browser from sending the session along with forged requests." },
  { id: "phishing", term: "Email spoofing & phishing", category: "Attacks",
    definition: "Sending email that pretends to come from your domain to trick people into clicking links or sharing information.",
    why: "SPF and DMARC let receiving mail servers detect and reject mail that falsely uses your domain." },
  { id: "ssrf", term: "SSRF", aka: "Server-side request forgery", category: "Attacks",
    definition: "Making a server send requests on an attacker's behalf, often to internal systems that aren't reachable from the internet.",
    why: "This is why SiteGuard refuses to scan localhost and private IP addresses." },

  // ---- exposure
  { id: "sensitive-files", term: "Sensitive file exposure", category: "Exposure",
    definition: "Files that should never be public, such as .env (secrets), .git (source code history), database dumps and config backups, being downloadable from the web server.",
    why: "These often contain passwords and API keys. Treat any exposed secret as stolen and rotate it." },
  { id: "information-disclosure", term: "Information disclosure", category: "Exposure",
    definition: "The site revealing details about its internals, such as exact server or CMS version numbers in headers or meta tags.",
    why: "Version numbers let attackers look up exactly which known vulnerabilities apply to you." },
  { id: "directory-listing", term: "Directory listing", category: "Exposure",
    definition: "The web server showing an 'Index of /' page listing every file in a folder when there is no index page.",
    why: "Exposes files that were never meant to be linked, like backups and uploads." },
  { id: "vulnerable-components", term: "Vulnerable components", aka: "Outdated libraries", category: "Exposure",
    definition: "Third-party code (e.g. jQuery, Bootstrap, Lodash) in a version with publicly known vulnerabilities, or a framework that no longer gets security fixes.",
    why: "Known flaws come with ready-made exploits. Keeping dependencies updated closes them." },

  // ---- email
  { id: "spf", term: "SPF", aka: "Sender Policy Framework", category: "Email",
    definition: "A DNS TXT record listing the servers allowed to send email for your domain. '-all' means reject everyone else; '+all' allows anyone.",
    why: "Without SPF, receiving servers can't tell real mail from forgeries." },
  { id: "dmarc", term: "DMARC", category: "Email",
    definition: "A DNS record (at _dmarc.yourdomain) telling receiving servers what to do with mail that fails SPF/DKIM checks: none, quarantine or reject, and where to send reports.",
    why: "p=quarantine or p=reject actually stops spoofed mail; p=none only reports it." },

  // ---- performance
  { id: "ttfb", term: "Server response time", aka: "TTFB, time to first byte", category: "Performance",
    definition: "How long it takes from sending the request until the first byte of the response arrives, including any redirects. Under 400 ms is good.",
    why: "Nothing can appear on screen until the server responds, so slow servers make every page feel slow." },
  { id: "download-time", term: "Page download time", category: "Performance",
    definition: "Total time to download the page's HTML, measured from SiteGuard's server. It doesn't include images, scripts or rendering in the visitor's browser.",
    why: "A useful trend line: if it suddenly grows, something changed on the server or the page got heavier." },
  { id: "compression", term: "Compression", aka: "gzip, Brotli", category: "Performance",
    definition: "The server shrinking text responses (HTML, CSS, JavaScript) before sending them; the browser unpacks them. Typically saves 60–80% of the size.",
    why: "Smaller responses arrive faster, especially on mobile connections." },
  { id: "caching", term: "Caching", aka: "Cache-Control", category: "Performance",
    definition: "Rules that let browsers and CDNs keep a copy of a response and reuse it instead of downloading it again.",
    why: "Good caching makes repeat visits nearly instant and reduces server load." },
  { id: "redirect-chain", term: "Redirect chain", category: "Performance",
    definition: "Several redirects in a row before the real page loads, e.g. http://site → https://site → https://www.site.",
    why: "Each hop is another round-trip before anything can load." },
  { id: "render-blocking", term: "Render-blocking scripts", category: "Performance",
    definition: "Scripts in the page's <head> without async or defer. The browser stops drawing the page until each one downloads and runs.",
    why: "Visitors stare at a blank screen for longer. Adding defer usually fixes it." },
  { id: "cdn", term: "CDN", aka: "Content delivery network", category: "Performance",
    definition: "A network of servers around the world that keep copies of your site close to visitors.",
    why: "Cuts response times for distant visitors and absorbs traffic spikes and some attacks." },

  // ---- SiteGuard
  { id: "ownership-verification", term: "Ownership verification", category: "SiteGuard",
    definition: "Proving you control a site by placing a token in a file on the site or in a DNS TXT record, before SiteGuard will scan it.",
    why: "Scanning sites without permission can be illegal. Verification makes sure only owners scan their own sites." },
  { id: "security-txt", term: "security.txt", category: "SiteGuard",
    definition: "A small file at /.well-known/security.txt that tells security researchers how to report vulnerabilities to you (RFC 9116).",
    why: "People who find a problem can tell you privately instead of it going unreported or public." },
  { id: "monitoring", term: "Monitoring", category: "SiteGuard",
    definition: "Automatic re-scans of a verified site every 6, 12, 24 hours or weekly. Each scan is compared with the previous one to show new and fixed issues.",
    why: "Sites change: deployments, plugin updates and expiring certificates can all introduce new problems." },
];

/** Maps a finding or performance check ID to the glossary entry that explains it. */
export function termForFinding(id: string): string | null {
  if (id.startsWith("exposure:")) return "sensitive-files";
  if (id.startsWith("library:")) return "vulnerable-components";
  const map: Record<string, string> = {
    "headers.csp": "csp", "headers.hsts": "hsts", "headers.framing": "clickjacking", "headers.nosniff": "mime-sniffing",
    "headers.referrer": "referrer-policy", "headers.permissions": "permissions-policy",
    "disclosure.headers": "information-disclosure", "disclosure.generator": "information-disclosure", "disclosure.securitytxt": "security-txt",
    "cookies.secure": "cookie-flags", "cookies.httponly": "cookie-flags", "cookies.samesite": "cookie-flags",
    "cors.reflection": "cors", "tls.certificate": "tls-certificate", "tls.legacy": "tls",
    "transport.https": "https", "transport.redirect": "https", "content.form-http": "https", "content.mixed": "mixed-content",
    "content.dirlisting": "directory-listing", "email.spf": "spf", "email.dmarc": "dmarc",
    "perf.ttfb": "ttfb", "perf.load": "download-time", "perf.size": "download-time", "perf.compression": "compression",
    "perf.cache": "caching", "perf.redirects": "redirect-chain", "perf.requests": "render-blocking", "perf.blocking": "render-blocking",
  };
  return map[id] ?? null;
}
