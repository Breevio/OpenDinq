import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDemoProfiles } from "./demo-data.js";
import { createApiRoutes, type ApiRouteOptions } from "./routes.js";
import { createMemoryStore } from "./store.js";

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

  app.route("/api", createApiRoutes({ store, fetchImpl: options?.fetchImpl }));

  return app;
}

export const app = createApp();
export const seededApp = createApp({ seedDemo: process.env.OPENDINQ_AUTO_SEED !== "false" });

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({
    fetch: seededApp.fetch,
    port: Number(process.env.PORT ?? 3001)
  });
}
