import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasCurrentBuild } from "../lib/runtime";
import { emptyReview } from "../lib/schema";
import { hashSource } from "../lib/import";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function freePort() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}
function launch(args: string[], foreground = true) {
  const started = performance.now();
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(appDir, "scripts/launch.ts"),
      ...args,
      "--no-open",
      ...(foreground ? ["--foreground"] : []),
    ],
    { cwd: appDir, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let readyTime = 0;
  let readyResolve: () => void;
  let readyReject: (reason: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const record = (chunk: Buffer) => {
    output += chunk.toString();
    if (!readyTime && /^Ready in \d+ ms/m.test(output)) {
      readyTime = performance.now() - started;
      readyResolve();
    }
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  child.on("error", (error) => readyReject(error));
  const closed = new Promise<number>((resolve) =>
    child.once("exit", (code) => {
      if (!readyTime) readyReject(new Error(output));
      resolve(code ?? 0);
    }),
  );
  // Some cases intentionally exit before becoming ready.
  void ready.catch(() => {});
  return {
    ready,
    closed,
    output: () => output,
    readyTime: () => Math.round(readyTime),
    stop: async () => {
      if (child.exitCode === null) child.kill("SIGTERM");
      await closed;
    },
  };
}

test(
  "cached startup opens two isolated reviews, reuses only matching sessions, and preserves feedback",
  { timeout: 30000 },
  async (t) => {
    assert(
      await hasCurrentBuild(appDir),
      "Run npm run build before this integration check",
    );
    const output = await mkdtemp(path.join(tmpdir(), "planorama-startup-"));
    const sourcePath = path.join(output, "plan.md");
    const modelPath = path.join(output, "model.json");
    await writeFile(
      sourcePath,
      "# Calculator CLI\n\nUse a safe arithmetic parser.\nReject division by zero.\nPrint the result and exit.\n",
    );
    await writeFile(
      modelPath,
      JSON.stringify({
        schemaVersion: 1,
        id: "calculator-cli",
        revision: "1",
        title: "Calculator CLI",
        summary: "Parse arithmetic safely and report useful errors.",
        extraction: "agent",
        objects: [
          {
            id: "safe-parser",
            kind: "decision",
            title: "Use a safe arithmetic parser",
            summary: "Evaluate arithmetic without executing code.",
            source: { startLine: 3, endLine: 3 },
          },
          {
            id: "division-by-zero",
            kind: "risk",
            title: "Reject division by zero",
            summary: "Return a clear error.",
            source: { startLine: 4, endLine: 4 },
          },
        ],
      }),
    );
    const port = await freePort();
    const args = [
      sourcePath,
      "--model",
      modelPath,
      "--out",
      path.join(output, "first"),
      "--port",
      String(port),
    ];
    const first = launch(args);
    t.after(() => first.stop());
    await first.ready;
    assert.match(first.output(), /Runtime: cached production/);
    const url = `http://127.0.0.1:${port}`;
    const session = await (await fetch(`${url}/api/session`)).json();
    assert.equal(session.plan.title, "Calculator CLI");
    const review = emptyReview(
      session.plan,
      session.source.hash,
      hashSource(JSON.stringify(session.plan)),
    );
    review.overallNote = "Preserve this feedback";
    const reviewPath = path.join(output, "first/review.json");
    await writeFile(reviewPath, JSON.stringify(review));
    const originalReview = await readFile(reviewPath, "utf8");
    const originalSession = await readFile(session.sessionPath, "utf8");
    const reuse = launch(args);
    t.after(() => reuse.stop());
    assert.equal(await reuse.closed, 0, reuse.output());
    assert.match(reuse.output(), /Reusing running review/);
    assert.equal(await readFile(reviewPath, "utf8"), originalReview);
    assert.equal(await readFile(session.sessionPath, "utf8"), originalSession);
    const collision = launch([
      sourcePath,
      "--model",
      modelPath,
      "--out",
      path.join(output, "second"),
      "--port",
      String(port),
    ]);
    t.after(() => collision.stop());
    assert.equal(await collision.closed, 1);
    assert.match(collision.output(), /another session or service/);
    const secondPort = await freePort();
    const second = launch(
      [
        sourcePath,
        "--model",
        modelPath,
        "--out",
        path.join(output, "second"),
        "--port",
        String(secondPort),
      ],
      false,
    );
    t.after(() => second.stop());
    await second.ready;
    assert.equal(await second.closed, 0, second.output());
    const server = JSON.parse(
      await readFile(path.join(output, "second/server.json"), "utf8"),
    );
    t.after(() => {
      try {
        process.kill(server.pid, "SIGTERM");
      } catch {}
    });
    assert.equal(
      (await fetch(`http://127.0.0.1:${secondPort}/api/session`)).status,
      200,
    );
    assert.match(second.output(), /Runtime: cached production/);
    assert.equal(
      (await (await fetch(`${url}/api/session`)).json()).review.overallNote,
      "Preserve this feedback",
    );
    console.log(
      JSON.stringify({
        cachedStartupMs: first.readyTime(),
        reuseMs: reuse.readyTime(),
        secondSessionMs: second.readyTime(),
      }),
    );
  },
);
