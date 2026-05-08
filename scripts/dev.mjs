import { spawn } from "node:child_process";

const commands = [
  {
    name: "api",
    command: "pnpm",
    args: ["--filter", "@opendinq/api", "dev"],
    env: {}
  },
  {
    name: "web",
    command: "pnpm",
    args: ["--filter", "@opendinq/web", "dev"],
    env: {
      NEXT_PUBLIC_OPENDINQ_API_URL: process.env.NEXT_PUBLIC_OPENDINQ_API_URL ?? "http://localhost:3001"
    }
  }
];

const children = commands.map(({ name, command, args, env }) => {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(prefix(name, chunk)));
  child.stderr.on("data", (chunk) => process.stderr.write(prefix(name, chunk)));
  child.on("exit", (code, signal) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      stopAll();
      process.exit(code);
    }

    if (signal) {
      console.error(`[${name}] exited with signal ${signal}`);
    }
  });

  return child;
});

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopAll();
  process.exit(143);
});

function stopAll() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

function prefix(name, chunk) {
  return chunk
    .toString()
    .split(/\r?\n/)
    .map((line) => (line ? `[${name}] ${line}` : line))
    .join("\n");
}
