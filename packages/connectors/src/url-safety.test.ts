import { describe, expect, it } from "vitest";
import { assertSafeFetchUrl, isSafeHttpUrl } from "./url-safety.js";

describe("url-safety isSafeHttpUrl", () => {
  it("accepts public http and https URLs", () => {
    expect(isSafeHttpUrl("http://example.com/")).toBe(true);
    expect(isSafeHttpUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects non-http protocols", () => {
    expect(isSafeHttpUrl("ftp://example.com/")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("http://")).toBe(false);
  });

  it("blocks IPv4 loopback addresses", () => {
    expect(isSafeHttpUrl("http://127.0.0.1/")).toBe(false);
    expect(isSafeHttpUrl("http://127.1.2.3/")).toBe(false);
    expect(isSafeHttpUrl("http://127.255.255.254/")).toBe(false);
  });

  it("blocks IPv4 private ranges", () => {
    expect(isSafeHttpUrl("http://10.0.0.1/")).toBe(false);
    expect(isSafeHttpUrl("http://10.255.255.255/")).toBe(false);
    expect(isSafeHttpUrl("http://192.168.1.1/")).toBe(false);
    expect(isSafeHttpUrl("http://172.16.0.1/")).toBe(false);
    expect(isSafeHttpUrl("http://172.31.255.255/")).toBe(false);
  });

  it("blocks IPv4 link-local and cloud metadata", () => {
    expect(isSafeHttpUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeHttpUrl("http://169.254.0.1/")).toBe(false);
  });

  it("blocks IPv4 reserved ranges", () => {
    expect(isSafeHttpUrl("http://0.0.0.0/")).toBe(false);
    expect(isSafeHttpUrl("http://224.0.0.1/")).toBe(false);
    expect(isSafeHttpUrl("http://240.0.0.1/")).toBe(false);
  });

  it("allows public IPv4 addresses", () => {
    expect(isSafeHttpUrl("http://8.8.8.8/")).toBe(true);
    expect(isSafeHttpUrl("http://1.1.1.1/")).toBe(true);
  });

  it("blocks IPv6 loopback", () => {
    expect(isSafeHttpUrl("http://[::1]/")).toBe(false);
  });

  it("blocks IPv6 link-local", () => {
    expect(isSafeHttpUrl("http://[fe80::1]/")).toBe(false);
  });

  it("blocks IPv6 unique local", () => {
    expect(isSafeHttpUrl("http://[fc00::1]/")).toBe(false);
    expect(isSafeHttpUrl("http://[fd00::1]/")).toBe(false);
  });

  it("blocks localhost hostname", () => {
    expect(isSafeHttpUrl("http://localhost/")).toBe(false);
    expect(isSafeHttpUrl("http://localhost:3000/")).toBe(false);
  });

  it("blocks internal hostnames", () => {
    expect(isSafeHttpUrl("http://myapp.internal/")).toBe(false);
    expect(isSafeHttpUrl("http://myapp.local/")).toBe(false);
    expect(isSafeHttpUrl("http://myapp.localhost/")).toBe(false);
  });

  it("allows public hostnames", () => {
    expect(isSafeHttpUrl("https://github.com/")).toBe(true);
    expect(isSafeHttpUrl("https://api.openalex.org/")).toBe(true);
  });
});

describe("url-safety assertSafeFetchUrl", () => {
  it("returns the URL when safe", () => {
    const url = "https://example.com/path";
    expect(assertSafeFetchUrl(url)).toBe(url);
  });

  it("throws when URL is blocked", () => {
    expect(() => assertSafeFetchUrl("http://169.254.169.254/")).toThrow(
      "URL hostname resolves to a blocked private or reserved IP range."
    );
  });

  it("throws when URL is invalid", () => {
    expect(() => assertSafeFetchUrl("not a url")).toThrow();
  });
});
