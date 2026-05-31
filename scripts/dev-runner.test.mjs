import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { assertPortsAvailable, createDevConfig, inspectListenability, prefixOutput, runDevEnvironment } from "./dev-runner.mjs";

describe("dev-runner", () => {
  it("uses stable default ports and dev entrypoint config", () => {
    const config = createDevConfig({});
    expect(config.apiPort).toBe("3011");
    expect(config.webPort).toBe("3012");
    expect(config.services.map((service) => service.name)).toEqual(["api", "web"]);
    expect(config.services[1]?.env.NEXT_PUBLIC_OPENDINQ_API_URL).toBe("http://localhost:3011");
  });

  it("rejects startup when a configured port is already in use", async () => {
    await expect(assertPortsAvailable([
      { name: "api", port: "3011" }
    ], {
      logger: silentLogger(),
      inspectPort: vi.fn().mockResolvedValue({ available: false, reason: "in_use", command: "node", pid: 4242 })
    })).rejects.toThrow("port 3011 is already in use by node (pid 4242)");
  });

  it("surfaces permission-denied port probes without misreporting a port conflict", async () => {
    await expect(assertPortsAvailable([
      { name: "api", port: "3011" }
    ], {
      logger: silentLogger(),
      inspectPort: vi.fn().mockResolvedValue({ available: false, reason: "permission_denied", code: "EPERM" })
    })).rejects.toThrow("denied local listen() (EPERM)");
  });

  it("treats an already reachable loopback port as in use before listen probing", async () => {
    await expect(inspectListenability(
      { host: "127.0.0.1", port: 3011 },
      { isReachableFn: vi.fn().mockResolvedValue(true) }
    )).resolves.toMatchObject({
      available: false,
      reason: "in_use",
      message: "Port 3011 is already accepting connections on 127.0.0.1."
    });
  });

  it("starts services in order and stops all children on shutdown", async () => {
    const logger = memoryLogger();
    const children = [];
    const spawn = vi.fn((command, args, options) => {
      const child = createMockChild(command, args, options);
      children.push(child);
      return child;
    });
    const stop = await runDevEnvironment(createDevConfig({}), {
      spawn,
      logger,
      installSignalHandlers: false,
      inspectPort: vi.fn().mockResolvedValue({ available: true }),
      waitForPort: vi.fn().mockResolvedValue(undefined)
    });

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(children).toHaveLength(2);
    expect(logger.lines).toContain("[dev] api is listening on http://localhost:3011.");
    expect(logger.lines).toContain("[dev] web is listening on http://localhost:3012.");

    await stop.stop();

    expect(children.every((child) => child.kill.mock.calls[0]?.[0] === "SIGTERM")).toBe(true);
  });

  it("fails fast when a child exits during startup", async () => {
    const logger = memoryLogger();
    const spawn = vi.fn((command, args, options) => {
      const child = createMockChild(command, args, options);
      queueMicrotask(() => child.emit("exit", 2, null));
      return child;
    });

    await expect(runDevEnvironment(createDevConfig({}), {
      spawn,
      logger,
      installSignalHandlers: false,
      inspectPort: vi.fn().mockResolvedValue({ available: true }),
      waitForPort: () => new Promise(() => {})
    })).rejects.toThrow("[dev] api exited with code 2.");
  });

  it("prefixes child output by service name", () => {
    expect(prefixOutput("api", Buffer.from("ready\nok"))).toBe("[api] ready\n[api] ok");
  });
});

function createMockChild(command, args, options) {
  const child = new EventEmitter();
  child.command = command;
  child.args = args;
  child.options = options;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.signalCode = null;
  const emit = child.emit.bind(child);
  child.emit = ((event, ...eventArgs) => {
    if (event === "exit") {
      child.exitCode = typeof eventArgs[0] === "number" ? eventArgs[0] : null;
      child.signalCode = typeof eventArgs[1] === "string" ? eventArgs[1] : null;
    }
    return emit(event, ...eventArgs);
  });
  child.kill = vi.fn((signal) => {
    child.killed = true;
    queueMicrotask(() => child.emit("exit", null, signal ?? "SIGTERM"));
    return true;
  });
  child.once = child.once.bind(child);
  child.on = child.on.bind(child);
  return child;
}

function memoryLogger() {
  const lines = [];
  return {
    lines,
    log(message) {
      lines.push(String(message));
    },
    error(message) {
      lines.push(String(message));
    }
  };
}

function silentLogger() {
  return {
    log() {},
    error() {}
  };
}
