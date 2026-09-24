#!/usr/bin/env node
import { readFile, mkdir, writeFile, open } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { planSchema, validateReview } from "../lib/schema";
import { hashSource, importMarkdown, validateSource } from "../lib/import";
import { readSessionConfig, resumeCommand } from "../lib/resume";
import {
  currentBuildDirectory,
  matchesRunningSession,
  runtimeFingerprint,
} from "../lib/runtime";

function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  const opener = spawn(command, [url], { stdio: "ignore" });
  opener.on("error", () => console.log(`Open ${url} in your browser.`));
  opener.unref();
}

async function main() {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string" },
      session: { type: "string" },
      port: { type: "string", default: "4317" },
      out: { type: "string" },
      "no-open": { type: "boolean", default: false },
      dev: { type: "boolean", default: false },
      foreground: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: npm run review -- /absolute/path/plan.md [--model plan.json] [--port 4317] [--out directory] [--no-open] [--dev] [--foreground]\nResume: npm run review -- --session /absolute/path/session.json [--port 4317] [--no-open]\nWithout a plan path, opens the bundled example. Returns when ready; use --foreground to keep the server attached.",
    );
    return;
  }
  if (positionals.length > 1)
    throw new Error("Provide only one Markdown plan path.");
  const appDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const appFingerprint = await runtimeFingerprint(appDir);
  if (values.session && (positionals.length || values.model || values.out))
    throw new Error(
      "--session cannot be combined with a plan path, --model, or --out.",
    );
  const resumed = values.session
    ? await readSessionConfig(path.resolve(values.session))
    : null;
  const sourcePath = path.resolve(
    resumed?.sourcePath ??
      positionals[0] ??
      path.join(appDir, "examples/plan.md"),
  );
  const markdown = await readFile(sourcePath, "utf8");
  if (Buffer.byteLength(markdown) > 1_000_000)
    throw new Error(
      "Plan exceeds the 1 MB limit. Split it into smaller review sessions.",
    );
  const modelPath = values.model
    ? path.resolve(values.model)
    : !positionals[0]
      ? path.join(appDir, "examples/plan.json")
      : null;
  const plan =
    resumed?.plan ??
    (modelPath
      ? planSchema.parse(JSON.parse(await readFile(modelPath, "utf8")))
      : importMarkdown(markdown, sourcePath));
  validateSource(plan, markdown);
  const sourceHash = hashSource(markdown);
  if (resumed && resumed.sourceHash !== sourceHash)
    throw new Error(
      "The source plan changed. Launch a fresh review for the new source; the saved review remains in its original directory.",
    );
  // Isolate each source AND semantic-model revision. Previous reviews remain available for the agent.
  const key = hashSource(sourceHash + JSON.stringify(plan)).slice(0, 16);
  const outputDir = path.resolve(
    resumed?.outputDir ??
      values.out ??
      path.join(path.dirname(sourcePath), ".planorama", `${plan.id}-${key}`),
  );
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Port must be an integer from 1024 to 65535.");
  const sessionPath = values.session
    ? path.resolve(values.session)
    : path.join(outputDir, "session.json");
  const url = `http://127.0.0.1:${port}`;
  const available = await new Promise<boolean>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
  if (!available) {
    try {
      const response = await fetch(`${url}/api/session`, {
        signal: AbortSignal.timeout(2000),
      });
      if (
        response.ok &&
        matchesRunningSession(await response.json(), {
          sessionPath,
          sourcePath,
          sourceHash,
          runtimeFingerprint: appFingerprint,
          modelHash: hashSource(JSON.stringify(plan)),
        })
      ) {
        console.log(
          `Reusing running review: ${url}\nSession file: ${sessionPath}\nReady in ${elapsed()} ms (existing server; agent preparation time excluded).`,
        );
        if (!values["no-open"]) openBrowser(url);
        return;
      }
    } catch {
      /* A busy port is not necessarily Planorama. */
    }
    throw new Error(
      `Port ${port} is in use by another session or service. Choose another with --port; the existing review was not changed.`,
    );
  }
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  // Refuse to repoint a review directory at a different source or model.
  try {
    const prior = JSON.parse(
      await readFile(path.join(outputDir, "review.json"), "utf8"),
    );
    validateReview(prior, plan, sourceHash, hashSource(JSON.stringify(plan)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error(
        `Cannot reuse this review directory. Choose a fresh --out directory. ${error instanceof Error ? error.message : ""}`,
      );
  }
  if (!resumed || resumed.sourceMarkdown === undefined)
    await writeFile(
      sessionPath,
      JSON.stringify(
        {
          plan,
          sourcePath,
          sourceMarkdown: markdown,
          sourceHash,
          outputDir,
          demo: resumed?.demo ?? !positionals[0],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  console.log(
    `Session file: ${sessionPath}\nResume this review: ${resumeCommand(appDir, sessionPath, String(port))}`,
  );
  console.log(
    `\nPlanorama · ${plan.title}\n${url}\nReview files: ${outputDir}\n${plan.extraction === "basic" ? "Basic import: use --model with an agent-extracted semantic plan for a full review.\n" : ""}`,
  );
  const buildDirectory = values.dev
    ? null
    : await currentBuildDirectory(appDir);
  const production = Boolean(buildDirectory);
  console.log(
    `Prepared in ${elapsed()} ms. Runtime: ${production ? "cached production" : "development"}.`,
  );
  if (!production && !values.dev)
    console.log(
      "Run npm run build once to cache the production runtime for faster reviews.",
    );
  const foreground = values.foreground || values.dev;
  const logPath = path.join(outputDir, "server.log");
  const log = foreground ? null : await open(logPath, "a", 0o600);
  const child = spawn(
    process.execPath,
    [
      path.join(appDir, "node_modules/next/dist/bin/next"),
      production ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: appDir,
      env: {
        ...process.env,
        PLANORAMA_SESSION: sessionPath,
        PLANORAMA_PORT: String(port),
        PLANORAMA_RUNTIME_FINGERPRINT: appFingerprint,
        ...(buildDirectory
          ? { PLANORAMA_BUILD_DIRECTORY: buildDirectory }
          : {}),
        NEXT_TELEMETRY_DISABLED: "1",
      },
      detached: !foreground,
      stdio: log ? ["ignore", log.fd, log.fd] : "inherit",
    },
  );
  await log?.close();
  let stopped = false;
  let ready = false;
  const stop = () => {
    stopped = true;
    child.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stopped = true;
  });
  child.on("exit", (code) => {
    stopped = true;
    process.exitCode = process.exitCode || code || (ready ? 0 : 1);
  });
  // Warm the real page, not just the API, and report bounded startup timing even with --no-open.
  const deadline = performance.now() + 60000;
  while (performance.now() < deadline && !stopped) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        await response.text();
        const sessionResponse = await fetch(`${url}/api/session`, {
          signal: AbortSignal.timeout(2000),
        });
        if (
          sessionResponse.ok &&
          matchesRunningSession(await sessionResponse.json(), {
            sessionPath,
            sourcePath,
            sourceHash,
            runtimeFingerprint: appFingerprint,
            modelHash: hashSource(JSON.stringify(plan)),
          })
        ) {
          ready = true;
          console.log(
            `Ready in ${elapsed()} ms (${production ? "cached production" : "development"}; agent preparation time excluded).`,
          );
          if (!foreground) {
            await writeFile(
              path.join(outputDir, "server.json"),
              JSON.stringify({ pid: child.pid, url, logPath, sessionPath }),
              { mode: 0o600 },
            );
            child.unref();
            console.log(
              `Server running in background (PID ${child.pid}). Log: ${logPath}\nStop server: kill ${child.pid}`,
            );
          }
          if (!values["no-open"]) openBrowser(url);
          return;
        }
      }
    } catch {
      /* Wait for the local server to become ready. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (stopped && !foreground)
    console.error(`Server stopped before it was ready. Check ${logPath}.`);
  if (!stopped) {
    console.error(
      `Planorama did not become ready within 60 seconds. Check ${foreground ? "the server output above" : logPath}.`,
    );
    process.exitCode = 1;
    stop();
  }
}
main().catch((error) => {
  console.error(`Planorama: ${error.message}`);
  process.exitCode = 1;
});
