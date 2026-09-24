import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { planSchema } from "./schema";
import { hashSource } from "./import";

export const productionDirectory = ".planorama-build";

// Review content is runtime data; only app code/configuration invalidates a build.
export async function runtimeFingerprint(appDir: string): Promise<string> {
  const files: string[] = [];
  async function collect(relative: string) {
    let entries;
    try {
      entries = await readdir(path.join(appDir, relative), {
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) await collect(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  await Promise.all(["app", "components", "lib", "public"].map(collect));
  files.push(
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
  );
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const body = await readFile(path.join(appDir, file));
    hash
      .update(file)
      .update("\0")
      .update(String(body.length))
      .update("\0")
      .update(body);
  }
  return hash.digest("hex");
}

export async function currentBuildDirectory(
  appDir: string,
): Promise<string | null> {
  try {
    const [stamp, fingerprint] = await Promise.all([
      readFile(
        path.join(appDir, productionDirectory, "planorama-build.json"),
        "utf8",
      ),
      runtimeFingerprint(appDir),
    ]);
    const metadata = JSON.parse(stamp);
    const directory = metadata.directory ?? productionDirectory;
    if (
      directory !== productionDirectory &&
      !/^\.planorama-build\/releases\/[a-f0-9-]+$/.test(directory)
    )
      return null;
    const buildId = await readFile(
      path.join(appDir, directory, "BUILD_ID"),
      "utf8",
    );
    return metadata.fingerprint === fingerprint &&
      metadata.buildId === buildId.trim()
      ? directory
      : null;
  } catch {
    return null;
  }
}
export async function hasCurrentBuild(appDir: string): Promise<boolean> {
  return Boolean(await currentBuildDirectory(appDir));
}

export function matchesRunningSession(
  candidate: unknown,
  expected: {
    sessionPath: string;
    sourcePath: string;
    sourceHash: string;
    modelHash: string;
    runtimeFingerprint: string;
  },
): boolean {
  try {
    const running = candidate as {
      sessionPath: string;
      source: { path: string; hash: string };
      plan: unknown;
      runtime?: { mode: string; fingerprint: string | null };
    };
    return (
      (running.runtime?.mode === "development" ||
        running.runtime?.fingerprint === expected.runtimeFingerprint) &&
      running.sessionPath === expected.sessionPath &&
      running.source.path === expected.sourcePath &&
      running.source.hash === expected.sourceHash &&
      hashSource(JSON.stringify(planSchema.parse(running.plan))) ===
        expected.modelHash
    );
  } catch {
    return false;
  }
}
