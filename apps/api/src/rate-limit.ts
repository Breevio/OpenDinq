import type { MiddlewareHandler } from "hono";

type RateLimitEntry = {
  count: number;
  resetTime: number;
};

type RateLimitOptions = {
  windowMs?: number;
  max?: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX = 100;

/**
 * In-memory sliding-window rate limiter.
 *
 * Limits are per-IP (from `x-forwarded-for` or the socket remote address).
 * The store is a `Map` in module scope; entries are lazily cleaned up as
 * they expire. This is suitable for single-process deployments; for
 * multi-process deployments, use an external store (e.g., Redis).
 */
export function rateLimiter(options: RateLimitOptions = {}): MiddlewareHandler {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const max = options.max ?? DEFAULT_MAX;
  const store = new Map<string, RateLimitEntry>();

  // Periodically clean up expired entries to prevent memory leaks.
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetTime) {
        store.delete(key);
      }
    }
  }, windowMs);
  // Allow the process to exit even if the interval is still running.
  cleanup.unref?.();

  return async (context, next) => {
    const ip = getClientIp(context);
    const key = `${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now >= entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, max - entry.count);
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

    context.header("X-RateLimit-Limit", String(max));
    context.header("X-RateLimit-Remaining", String(remaining));
    context.header("X-RateLimit-Reset", String(Math.floor(entry.resetTime / 1000)));

    if (entry.count > max) {
      context.header("Retry-After", String(retryAfter));
      return context.json(
        { error: { code: "rate_limited", message: "Too many requests. Please retry later." } },
        429
      );
    }

    await next();
  };
}

function getClientIp(context: Parameters<MiddlewareHandler>[0]): string {
  const forwarded = context.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  const realIp = context.req.header("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}
