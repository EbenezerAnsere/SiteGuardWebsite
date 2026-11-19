import { afterEach, describe, expect, it } from "vitest";
import { preauthorization, PUBLIC_TEST_TARGETS } from "./authorized.js";

describe("preauthorization", () => {
  afterEach(() => {
    process.env.SCAN_AUTHORIZED_HOSTS = "";
  });

  it("treats the public scanner test sites as pre-authorized", () => {
    for (const t of PUBLIC_TEST_TARGETS) expect(preauthorization(t.host)?.via).toBe("test-target");
    expect(preauthorization("expired.badssl.com")?.via).toBe("test-target");
  });

  it("requires ownership verification for ordinary sites", () => {
    expect(preauthorization("practice.expandtesting.com")).toBeNull();
    expect(preauthorization("example.com")).toBeNull();
  });

  it("does not match lookalike domains", () => {
    expect(preauthorization("badssl.com.evil.io")).toBeNull();
    expect(preauthorization("testphp.vulnweb.com.evil.io")).toBeNull();
    expect(preauthorization("notbadssl.com")).toBeNull();
  });

  it("honours SCAN_AUTHORIZED_HOSTS, including *.wildcards", () => {
    process.env.SCAN_AUTHORIZED_HOSTS = "client.example, *.partner.example";
    expect(preauthorization("client.example")?.via).toBe("authorized-host");
    expect(preauthorization("CLIENT.example")?.via).toBe("authorized-host");
    expect(preauthorization("app.partner.example")?.via).toBe("authorized-host");
    expect(preauthorization("partner.example")?.via).toBe("authorized-host");
    expect(preauthorization("evilpartner.example")).toBeNull();
    expect(preauthorization("sub.client.example")).toBeNull();
  });

  it("ignores an empty setting", () => {
    process.env.SCAN_AUTHORIZED_HOSTS = " , ";
    expect(preauthorization("example.com")).toBeNull();
  });
});
