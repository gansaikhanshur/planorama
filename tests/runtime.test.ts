import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  hasCurrentBuild,
  matchesRunningSession,
  productionDirectory,
  runtimeFingerprint,
} from "../lib/runtime";
import { hashSource } from "../lib/import";
import { planSchema } from "../lib/schema";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "planorama-runtime-"));
  for (const name of [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
  ])
    await writeFile(path.join(root, name), "{}");
  for (const name of ["app", "public", productionDirectory])
    await mkdir(path.join(root, name));
  await writeFile(path.join(root, "app/page.tsx"), "original UI");
  await writeFile(path.join(root, "public/logo.png"), "original logo");
  return root;
}

test("cached builds remain valid for plan edits but invalidate for UI, assets, config, and missing build output", async () => {
  const root = await fixture();
  assert.equal(await hasCurrentBuild(root), false);
  const stamp = async () => {
    await writeFile(
      path.join(root, productionDirectory, "BUILD_ID"),
      "build-one\n",
    );
    await writeFile(
      path.join(root, productionDirectory, "planorama-build.json"),
      JSON.stringify({
        fingerprint: await runtimeFingerprint(root),
        buildId: "build-one",
      }),
    );
  };
  await stamp();
  await writeFile(path.join(root, "plan.md"), "different user plan");
  assert.equal(await hasCurrentBuild(root), true);
  for (const name of [
    "app/page.tsx",
    "public/logo.png",
    "package-lock.json",
    "next.config.ts",
  ]) {
    await writeFile(path.join(root, name), "changed content");
    assert.equal(await hasCurrentBuild(root), false, name);
    await stamp();
    assert.equal(await hasCurrentBuild(root), true);
  }
  await writeFile(
    path.join(root, productionDirectory, "BUILD_ID"),
    "different-build",
  );
  assert.equal(await hasCurrentBuild(root), false);
  await writeFile(
    path.join(root, productionDirectory, "planorama-build.json"),
    "incomplete",
  );
  assert.equal(await hasCurrentBuild(root), false);
});

test("server reuse requires the same source, semantic model, output session, and current production app", async () => {
  const plan = planSchema.parse(
    JSON.parse(
      await readFile(new URL("../examples/plan.json", import.meta.url), "utf8"),
    ),
  );
  const expected = {
    sessionPath: "/tmp/review/session.json",
    sourcePath: "/tmp/plan.md",
    sourceHash: "source-hash",
    modelHash: hashSource(JSON.stringify(plan)),
    runtimeFingerprint: "current-app",
  };
  const running = {
    sessionPath: expected.sessionPath,
    source: { path: expected.sourcePath, hash: expected.sourceHash },
    plan,
    runtime: { mode: "production", fingerprint: "current-app" },
  };
  assert.equal(matchesRunningSession(running, expected), true);
  for (const key of Object.keys(expected) as (keyof typeof expected)[])
    assert.equal(
      matchesRunningSession(running, { ...expected, [key]: "different" }),
      false,
      key,
    );
  assert.equal(
    matchesRunningSession(
      { ...running, plan: { ...plan, summary: "Changed reasoning" } },
      expected,
    ),
    false,
  );
  assert.equal(
    matchesRunningSession(
      { ...running, runtime: { mode: "development", fingerprint: null } },
      expected,
    ),
    true,
  );
  assert.equal(
    matchesRunningSession({ something: "another local app" }, expected),
    false,
  );
});
