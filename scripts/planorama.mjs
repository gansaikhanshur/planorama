#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureRuntime } from "./bootstrap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);
const scripts = {
  review: "launch.ts",
  wait: "wait.ts",
  validate: "validate.ts",
};
if (!command || command === "--help" || command === "-h") {
  console.log(
    "Usage: node scripts/planorama.mjs <setup|review|wait|validate> [arguments]\nSetup prepares the local runtime once. Review also sets it up automatically if needed.",
  );
} else if (command !== "setup" && !Object.hasOwn(scripts, command)) {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
} else {
  try {
    if (command === "setup" && args.length)
      throw new Error("Setup does not accept arguments.");
    const runtime = await ensureRuntime(root);
    if (command === "setup")
      console.log(JSON.stringify({ status: "ready", runtime }));
    else {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(runtime, "scripts", scripts[command]),
          ...args,
        ],
        {
          cwd: runtime,
          stdio: "inherit",
          env: process.env,
        },
      );
      const forward = (signal) => child.kill(signal);
      const interrupt = () => forward("SIGINT");
      const terminate = () => forward("SIGTERM");
      process.on("SIGINT", interrupt);
      process.on("SIGTERM", terminate);
      child.once("error", (error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
      child.once("exit", (code, signal) => {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", terminate);
        process.exitCode = signal ? 1 : (code ?? 1);
      });
    }
  } catch (error) {
    console.error(`Planorama: ${error.message}`);
    process.exitCode = 1;
  }
}
