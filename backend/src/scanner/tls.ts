import net from "node:net";
import tls from "node:tls";
import { assertPublicHost } from "./net.js";

export interface TlsInfo {
  authorized: boolean;
  authorizationError?: string;
  protocol: string | null;
  validTo: Date;
  issuer: string;
}

function connect(host: string, port: number, extra: tls.ConnectionOptions = {}): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: false, timeout: 10_000, ...extra },
      () => resolve(socket),
    );
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("TLS handshake timed out"));
    });
  });
}

export async function getTlsInfo(host: string, port = 443): Promise<TlsInfo> {
  await assertPublicHost(host);
  const socket = await connect(host, port);
  try {
    const cert = socket.getPeerCertificate();
    const issuer = cert.issuer ? (cert.issuer.O ?? cert.issuer.CN ?? "unknown") : "unknown";
    return {
      authorized: socket.authorized,
      authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
      protocol: socket.getProtocol(),
      validTo: new Date(cert.valid_to),
      issuer: Array.isArray(issuer) ? issuer.join(", ") : issuer,
    };
  } finally {
    socket.end();
  }
}

/** Returns the negotiated protocol if the server still accepts TLS 1.0/1.1, otherwise null. */
export async function legacyTlsProtocol(host: string, port = 443): Promise<string | null> {
  await assertPublicHost(host);
  try {
    const socket = await connect(host, port, {
      minVersion: "TLSv1",
      maxVersion: "TLSv1.1",
      ciphers: "DEFAULT@SECLEVEL=0",
    });
    const protocol = socket.getProtocol();
    socket.end();
    return protocol;
  } catch {
    return null;
  }
}
