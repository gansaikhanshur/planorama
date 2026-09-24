import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { productionDirectory, runtimeFingerprint } from "../lib/runtime";

async function main() {
  const appDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const before = await runtimeFingerprint(appDir);
  // Keep files used by existing servers intact while publishing a new cached build.
  const relativeDirectory = `${productionDirectory}/releases/${randomUUID()}`;
  const directory = path.join(appDir, relativeDirectory);
  await mkdir(directory, { recursive: true });
  const tsconfigPath = `${productionDirectory}/tsconfig.json`;
  await writeFile(
    path.join(appDir, tsconfigPath),
    JSON.stringify(
      {
        extends: "../tsconfig.json",
        include: [
          "*.ts",
          ...["app", "components", "lib", "scripts", "tests"].flatMap((dir) => [
            `${dir}/**/*.ts`,
            `${dir}/**/*.tsx`,
          ]),
          `${relativeDirectory}/types/**/*.ts`,
        ].map((file) => path.join(appDir, file)),
        exclude: [path.join(appDir, "node_modules")],
      },
      null,
      2,
    ),
  );
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(appDir, "node_modules/next/dist/bin/next"),
        "build",
        "--webpack",
      ],
      {
        cwd: appDir,
        stdio: "inherit",
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          PLANORAMA_BUILD_DIRECTORY: relativeDirectory,
          PLANORAMA_BUILD_TSCONFIG: tsconfigPath,
        },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (code !== 0) {
    process.exitCode = code;
    return;
  }
  if (before !== (await runtimeFingerprint(appDir)))
    throw new Error(
      "App files changed during the build; run npm run build again.",
    );
  const buildId = (
    await readFile(path.join(directory, "BUILD_ID"), "utf8")
  ).trim();
  await writeFile(
    path.join(appDir, productionDirectory, "planorama-build.json.tmp"),
    JSON.stringify({
      fingerprint: before,
      buildId,
      directory: relativeDirectory,
    }),
  );
  await rename(
    path.join(appDir, productionDirectory, "planorama-build.json.tmp"),
    path.join(appDir, productionDirectory, "planorama-build.json"),
  );
  console.log(
    "Planorama's cached runtime is ready. Subsequent reviews skip compilation.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
