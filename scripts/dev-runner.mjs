import net from "node:net";
import { once } from "node:events";
import { spawnSync } from "node:child_process";

const DEFAULT_SHUTDOWN_SIGNAL = "SIGTERM";
const DEFAULT_HOST = "127.0.0.1";
const START_TIMEOUT_MS = 20_000;

export function createDevConfig(env = process.env) {
  const apiPort = env.OPENDINQ_API_PORT ?? env.PORT ?? "3011";
  const webPort = env.OPENDINQ_WEB_PORT ?? "3012";
  const apiUrl = `http://localhost:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;

  return {
    apiPort,
    webPort,
    apiUrl,
    webUrl,
    services: [
      {
        name: "api",
        command: "pnpm",
        args: ["--filter", "@opendinq/api", "dev"],
        port: apiPort,
        url: apiUrl,
        env: {
          PORT: apiPort
        }
      },
      {
        name: "web",
        command: "pnpm",
        args: ["--filter", "@opendinq/web", "dev"],
        port: webPort,
        url: webUrl,
        env: {
          NEXT_PUBLIC_OPENDINQ_API_URL: env.NEXT_PUBLIC_OPENDINQ_API_URL ?? apiUrl,
          PORT: webPort
        },
        dependsOn: [
          {
            name: "api",
            url: apiUrl
          }
        ]
      }
    ]
  };
}

export async function runDevEnvironment(config, options = {}) {
  const {
    env = process.env,
    spawn,
    host = DEFAULT_HOST,
    logger = console,
    inspectPort = defaultInspectPort,
    waitForPort = defaultWaitForPort,
    shutdownSignal = DEFAULT_SHUTDOWN_SIGNAL,
    installSignalHandlers = true
  } = options;

  if (typeof spawn !== "function") {
    throw new Error("runDevEnvironment requires a spawn function.");
  }

  const state = { stopping: false };
  const children = [];
  const cleanup = installSignalHandlers ? installShutdownHandlers(() => stopAll(children, state, logger, shutdownSignal)) : () => {};

  try {
    logIntro(config, logger);
    await assertPortsAvailable(config.services, { host, inspectPort, logger });
    await startServices(config.services, {
      env,
      spawn,
      host,
      logger,
      state,
      children,
      waitForPort,
      shutdownSignal
    });
    logger.log("[dev] Local environment is ready.");
    maybeOpenBrowser(config.webUrl, env, logger);
    return {
      stop: async () => {
        cleanup();
        await stopAll(children, state, logger, shutdownSignal);
      }
    };
  } catch (error) {
    cleanup();
    await stopAll(children, state, logger, shutdownSignal);
    throw error;
  }
}

export async function assertPortsAvailable(services, options = {}) {
  const { host = DEFAULT_HOST, inspectPort = defaultInspectPort, logger = console } = options;
  for (const service of services) {
    const portInfo = await inspectPort({ host, port: Number(service.port) });
    if (portInfo.available) {
      logger.log(`[dev] ${service.name} port ${service.port} is available.`);
      continue;
    }

    throw new Error(portFailureMessage(service, portInfo));
  }
}

export function prefixOutput(name, chunk) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line) => (line ? `[${name}] ${line}` : line))
    .join("\n");
}

async function startServices(services, options) {
  for (const service of services) {
    logServiceStarting(service, options.logger);
    const child = options.spawn(service.command, service.args, {
      env: {
        ...options.env,
        ...service.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    bindChildOutput(service, child, options.logger);
    options.children.push({ service, child });

    try {
      await waitForServiceReady(service, child, options);
      logServiceReady(service, options.logger);
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error(`[dev] ${service.name} failed during startup.`);
    }
  }
}

function bindChildOutput(service, child, logger) {
  child.stdout?.on("data", (chunk) => logger.log(prefixOutput(service.name, chunk)));
  child.stderr?.on("data", (chunk) => logger.error(prefixOutput(service.name, chunk)));
}

async function waitForServiceReady(service, child, options) {
  const exitPromise = onceChildExit(child);
  try {
    await Promise.race([
      options.waitForPort({
        host: options.host,
        port: Number(service.port),
        timeoutMs: START_TIMEOUT_MS
      }),
      exitPromise.then(({ code, signal }) => {
        throw new Error(exitMessage(service.name, code, signal));
      })
    ]);
  } catch (error) {
    throw error;
  }

  child.once("exit", (code, signal) => {
    if (options.state.stopping) {
      options.logger.log(`[dev] ${service.name} stopped${signal ? ` with signal ${signal}` : code !== null ? ` with code ${code}` : ""}.`);
      return;
    }
    options.logger.error(exitMessage(service.name, code, signal));
    void stopAll(options.children, options.state, options.logger, options.shutdownSignal)
      .finally(() => {
        process.exitCode = typeof code === "number" && code !== 0 ? code : 1;
      });
  });
}

function onceChildExit(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function stopAll(children, state, logger, shutdownSignal) {
  if (state.stopping) {
    return;
  }
  state.stopping = true;

  const running = children.filter(({ child }) => child.exitCode == null && child.signalCode == null && !child.killed);
  if (running.length === 0) {
    return;
  }

  logger.log("[dev] Stopping local environment.");
  for (const { service, child } of running) {
    logger.log(`[dev] Stopping ${service.name}.`);
    child.kill(shutdownSignal);
  }

  await Promise.all(running.map(async ({ child }) => {
    await onceChildExit(child);
  }));
}

function installShutdownHandlers(stop) {
  const handleSigint = async () => {
    await stop();
    process.exit(130);
  };
  const handleSigterm = async () => {
    await stop();
    process.exit(143);
  };

  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  return () => {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
  };
}

function logIntro(config, logger) {
  logger.log("[dev] OpenDinq is starting locally.");
  logger.log(`[dev] App: ${config.webUrl}`);
  logger.log(`[dev] API health: ${config.apiUrl}/health`);
  logger.log("[dev] Recommended entrypoint: pnpm dev");
  logger.log("[dev] Use pnpm dev:api or pnpm dev:web only for single-service debugging.");
  logger.log("[dev] Press Ctrl+C to stop.\n");
}

function maybeOpenBrowser(url, env, logger) {
  if (env.OPENDINQ_NO_OPEN_BROWSER === "1" || env.OPENDINQ_NO_OPEN_BROWSER === "true") {
    return;
  }
  const platform = process.platform;
  let command = null;
  if (platform === "darwin") {
    command = "open";
  } else if (platform === "win32") {
    command = "start";
  } else if (platform === "linux") {
    command = "xdg-open";
  }
  if (!command) {
    return;
  }
  try {
    if (command === "start") {
      spawnSync(command, [url], { shell: true, stdio: "ignore" });
    } else {
      spawnSync(command, [url], { stdio: "ignore" });
    }
  } catch {
    // Best-effort: if the browser fails to open, the URL is already printed.
  }
}

function logServiceStarting(service, logger) {
  logger.log(`[dev] Starting ${service.name} on port ${service.port}.`);
  if (service.dependsOn?.length) {
    logger.log(`[dev] ${service.name} expects ${service.dependsOn.map((dependency) => `${dependency.name} at ${dependency.url}`).join(", ")}.`);
  }
}

function logServiceReady(service, logger) {
  logger.log(`[dev] ${service.name} is listening on ${service.url}.`);
  if (service.dependsOn?.length) {
    logger.log(`[dev] ${service.name} can still fail at runtime if its dependency is unavailable.`);
  }
}

function exitMessage(name, code, signal) {
  if (signal) {
    return `[dev] ${name} exited with signal ${signal}.`;
  }
  return `[dev] ${name} exited with code ${code ?? "unknown"}.`;
}

function portEnvVar(serviceName) {
  return serviceName === "api" ? "OPENDINQ_API_PORT" : serviceName === "web" ? "OPENDINQ_WEB_PORT" : "PORT";
}

function portFailureMessage(service, portInfo) {
  if (portInfo.reason === "in_use") {
    const processLabel = formatPortOwner(portInfo);
    return `[dev] ${service.name} could not start because port ${service.port} is already in use by ${processLabel}. ` +
      `Stop the existing process or set ${portEnvVar(service.name)} to a free port.`;
  }

  if (portInfo.reason === "permission_denied") {
    return `[dev] ${service.name} could not verify port ${service.port} because this environment denied local listen() (${portInfo.code ?? "EPERM"}). ` +
      `Run pnpm dev in a local shell with loopback listen permissions, or skip the shared launcher and use ${singleServiceHint(service.name)}.`;
  }

  const details = portInfo.message ? ` ${portInfo.message}` : "";
  return `[dev] ${service.name} could not verify port ${service.port} before startup.${details}`;
}

function singleServiceHint(serviceName) {
  return serviceName === "api" ? "`pnpm dev:api`" : serviceName === "web" ? "`pnpm dev:web`" : "`pnpm dev`";
}

function formatPortOwner(portInfo) {
  if (portInfo.command && portInfo.pid) {
    return `${portInfo.command} (pid ${portInfo.pid})`;
  }
  if (portInfo.command) {
    return portInfo.command;
  }
  if (portInfo.pid) {
    return `pid ${portInfo.pid}`;
  }
  return "another process";
}

async function defaultInspectPort({ host, port }) {
  return inspectListenability({ host, port });
}

export async function inspectListenability({ host, port }, { isReachableFn = isReachable } = {}) {
  if (await isReachableFn({ host, port })) {
    return { available: false, reason: "in_use", message: `Port ${port} is already accepting connections on ${host}.` };
  }

  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen({ host, port }, resolve);
    });
    return { available: true };
  } catch (error) {
    if (isNodeError(error) && error.code === "EADDRINUSE") {
      return { available: false, reason: "in_use", code: error.code, message: error.message };
    }
    if (isNodeError(error) && error.code === "EPERM") {
      return { available: false, reason: "permission_denied", code: error.code, message: error.message };
    }
    return {
      available: false,
      reason: "unknown",
      code: isNodeError(error) ? error.code : undefined,
      message: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await new Promise((resolve) => {
      server.close(() => resolve());
    }).catch(() => undefined);
  }
}

async function defaultWaitForPort({ host, port, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isReachable({ host, port })) {
      return;
    }
    await delay(150);
  }
  throw new Error(`[dev] Timed out waiting for port ${port} to start listening.`);
}

async function isReachable({ host, port }) {
  const socket = new net.Socket();
  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
      socket.connect(port, host);
    });
    return true;
  } catch {
    return false;
  } finally {
    socket.destroy();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNodeError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}
