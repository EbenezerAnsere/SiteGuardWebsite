# SiteGuard

Monitor websites you own for security weaknesses: missing security headers, TLS problems, exposed secrets (`.env`, `.git`), vulnerable JavaScript libraries, permissive CORS, insecure cookies, and email-spoofing gaps (SPF/DMARC). Sites are re-scanned on a schedule and each scan shows what is new or fixed since the last one.

## Run locally

```bash
docker compose up -d                 # Postgres on localhost:5433
cd backend && npm run db:migrate && npm run dev   # API on :4000
cd frontend && npm run dev                        # UI on http://localhost:5173
```

## Ownership verification

A site can only be scanned after its owner proves control of it, using either:

- **File:** serve the token at `/.well-known/security-app-verification.txt`
- **DNS:** add a TXT record `security-app-verification=<token>` on the hostname

Scanning localhost and private IP ranges is blocked to prevent the scanner being used against internal networks. For local testing only, set `SCAN_ALLOW_PRIVATE_TARGETS=true` in `backend/.env`.

## What is checked

| Area | Checks |
| --- | --- |
| Transport | HTTPS, HTTP→HTTPS redirect |
| TLS | Certificate expiry and trust, TLS 1.0/1.1 still accepted |
| Headers | HSTS, CSP strength, clickjacking, nosniff, Referrer-Policy, Permissions-Policy, version disclosure |
| Cookies | Secure, HttpOnly, SameSite |
| CORS | Arbitrary origin reflection, with or without credentials |
| Exposed files | `.git`, `.env`, SQL dumps, config backups, `.htpasswd`, `.svn`, `server-status`, phpinfo, `.DS_Store` (content-verified to avoid false positives) |
| Components | Known-vulnerable jQuery, Bootstrap, AngularJS, Lodash; CMS version disclosure |
| Content | Forms posting over HTTP, mixed content, directory listing |
| Email | SPF and DMARC records |
| Performance (separate score) | Server response time, download time, HTML size, compression, Cache-Control, redirect chain, resource count, render-blocking scripts |

Scores start at 100 and lose points per issue (critical 40, high 20, medium 10, low 4). Any critical issue means grade F.
