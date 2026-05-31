import { spawn } from "node:child_process";
import { createDevConfig, runDevEnvironment } from "./dev-runner.mjs";

const config = createDevConfig(process.env);

runDevEnvironment(config, { spawn }).catch((error) => {
  console.error(error instanceof Error ? error.message : "[dev] Local environment failed to start.");
  process.exit(1);
});
