import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureRuntime,
  sourceIdentity,
  checkNode,
  runtimeEntries,
} from "../scripts/bootstrap.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "planorama-bootstrap-"));
  const source = path.join(root, "source");
  await mkdir(source);
  for (const name of runtimeEntries) {
    if (name.includes(".")) await writeFile(path.join(source, name), "{}");
    else await mkdir(path.join(source, name));
  }
  await writeFile(path.join(source, "app/page.tsx"), "original app");
  return { root, source, home: path.join(root, "runtime cache") };
}
async function prepare(directory: string) {
  for (const name of [
    "node_modules/next/dist/bin",
    "node_modules/tsx",
    ".planorama-build/releases/abc",
  ])
    await mkdir(path.join(directory, name), { recursive: true });
  await writeFile(
    path.join(directory, "node_modules/next/dist/bin/next"),
    "runtime",
  );
  await writeFile(path.join(directory, "node_modules/tsx/package.json"), "{}");
  await writeFile(
    path.join(directory, ".planorama-build/releases/abc/BUILD_ID"),
    "build-one",
  );
  await writeFile(
    path.join(directory, ".planorama-build/planorama-build.json"),
    JSON.stringify({
      directory: ".planorama-build/releases/abc",
      buildId: "build-one",
    }),
  );
}

test("simultaneous first use prepares once, reuses the runtime, and leaves package files untouched", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  let calls = 0;
  const options = {
    home: f.home,
    log: () => {},
    prepare: async (dir: string) => {
      calls++;
      await new Promise((r) => setTimeout(r, 40));
      await prepare(dir);
    },
  };
  const before = await sourceIdentity(f.source);
  const [first, second] = await Promise.all([
    ensureRuntime(f.source, options),
    ensureRuntime(f.source, options),
  ]);
  assert.equal(first, second);
  assert.equal(calls, 1);
  assert.equal(await ensureRuntime(f.source, options), first);
  assert.equal(calls, 1);
  assert.deepEqual(await sourceIdentity(f.source), before);
  await assert.rejects(readFile(path.join(f.source, "ready.json")), {
    code: "ENOENT",
  });
  await rm(path.join(first, "node_modules/tsx/package.json"));
  await ensureRuntime(f.source, options);
  assert.equal(calls, 2, "incomplete runtimes must be repaired");
});

test("failed setup releases its lock and can be retried without claiming readiness", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = {
    home: f.home,
    log: () => {},
    prepare: async () => {
      throw new Error("offline");
    },
  };
  await assert.rejects(ensureRuntime(f.source, options), /offline/);
  const dir = await ensureRuntime(f.source, { ...options, prepare });
  assert.ok(
    JSON.parse(await readFile(path.join(dir, "ready.json"), "utf8")).key,
  );
});

test("changed runtime files create a new cache while review data and hidden files do not", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const options = { home: f.home, log: () => {}, prepare };
  const first = await ensureRuntime(f.source, options);
  await writeFile(path.join(f.source, "public/.DS_Store"), "machine metadata");
  await mkdir(path.join(f.source, "examples/.planorama"));
  await writeFile(
    path.join(f.source, "examples/.planorama/review.json"),
    "private feedback",
  );
  assert.equal(await ensureRuntime(f.source, options), first);
  await writeFile(path.join(f.source, "app/page.tsx"), "updated app");
  assert.notEqual(await ensureRuntime(f.source, options), first);
  assert.equal(
    await readFile(path.join(first, "app/page.tsx"), "utf8"),
    "original app",
  );
});

test("unsupported Node versions fail before attempting setup", () => {
  assert.throws(() => checkNode("20.19.0"), /22.13/);
  assert.throws(() => checkNode("22.12.0"), /22.13/);
  checkNode("22.13.0");
  checkNode("24.0.0");
});
