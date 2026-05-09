import { serve } from "@hono/node-server";
import { createMemoryStore, type OpenDinqStore } from "@opendinq/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDemoProfiles } from "./demo-data.js";
import { createApiRoutes, type ApiRouteOptions } from "./routes.js";

export function createApp(options?: Partial<ApiRouteOptions> & { seedDemo?: boolean }) {
  const app = new Hono();
  const store = options?.store ?? createMemoryStore(options?.seedDemo ? createDemoProfiles() : []);

  app.use("/api/*", cors());

  app.get("/health", (context) =>
    context.json({
      ok: true,
      service: "opendinq-api"
    })
  );

  app.route("/api", createApiRoutes({ store, fetchImpl: options?.fetchImpl, llmClient: options?.llmClient }));

  return app;
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
export const seededApp = createApp({ seedDemo: process.env.OPENDINQ_AUTO_SEED !== "false" });

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtimeApp = await createRuntimeApp();

  serve({
    fetch: runtimeApp.fetch,
    port: Number(process.env.PORT ?? 3001)
  });
}
