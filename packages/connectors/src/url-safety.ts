/**
 * SSRF protection: validate that a URL points to a public host, not a
 * private/internal IP range. This prevents the website connector (and any
 * other code that fetches user-supplied URLs) from being used to probe
 * internal services or cloud metadata endpoints.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback"
]);

const BLOCKED_IPV4_PATTERNS: Array<{ prefix: string; bits: number }> = [
  { prefix: "0.0.0.0", bits: 8 }, // "this" network
  { prefix: "10.0.0.0", bits: 8 }, // private
  { prefix: "100.64.0.0", bits: 10 }, // CGNAT
  { prefix: "127.0.0.0", bits: 8 }, // loopback
  { prefix: "169.254.0.0", bits: 16 }, // link-local / cloud metadata
  { prefix: "172.16.0.0", bits: 12 }, // private
  { prefix: "192.0.0.0", bits: 24 }, // IETF protocol assignments
  { prefix: "192.0.2.0", bits: 24 }, // TEST-NET-1
  { prefix: "192.88.99.0", bits: 24 }, // 6to4 anycast (legacy)
  { prefix: "192.168.0.0", bits: 16 }, // private
  { prefix: "198.18.0.0", bits: 15 }, // benchmarking
  { prefix: "198.51.100.0", bits: 24 }, // TEST-NET-2
  { prefix: "203.0.113.0", bits: 24 }, // TEST-NET-3
  { prefix: "224.0.0.0", bits: 4 }, // multicast
  { prefix: "240.0.0.0", bits: 4 } // reserved
];

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  // Convert the IPv4 address to a 32-bit integer. All indices are safe
  // because we verified length === 4 above.
  const a = octets[0] ?? 0;
  const b = octets[1] ?? 0;
  const c = octets[2] ?? 0;
  const d = octets[3] ?? 0;
  const value = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

  return BLOCKED_IPV4_PATTERNS.some((pattern) => {
    const patternOctets = pattern.prefix.split(".").map(Number);
    const pa = patternOctets[0] ?? 0;
    const pb = patternOctets[1] ?? 0;
    const pc = patternOctets[2] ?? 0;
    const pd = patternOctets[3] ?? 0;
    const patternValue = ((pa << 24) | (pb << 16) | (pc << 8) | pd) >>> 0;
    const mask = pattern.bits === 0 ? 0 : (0xffffffff << (32 - pattern.bits)) >>> 0;
    return (value & mask) === (patternValue & mask);
  });
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = normalizeIpv6(ip);
  if (!normalized) {
    return false;
  }

  // ::1 (loopback)
  if (normalized === "00000000000000000000000000000001") {
    return true;
  }

  // fc00::/7 (unique local addresses)
  const firstByte = parseInt(normalized.slice(0, 2), 16);
  if ((firstByte & 0xfe) === 0xfc) {
    return true;
  }

  // fe80::/10 (link-local)
  if ((firstByte === 0xfe) && ((parseInt(normalized.slice(2, 4), 16) & 0xc0) === 0x80)) {
    return true;
  }

  // ff00::/8 (multicast)
  if (firstByte === 0xff) {
    return true;
  }

  // :: (unspecified)
  if (normalized === "00000000000000000000000000000000") {
    return true;
  }

  return false;
}

function normalizeIpv6(ip: string): string | null {
  // Handle IPv4-mapped IPv6 addresses (::ffff:1.2.3.4)
  const ipv4MappedMatch = ip.match(/:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4MappedMatch) {
    const ipv4Part = `${ipv4MappedMatch[1]}.${ipv4MappedMatch[2]}.${ipv4MappedMatch[3]}.${ipv4MappedMatch[4]}`;
    if (isBlockedIpv4(ipv4Part)) {
      return "blocked";
    }
  }

  // Expand :: shorthand to full 8 groups
  let expanded = ip;
  if (expanded.includes("::")) {
    const [head, tail] = expanded.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    const missing = 8 - headParts.length - tailParts.length;
    if (missing < 0) {
      return null;
    }
    expanded = [...headParts, ...Array(missing).fill("0"), ...tailParts].join(":");
  }

  const groups = expanded.split(":");
  if (groups.length !== 8) {
    return null;
  }

  return groups.map((group) => group.padStart(4, "0")).join("");
}

/**
 * Returns `true` if `url` is an http(s) URL that does not point to a private
 * or reserved IP range. Returns `false` for invalid URLs, non-http protocols,
 * or blocked hostnames.
 */
export function isSafeHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  // IPv4 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return !isBlockedIpv4(hostname);
  }

  // IPv6 literal (URL.hostname strips the brackets)
  if (hostname.includes(":")) {
    return !isBlockedIpv6(hostname);
  }

  // For hostnames, we cannot resolve DNS here without making this async.
  // The website connector will additionally validate after DNS resolution.
  // For now, block obvious internal hostnames.
  if (hostname.endsWith(".internal") || hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    return false;
  }

  return true;
}

/**
 * Asserts that `url` is a safe public http(s) URL. Throws if the URL is
 * invalid, uses a non-http protocol, or points to a blocked host/IP range.
 */
export function assertSafeFetchUrl(url: string): string {
  if (!isSafeHttpUrl(url)) {
    throw new Error("URL hostname resolves to a blocked private or reserved IP range.");
  }
  return url;
}
