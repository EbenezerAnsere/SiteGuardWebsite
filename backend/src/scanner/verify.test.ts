import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve, type Fixture } from "../test/fixtures.js";
import { dnsRecordValue, verifyOwnership, VERIFY_FILE_PATH } from "./verify.js";

let site: Fixture;
let served = "";
beforeAll(async () => {
  site = await serve((req, res) => {
    if (req.url === VERIFY_FILE_PATH && served) return res.end(served);
    if (req.url === VERIFY_FILE_PATH && process.env.VERIFY_FORBIDDEN) return res.writeHead(403).end();
    res.writeHead(404).end();
  });
});
afterAll(() => site.close());

const target = (token = "sa-abc123") => ({ url: site.url, hostname: "127.0.0.1", verificationToken: token });

describe("verifyOwnership via file", () => {
  it("succeeds when the file contains the token", async () => {
    served = "sa-abc123\n";
    expect(await verifyOwnership(target(), "file")).toEqual({ ok: true, detail: "Verification file found" });
  });

  it("explains a missing file (HTTP 404) in plain language", async () => {
    served = "";
    const r = await verifyOwnership(target(), "file");
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not found on the server \(HTTP 404\)/);
    expect(r.detail).toContain(`${site.url}${VERIFY_FILE_PATH}`);
  });

  it("explains a file with the wrong token", async () => {
    served = "sa-someone-else";
    const r = await verifyOwnership(target(), "file");
    expect(r).toMatchObject({ ok: false });
    expect(r.detail).toMatch(/does not contain this site's token/);
  });

  it("explains a server that blocks the file", async () => {
    served = "";
    process.env.VERIFY_FORBIDDEN = "1";
    try {
      const r = await verifyOwnership(target(), "file");
      expect(r.detail).toMatch(/refused access .*HTTP 403/);
    } finally {
      delete process.env.VERIFY_FORBIDDEN;
    }
  });
});

describe("DNS verification", () => {
  it("expects a TXT record in the documented format", () => {
    expect(dnsRecordValue("sa-xyz")).toBe("security-app-verification=sa-xyz");
  });
});
