import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, inArray } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { SCAN_LEVELS, scans, sites } from "../db/schema.js";
import { HttpError, idParam, requireAuth } from "../lib/http.js";
import { startScan } from "../scanner/runner.js";
import { dnsRecordValue, verifyOwnership, VERIFY_FILE_PATH } from "../scanner/verify.js";
import { preauthorization, PUBLIC_TEST_TARGETS } from "../scanner/authorized.js";

export const sitesRouter = Router();
sitesRouter.use(requireAuth);

const MAX_SITES = 25;
const siteName = z.string().trim().max(60, "Name must be 60 characters or fewer");
const SCAN_COOLDOWN_MS = 60_000;

const scanListColumns = {
  id: scans.id,
  siteId: scans.siteId,
  status: scans.status,
  trigger: scans.trigger,
  level: scans.level,
  score: scans.score,
  grade: scans.grade,
  summary: scans.summary,
  performance: scans.performance,
  error: scans.error,
  startedAt: scans.startedAt,
  finishedAt: scans.finishedAt,
  createdAt: scans.createdAt,
};

function normalizeUrl(input: string): URL {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new HttpError(400, "Enter a valid website address, e.g. https://example.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "Only http and https sites can be scanned");
  if (url.username || url.password) throw new HttpError(400, "URLs with credentials are not allowed");
  return url;
}

async function getOwnedSite(userId: number, siteId: number) {
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  if (!site) throw new HttpError(404, "Site not found");
  return site;
}

function withVerification<T extends { verificationToken: string; hostname: string; url: string }>(site: T) {
  return {
    ...site,
    verification: {
      filePath: VERIFY_FILE_PATH,
      fileUrl: site.url + VERIFY_FILE_PATH,
      fileContent: site.verificationToken,
      dnsHost: site.hostname,
      dnsValue: dnsRecordValue(site.verificationToken),
    },
  };
}

sitesRouter.get("/", async (_req, res) => {
  const userSites = await db.select().from(sites).where(eq(sites.userId, res.locals.userId)).orderBy(desc(sites.createdAt));
  const ids = userSites.map((s) => s.id);
  const recent = ids.length
    ? await db.select(scanListColumns).from(scans).where(inArray(scans.siteId, ids)).orderBy(desc(scans.createdAt))
    : [];
  res.json({
    sites: userSites.map((s) => {
      const siteScans = recent.filter((r) => r.siteId === s.id);
      return {
        ...s,
        latestScan: siteScans[0] ?? null,
        latestCompleted: siteScans.find((r) => r.status === "completed") ?? null,
      };
    }),
  });
});

sitesRouter.post("/", async (req, res) => {
  const { url: raw, name } = z
    .object({
      url: z.string().trim().min(1, "Enter a website address").max(2048),
      name: siteName.optional(),
    })
    .parse(req.body);
  const url = normalizeUrl(raw);
  const userId: number = res.locals.userId;

  const [{ total }] = await db.select({ total: count() }).from(sites).where(eq(sites.userId, userId));
  if (total >= MAX_SITES) throw new HttpError(400, `You can monitor up to ${MAX_SITES} sites`);
  const [dupe] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.userId, userId), eq(sites.url, url.origin)));
  if (dupe) throw new HttpError(409, "You have already added this site");

  // Public scanner test sites and administrator-authorized hosts skip the ownership step.
  const pre = preauthorization(url.hostname);
  const [site] = await db
    .insert(sites)
    .values({
      userId, url: url.origin, hostname: url.hostname, name: name || null,
      verificationToken: `sa-${randomBytes(16).toString("hex")}`,
      ...(pre ? { verifiedAt: new Date(), verifiedVia: pre.via } : {}),
    })
    .returning();
  res.status(201).json({ site: withVerification(site), preauthorized: pre?.detail ?? null });
});

sitesRouter.get("/:id", async (req, res) => {
  const site = await getOwnedSite(res.locals.userId, idParam(req.params.id));
  const history = await db.select(scanListColumns).from(scans).where(eq(scans.siteId, site.id)).orderBy(desc(scans.createdAt)).limit(50);
  res.json({ site: withVerification(site), scans: history });
});

