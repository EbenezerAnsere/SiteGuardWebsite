import dns from "node:dns/promises";
import { safeFetch } from "./net.js";

export const VERIFY_FILE_PATH = "/.well-known/security-app-verification.txt";
export const dnsRecordValue = (token: string) => `security-app-verification=${token}`;

/** Checks that the user controls the site, either via a file on the web server or a DNS TXT record. */
export async function verifyOwnership(
  site: { url: string; hostname: string; verificationToken: string },
  method: "file" | "dns",
): Promise<{ ok: boolean; detail: string }> {
  if (method === "file") {
    const url = site.url + VERIFY_FILE_PATH;
    try {
      const r = await safeFetch(url, { maxBytes: 2000, timeoutMs: 8000 });
      if (r.status === 200 && r.body.includes(site.verificationToken)) return { ok: true, detail: "Verification file found" };
      if (r.status === 404) {
        return { ok: false, detail: `The verification file was not found on the server (HTTP 404). Upload it to ${url} and try again. Only the site's owner can do this.` };
      }
      if (r.status === 401 || r.status === 403) {
        return { ok: false, detail: `The server refused access to the verification file (HTTP ${r.status}). Make sure ${VERIFY_FILE_PATH} is publicly readable.` };
      }
      if (r.status === 200) {
        return { ok: false, detail: "The file exists but does not contain this site's token. Copy the token exactly as shown, with no extra text." };
      }
      return { ok: false, detail: `The server answered HTTP ${r.status} instead of the verification file.` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  try {
    const records = (await dns.resolveTxt(site.hostname)).map((r) => r.join(""));
    if (records.includes(dnsRecordValue(site.verificationToken))) return { ok: true, detail: "DNS TXT record found" };
    return { ok: false, detail: `${site.hostname} has TXT records, but none with this site's token. DNS changes can take a few minutes to appear.` };
  } catch {
    return { ok: false, detail: `No TXT records found on ${site.hostname}. Add the record at your DNS provider; changes can take a few minutes to appear.` };
  }
}
