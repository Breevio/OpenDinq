/**
 * Default timeout for external API calls.
 * Connectors should never hang indefinitely.
 */
export const CONNECTOR_DEFAULT_TIMEOUT_MS = 15_000;

const timeoutWrapperCache = new WeakMap<typeof fetch, typeof fetch>();

/**
 * Returns a stable wrapper around `fetchImpl` that applies a timeout to every call.
 * The same wrapper is returned for the same `fetchImpl` so that caches keyed on
 * the fetch function remain consistent across calls.
 */
export function createTimeoutFetchImpl(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = CONNECTOR_DEFAULT_TIMEOUT_MS
): typeof fetch {
  const existing = timeoutWrapperCache.get(fetchImpl);
  if (existing) {
    return existing;
  }
  const wrapped: typeof fetch = (url, init) =>
    fetchImpl(url, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs)
    });
  timeoutWrapperCache.set(fetchImpl, wrapped);
  return wrapped;
}

