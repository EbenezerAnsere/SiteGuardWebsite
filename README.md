# SiteGuard

Monitor websites you own for security weaknesses: missing security headers, TLS problems, exposed secrets (`.env`, `.git`), vulnerable JavaScript libraries, permissive CORS, insecure cookies, and email-spoofing gaps (SPF/DMARC). Sites are re-scanned on a schedule and each scan shows what is new or fixed since the last one.

## Run locally

```bash
docker compose up -d                 # Postgres on localhost:5433
cd backend && npm run db:migrate && npm run dev   # API on :4000
cd frontend && npm run dev                        # UI on http://localhost:5173
```

## Build and test

Requires Node.js 22 or newer. From the project root:

```bash
npm run install:all   # npm ci in backend/ and frontend/
npm run verify        # Node check → typecheck → lint → migrations check → tests → build
```

Individual steps: `npm run typecheck`, `npm run lint` (zero warnings allowed), `npm run db:check`, `npm test`, `npm run test:ci` (adds JUnit + coverage reports), `npm run build` (outputs `backend/dist` and `frontend/dist`).

Tests use Vitest. The backend tests run the real scanner against local fixture websites (no internet needed); backend coverage must stay above the thresholds in `backend/vitest.config.ts`.

## Continuous integration (Jenkins)

The `Jenkinsfile` runs on any Linux, macOS or Windows agent:

| Stage | What it does |
| --- | --- |
| Environment | Uses the agent's Node.js 22+; on Linux agents without it, downloads the Node.js release in the `NODE_VERSION` parameter, verifies its SHA-256 checksum and caches it in `.tools/` |
| Install | `npm ci` for backend and frontend (in parallel) |
| Static checks | Typechecks, lint, Drizzle migration check |
| Test | Backend and frontend tests with JUnit and Cobertura coverage reports |
| Build | Backend TypeScript build and frontend Vite build |
| Dependency audit | `npm audit` of production dependencies; high/critical findings mark the build UNSTABLE |
| Package | Archives `backend/dist`, migrations, `frontend/dist` and `build-info.txt` |
| Results (always) | Publishes test results (build description shows the pass/fail count), coverage (chart if the Coverage plugin is installed) and the HTML reports |

Required plugins: Pipeline, Git, JUnit. Optional: Coverage.

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
