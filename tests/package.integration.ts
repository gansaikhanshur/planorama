import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packagePlugin } from "../scripts/package-plugin.mjs";

const execute = promisify(execFile);
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function freePort() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

test(
  "an extracted plugin prepares independently, reuses setup, and delivers revision and approval feedback",
  { timeout: 240000 },
  async (t) => {
    const temporary = await mkdtemp(
      path.join(tmpdir(), "planorama package with spaces "),
    );
    t.after(() => rm(temporary, { recursive: true, force: true }));
    const bundle = await packagePlugin(
      source,
      path.join(temporary, "artifacts"),
    );
    const extracted = path.join(temporary, "installed");
    await mkdir(extracted);
    await execute("tar", ["-xzf", bundle.archive, "-C", extracted]);
    const distribution = path.join(extracted, path.basename(bundle.directory));
    const plugin = path.join(distribution, "plugins/planorama");
    const manifest = JSON.parse(
      await readFile(path.join(distribution, "PACKAGE.json"), "utf8"),
    );
    assert.ok(manifest.files.length > 30);
    for (const file of manifest.files)
      assert.doesNotMatch(
        file.file,
        /node_modules|\.planorama\/|\.env|\.DS_Store|\.git\//,
      );
    await assert.rejects(access(path.join(plugin, "node_modules")), {
      code: "ENOENT",
    });
    const env = {
      ...process.env,
      PLANORAMA_RUNTIME_HOME: path.join(temporary, "fresh runtime cache"),
    };
    const cli = path.join(plugin, "scripts/planorama.mjs");
    const invoke = (...args: string[]) =>
      execute(process.execPath, [cli, ...args], {
        cwd: temporary,
        env,
        timeout: 180000,
        maxBuffer: 2_000_000,
      });
    const start = performance.now();
    const setup = await invoke("setup");
    const runtime = JSON.parse(setup.stdout).runtime;
    assert.ok(runtime.startsWith(env.PLANORAMA_RUNTIME_HOME));
    assert.match(setup.stderr, /Preparing Planorama/);
    const secondStart = performance.now();
    const second = await invoke("setup");
    assert.equal(JSON.parse(second.stdout).runtime, runtime);
    assert.equal(
      second.stderr,
      "",
      "prepared runtime must not reinstall or rebuild",
    );
    console.log(
      JSON.stringify({
        setupMs: Math.round(secondStart - start),
        reuseMs: Math.round(performance.now() - secondStart),
        archiveBytes: (await readFile(bundle.archive)).length,
      }),
    );
    await assert.rejects(access(path.join(plugin, "node_modules")), {
      code: "ENOENT",
    });
    await assert.rejects(access(path.join(plugin, ".planorama-build")), {
      code: "ENOENT",
    });
    const planPath = path.join(temporary, "plan.md");
    const modelPath = path.join(temporary, "planorama.json");
    let markdown = "# Calculator CLI\n\nUse a safe arithmetic parser.\n";
    const model = {
      schemaVersion: 1,
      id: "calculator-cli",
      revision: "1",
      title: "Calculator CLI",
      summary: "Evaluate arithmetic safely.",
      extraction: "agent",
      objects: [
        {
          id: "parser",
          kind: "decision",
          title: "Use a safe arithmetic parser",
          summary: "Evaluate arithmetic without executing code.",
          source: { startLine: 3, endLine: 3 },
        },
      ],
    };
    await writeFile(planPath, markdown);
    let previousUrl = "";
    for (const [index, disposition] of [
      "request_changes",
      "approved",
    ].entries()) {
      model.revision = String(index + 1);
      await writeFile(modelPath, JSON.stringify(model));
      const output = path.join(temporary, `review-${index}`);
      const port = await freePort();
      const url = `http://127.0.0.1:${port}`;
      const launch = await invoke(
        "review",
        planPath,
        "--model",
        modelPath,
        "--out",
        output,
        "--port",
        String(port),
        "--no-open",
      );
      const server = JSON.parse(
        await readFile(path.join(output, "server.json"), "utf8"),
      );
      t.after(() => {
        try {
          process.kill(server.pid, "SIGTERM");
        } catch {}
      });
      assert.match(launch.stdout, /Runtime: cached production/);
      const page = await fetch(url);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /Calculator CLI/);
      const session = await (await fetch(`${url}/api/session`)).json();
      assert.equal(session.plan.revision, String(index + 1));
      assert.equal(session.plan.relationshipMap, undefined);
      const waiting = invoke(
        "wait",
        "--session",
        path.join(output, "session.json"),
        "--timeout",
        "15",
      );
      // Attach a rejection handler immediately, even if a later assertion fails.
      void waiting.catch(() => {});
      for (let count = 0; count < 100; count++) {
        if ((await (await fetch(`${url}/api/handoff`)).json()).connected) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(
        (await (await fetch(`${url}/api/handoff`)).json()).connected,
        true,
      );
      const review = {
        ...session.review,
        disposition,
        overallNote:
          index === 0 ? "Explain how division by zero is handled." : "",
      };
      const response = await fetch(`${url}/api/review`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: url },
        body: JSON.stringify({
          review,
          expectedUpdatedAt: session.review.updatedAt,
          finalize: true,
        }),
      });
      assert.equal(response.status, 200, await response.text());
      const delivered = JSON.parse((await waiting).stdout);
      assert.equal(delivered.status, "review_finished");
      assert.equal(delivered.review.disposition, disposition);
      assert.equal(delivered.review.overallNote, review.overallNote);
      // Previously delivered reviews keep wait's exit code 2 and are not submitted twice.
      await assert.rejects(
        invoke(
          "wait",
          "--session",
          path.join(output, "session.json"),
          "--timeout",
          "0.1",
        ),
        (error) => {
          const result = error as Error & { code: number; stdout: string };
          return (
            result.code === 2 && JSON.parse(result.stdout).status === "waiting"
          );
        },
      );
      if (previousUrl)
        assert.equal(
          (await (await fetch(`${previousUrl}/api/session`)).json()).plan
            .revision,
          "1",
        );
      markdown += "Reject division by zero with a clear error.\n";
      await writeFile(planPath, markdown);
      previousUrl = url;
    }
  },
);
