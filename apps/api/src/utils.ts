/**
 * Shared utilities for the API layer.
 * These are extracted to eliminate code duplication between routes.ts and profile-candidate-resolver.ts.
 */

/**
 * Returns a promise that races the given promise against a timeout.
 * If the timeout fires first, the returned promise rejects with the given message.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

/**
 * Normalizes an identifier for fuzzy matching by lowercasing and removing
 * all non-alphanumeric characters.
 */
export function compactIdentifier(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Returns a normalized name if the input looks like a person's name,
 * otherwise undefined.
 */
export function personLikeInput(input: string): string | undefined {
  const normalized = input.replace(/^generate a profile (for|from)\s+/i, "").trim();
  return /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(normalized) ? normalized : undefined;
}

/**
 * Returns true if the input is an HTTP or HTTPS URL.
 */
export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
