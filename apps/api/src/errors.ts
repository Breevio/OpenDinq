import type { Context } from "hono";
import { GitHubConnectorError } from "@opendinq/connectors";
import { ZodError } from "zod";

export class ApiNotFoundError extends Error {
  readonly code = "not_found";
}

/**
 * Sanitizes error messages before returning them to the client.
 * - ZodError: returns a generic "Invalid request body." message
 * - Known connector/API errors: returns the original message (safe)
 * - Other errors: returns a generic "Internal server error." message
 */
function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return "Invalid request body.";
  }
  if (error instanceof GitHubConnectorError || error instanceof ApiNotFoundError) {
    return error.message;
  }
  if (error instanceof Error) {
    // For known safe error patterns, return the message.
    // For everything else, return a generic message to avoid leaking internals.
    return "Internal server error.";
  }
  return "Internal server error.";
}

export function errorResponse(context: Context, error: unknown) {
  if (error instanceof GitHubConnectorError) {
    const status = error.code === "not_found" ? 404 : error.code === "rate_limited" ? 429 : 502;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }

  if (error instanceof ApiNotFoundError) {
    return context.json({ error: { code: error.code, message: error.message } }, 404);
  }

  if (error instanceof ZodError) {
    return context.json({ error: { code: "bad_request", message: "Invalid request body." } }, 400);
  }

  if (error instanceof Error) {
    return context.json({ error: { code: "bad_request", message: sanitizeErrorMessage(error) } }, 400);
  }

  return context.json(
    { error: { code: "internal_error", message: "Unexpected API error." } },
    500
  );
}
