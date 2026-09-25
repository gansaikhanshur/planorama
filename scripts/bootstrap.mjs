import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rm,
  lstat,
  writeFile,
  rename,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// An allowlist keeps project plans, credentials, caches, and installed dependencies out.
export const runtimeEntries = [
  "app",
  "components",
  "lib",
  "public",
  "examples",
  "scripts",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
];

export async function sourceFiles(root, entries = runtimeEntries) {
  const files = [];
  async function visit(relative) {
    const info = await lstat(path.join(root, relative), {
      throwIfNoEntry: false,
    });
    if (!info) throw new Error(`Missing package file: ${relative}`);
    if (info.isSymbolicLink())
      throw new Error(`Package symlinks are not supported: ${relative}`);
    if (info.isDirectory()) {
      for (const entry of await readdir(path.join(root, relative), {
        withFileTypes: true,
      })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules")
          continue;
        if (entry.isSymbolicLink())
          throw new Error(
            `Package symlinks are not supported: ${relative}/${entry.name}`,
          );
        await visit(path.join(relative, entry.name));
      }
    } else if (info.isFile()) files.push(relative);
  }
  for (const entry of entries) await visit(entry);
  return files.sort();
}

export async function sourceIdentity(root) {
  const files = await sourceFiles(root);
  const hash = createHash("sha256");
  hash.update(
    `${process.platform}/${process.arch}/node-${process.versions.node.split(".")[0]}\0`,
  );
  for (const file of files) {
    const body = await readFile(path.join(root, file));
    hash
      .update(file.split(path.sep).join("/"))
      .update("\0")
      .update(String(body.length))
      .update("\0")
      .update(body);
  }
  return { key: hash.digest("hex"), files };
}

export function runtimeHome(env = process.env) {
  if (env.PLANORAMA_RUNTIME_HOME) {
    if (!path.isAbsolute(env.PLANORAMA_RUNTIME_HOME))
      throw new Error("PLANORAMA_RUNTIME_HOME must be an absolute path.");
    return env.PLANORAMA_RUNTIME_HOME;
  }
  const cache =
    process.platform === "darwin"
      ? path.join(homedir(), "Library", "Caches")
      : process.platform === "win32"
        ? env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local")
        : env.XDG_CACHE_HOME || path.join(homedir(), ".cache");
  return path.join(cache, "planorama", "runtimes");
}

export function checkNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error(
      `Planorama requires Node.js 22.13 or newer; found ${version}.`,
    );
}

export async function run(command, args, options = {}) {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (code !== 0)
    throw new Error(`${path.basename(command)} exited with code ${code}.`);
}

async function prepared(directory, key) {
  try {
    const marker = JSON.parse(
      await readFile(path.join(directory, "ready.json"), "utf8"),
    );
    const build = JSON.parse(
      await readFile(
        path.join(directory, ".planorama-build/planorama-build.json"),
        "utf8",
      ),
    );
    if (
      marker.key !== key ||
      !/^\.planorama-build\/releases\/[a-f0-9-]+$/.test(build.directory)
    )
      return false;
    if (
      (
        await readFile(
          path.join(directory, build.directory, "BUILD_ID"),
          "utf8",
        )
      ).trim() !== build.buildId
    )
      return false;
    await access(path.join(directory, "node_modules/next/dist/bin/next"));
    await access(path.join(directory, "node_modules/tsx/package.json"));
    return true;
  } catch {
    return false;
  }
}

async function installAndBuild(directory) {
  // npm's CLI is a script. Resolve it next to Node or on PATH without a shell.
  const npmName = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmCandidates = [
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    ),
    path.join(
      path.dirname(process.execPath),
      "../lib/node_modules/npm/bin/npm-cli.js",
    ),
    ...(process.env.PATH || "")
      .split(path.delimiter)
      .map((dir) => path.join(dir, npmName)),
  ];
  let npm;
  for (const candidate of npmCandidates) {
    try {
      await access(candidate);
      if (candidate.endsWith(".cmd")) continue;
      npm = candidate;
      break;
    } catch {}
  }
  if (!npm)
    throw new Error(
      "npm was not found. Install Node.js with npm, then rerun setup.",
    );
  // Send setup output to stderr so review/wait stdout remains machine-readable.
  const options = {
    cwd: directory,
    stdio: ["ignore", 2, 2],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  };
  await run(
    process.execPath,
    [npm, "ci", "--include=dev", "--no-audit", "--no-fund"],
    options,
  );
  await run(process.execPath, ["--import", "tsx", "scripts/build.ts"], options);
}

export async function ensureRuntime(
  root,
  { home = runtimeHome(), prepare = installAndBuild, log = console.error } = {},
) {
  checkNode();
  const { key, files } = await sourceIdentity(root);
  const directory = path.join(home, key);
  if (await prepared(directory, key)) return directory;
  await mkdir(home, { recursive: true, mode: 0o700 });
  const lockPath = path.join(home, `${key}.lock`);
  const deadline = Date.now() + 10 * 60 * 1000;
  let lock;
  let reportedWait = false;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await prepared(directory, key)) return directory;
      if (!reportedWait) {
        log("Waiting for another Planorama setup to finish…");
        reportedWait = true;
      }
      try {
        const owner = JSON.parse(await readFile(lockPath, "utf8"));
        if (Number.isInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0);
          } catch (error) {
            if (error.code === "ESRCH")
              throw new Error(
                `A previous setup stopped unexpectedly. Remove the stale lock ${lockPath} and run setup again.`,
              );
          }
        }
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError))
          throw error;
      }
      if (Date.now() > deadline)
        throw new Error(
          `Timed out waiting for setup. Inspect ${lockPath} before retrying.`,
        );
      await delay(250);
    }
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    if (await prepared(directory, key)) return directory;
    log(
      "Preparing Planorama for first use: installing dependencies and building the local review app. This runs once per runtime version.",
    );
    log(`Runtime directory: ${directory}`);
    // This content-addressed directory is owned by setup; failed partial builds are replaceable.
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    for (const entry of runtimeEntries) {
      if ((await lstat(path.join(root, entry))).isDirectory())
        await mkdir(path.join(directory, entry), { recursive: true });
    }
    for (const file of files) {
      const target = path.join(directory, file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, file), target);
    }
    if ((await sourceIdentity(directory)).key !== key)
      throw new Error("Package files changed during setup. Run setup again.");
    await prepare(directory);
    await writeFile(
      path.join(directory, "ready.json.tmp"),
      JSON.stringify({ key }),
      { mode: 0o600 },
    );
    await rename(
      path.join(directory, "ready.json.tmp"),
      path.join(directory, "ready.json"),
    );
    if (!(await prepared(directory, key))) {
      await rm(path.join(directory, "ready.json"), { force: true });
      throw new Error(
        "Setup did not produce a complete runtime. Run setup again.",
      );
    }
    log("Planorama is ready. Subsequent reviews reuse this runtime.");
    return directory;
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