sitesRouter.patch("/:id", async (req, res) => {
  const site = await getOwnedSite(res.locals.userId, idParam(req.params.id));
  const patch = z
    .object({
      name: siteName.transform((s) => s || null).optional(),
      monitoring: z.boolean().optional(),
      monitorIntervalHours: z.union([z.literal(6), z.literal(12), z.literal(24), z.literal(168)]).optional(),
      scanLevel: z.enum(SCAN_LEVELS).optional(),
    })
    .parse(req.body);
  const [updated] = await db.update(sites).set(patch).where(eq(sites.id, site.id)).returning();
  res.json({ site: withVerification(updated) });
});

sitesRouter.delete("/:id", async (req, res) => {
  const site = await getOwnedSite(res.locals.userId, idParam(req.params.id));
  await db.delete(sites).where(eq(sites.id, site.id));
  res.status(204).end();
});

sitesRouter.post("/:id/verify", async (req, res) => {
  const site = await getOwnedSite(res.locals.userId, idParam(req.params.id));
  const { method } = z.object({ method: z.enum(["file", "dns"]) }).parse(req.body);
  if (site.verifiedAt) return void res.json({ verified: true, detail: "Already verified", site: withVerification(site) });

  // A host may have been authorized by the administrator after the site was added.
  const pre = preauthorization(site.hostname);
  const result = pre ? { ok: true, detail: pre.detail } : await verifyOwnership(site, method);
  if (!result.ok) throw new HttpError(422, result.detail);
  const [updated] = await db
    .update(sites)
    .set({ verifiedAt: new Date(), verifiedVia: pre?.via ?? method })
    .where(eq(sites.id, site.id))
    .returning();
  res.json({ verified: true, detail: result.detail, site: withVerification(updated) });
});

/** Public sites that invite security scanning, offered in the UI for practice. */
export const testTargetsRouter = Router();
testTargetsRouter.use(requireAuth);
testTargetsRouter.get("/", (_req, res) => {
  res.json({ targets: PUBLIC_TEST_TARGETS });
});

sitesRouter.post("/:id/scans", async (req, res) => {
  const { level } = z.object({ level: z.enum(SCAN_LEVELS).optional() }).parse(req.body ?? {});
  const site = await getOwnedSite(res.locals.userId, idParam(req.params.id));
  if (!site.verifiedAt) throw new HttpError(403, "Verify that you own this site before scanning it");

  const [busy] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.siteId, site.id), inArray(scans.status, ["queued", "running"])))
    .limit(1);
  if (busy) throw new HttpError(409, "A scan is already running for this site");
  const [recent] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.siteId, site.id), gt(scans.createdAt, new Date(Date.now() - SCAN_COOLDOWN_MS))))
    .limit(1);
  if (recent) throw new HttpError(429, "Please wait a minute between scans");

  const scan = await startScan(site.id, "manual", level ?? site.scanLevel);
  res.status(202).json({ scan });
});

/** Latest completed scan (with findings) for each of the user's sites. */
export const findingsRouter = Router();
findingsRouter.use(requireAuth);

findingsRouter.get("/", async (_req, res) => {
  const rows = await db
    .selectDistinctOn([scans.siteId], {
      site: { id: sites.id, name: sites.name, hostname: sites.hostname, url: sites.url },
      scan: {
        id: scans.id,
        level: scans.level,
        score: scans.score,
        grade: scans.grade,
        summary: scans.summary,
        findings: scans.findings,
        performance: scans.performance,
        finishedAt: scans.finishedAt,
      },
    })
    .from(scans)
    .innerJoin(sites, eq(scans.siteId, sites.id))
    .where(and(eq(sites.userId, res.locals.userId), eq(scans.status, "completed")))
    .orderBy(scans.siteId, desc(scans.createdAt));
  res.json({ results: rows });
});

export const scansRouter = Router();
scansRouter.use(requireAuth);

scansRouter.get("/:id", async (req, res) => {
  const [row] = await db
    .select({ scan: scans, site: { id: sites.id, url: sites.url, hostname: sites.hostname, name: sites.name } })
    .from(scans)
    .innerJoin(sites, eq(scans.siteId, sites.id))
    .where(and(eq(scans.id, idParam(req.params.id)), eq(sites.userId, res.locals.userId)));
  if (!row) throw new HttpError(404, "Scan not found");
  res.json({ scan: row.scan, site: row.site });
});
