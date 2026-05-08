import type { Context } from "hono";
import { GitHubConnectorError } from "@opendinq/connectors";

export function errorResponse(context: Context, error: unknown) {
  if (error instanceof GitHubConnectorError) {
    const status = error.code === "not_found" ? 404 : error.code === "rate_limited" ? 429 : 502;
    return context.json({ error: { code: error.code, message: error.message } }, status);
  }

  if (error instanceof Error) {
    return context.json({ error: { code: "bad_request", message: error.message } }, 400);
  }

  return context.json(
    { error: { code: "internal_error", message: "Unexpected API error." } },
    500
  );
}

