import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createMemoryStore, type OpenDinqStore } from "@opendinq/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { createDemoProfiles } from "./demo-data.js";
import { createApiRoutes, type ApiRouteOptions } from "./routes.js";
import { rateLimiter } from "./rate-limit.js";

loadLocalEnv();

export function createApp(options?: Partial<ApiRouteOptions> & { seedDemo?: boolean }) {
  const app = new Hono();

  // Global error handler: catch any uncaught exceptions and return a
  // sanitized 500 response. Log the full error server-side for debugging.
  app.onError((error, context) => {
    console.error("[api] uncaught error:", error);
    return context.json(
      { error: { code: "internal_error", message: "Internal server error." } },
      500
    );
  });

  const store = options?.store ?? createMemoryStore(options?.seedDemo ? createDemoProfiles() : []);

  // CORS: allow the configured origin (default: web app origin in dev).
  const corsOrigin = process.env.OPEN_DINQ_CORS_ORIGIN ?? "http://localhost:3012";
  app.use("/api/*", cors({
    origin: corsOrigin,
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
    credentials: false
  }));

  // Rate limiting: protect against abuse and resource exhaustion.
  const rateLimitWindowMs = Number(process.env.OPEN_DINQ_RATE_LIMIT_WINDOW_MS) || 60_000;
  const rateLimitMax = Number(process.env.OPEN_DINQ_RATE_LIMIT_MAX) || 100;
  app.use("/api/*", rateLimiter({ windowMs: rateLimitWindowMs, max: rateLimitMax }));

  // Body size limit: prevent oversized request bodies from exhausting memory.
  const maxBodySize = Number(process.env.OPEN_DINQ_MAX_BODY_SIZE) || 1_048_576; // 1MB
  app.use("/api/*", bodyLimit({ maxSize: maxBodySize }));

  // Security headers.
  app.use("/api/*", secureHeaders());

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "opendinq-api"
    })
  );

  app.route("/api", createApiRoutes({ store, fetchImpl: options?.fetchImpl, llmClient: options?.llmClient }));

  return app;
}

function loadLocalEnv() {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return;
  }
  const envPath = findLocalEnvPath();
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findLocalEnvPath() {
  let current = resolve(process.cwd());
  const root = parse(current).root;
  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }
    if (current === root) {
      return join(process.cwd(), ".env");
    }
    current = dirname(current);
  }
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export async function createRuntimeApp() {
  return createApp({
    store: await createRuntimeStore(process.env.OPENDINQ_AUTO_SEED !== "false")
  });
}

async function createRuntimeStore(seedDemo: boolean): Promise<OpenDinqStore> {
  if (!process.env.DATABASE_URL) {
    return createMemoryStore(seedDemo ? createDemoProfiles() : []);
  }

  const { createPrismaStoreFromGeneratedClient } = await import("@opendinq/db");
  const store = await createPrismaStoreFromGeneratedClient();

  if (seedDemo) {
    await Promise.all(createDemoProfiles().map((profile) => store.upsertProfile(profile)));
  }

  return store;
}

export const app = createApp();

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtimeApp = await createRuntimeApp();

  serve({
    fetch: runtimeApp.fetch,
    port: Number(process.env.PORT ?? 3011)
  });
}
