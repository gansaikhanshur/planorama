import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deliveryStatus, pendingHandoff, waitForReview } from "../lib/handoff";
import { emptyReview, planSchema } from "../lib/schema";
import { hashSource } from "../lib/import";

async function fixture() {
  const outputDir = await mkdtemp(path.join(tmpdir(), "planorama-handoff-"));
  const plan = planSchema.parse(
    JSON.parse(
      await readFile(new URL("../examples/plan.json", import.meta.url), "utf8"),
    ),
  );
  const source = await readFile(
    new URL("../examples/plan.md", import.meta.url),
    "utf8",
  );
  const sourcePath = path.join(outputDir, "plan.md");
  const sessionPath = path.join(outputDir, "session.json");
  await writeFile(sourcePath, source);
  await writeFile(
    sessionPath,
    JSON.stringify({
      plan,
      sourcePath,
      sourceHash: hashSource(source),
      outputDir,
    }),
  );
  const review = emptyReview(
    plan,
    hashSource(source),
    hashSource(JSON.stringify(plan)),
  );
  const save = () =>
    writeFile(path.join(outputDir, "review.json"), JSON.stringify(review));
  const finish = async () => {
    await save();
    await writeFile(
      path.join(outputDir, "handoff.json"),
      JSON.stringify(review),
    );
  };
  return { outputDir, sessionPath, sourcePath, review, save, finish };
}

test("drafts and superseded handoffs do not release the agent", async () => {
  const f = await fixture();
  await f.save();
  assert.equal(
    await waitForReview(f.sessionPath, 20, async () =>
      assert.fail("Draft delivered"),
    ),
    false,
  );
  f.review.disposition = "feedback_only";
  await f.finish();
  f.review.updatedAt = new Date(
    Date.parse(f.review.updatedAt) + 1,
  ).toISOString();
  f.review.disposition = "in_review";
  await f.save();
  assert.equal(await pendingHandoff(f.sessionPath), null);
  assert.deepEqual(await deliveryStatus(f.outputDir), {
    connected: false,
    submittedAt: null,
    deliveredAt: null,
  });
});

test("reconnecting returns finished feedback once, records delivery, and accepts a later submission", async () => {
  const f = await fixture();
  f.review.disposition = "feedback_only";
  f.review.assessments["decision-tokens"] = "question";
  await f.finish();
  assert.equal((await deliveryStatus(f.outputDir)).deliveredAt, null);
  assert.equal(
    await waitForReview(f.sessionPath, 100, async (result) => {
      assert.equal((await deliveryStatus(f.outputDir)).connected, true);
      assert.equal(result.review.assessments["decision-tokens"], "question");
      assert.match(result.feedback, /decision-tokens/);
      await assert.rejects(
        waitForReview(f.sessionPath, 20, async () => {}),
        /already waiting/,
      );
    }),
    true,
  );
  const status = await deliveryStatus(f.outputDir);
  assert.equal(status.connected, false);
  assert.ok(status.deliveredAt);
  assert.equal(await pendingHandoff(f.sessionPath), null);
  f.review.updatedAt = new Date(
    Date.parse(f.review.updatedAt) + 1,
  ).toISOString();
  await f.finish();
  assert.equal((await deliveryStatus(f.outputDir)).deliveredAt, null);
  assert.ok(await pendingHandoff(f.sessionPath));
});

test("failed delivery remains pending and changed source or handoff identity is rejected", async () => {
  const f = await fixture();
  f.review.disposition = "feedback_only";
  await f.finish();
  await assert.rejects(
    waitForReview(f.sessionPath, 100, async () => {
      throw new Error("Broken output");
    }),
    /Broken output/,
  );
  assert.equal((await deliveryStatus(f.outputDir)).connected, false);
  assert.ok(await pendingHandoff(f.sessionPath));
  await writeFile(
    path.join(f.outputDir, "handoff.json"),
    JSON.stringify({ ...f.review, modelHash: "a".repeat(64) }),
  );
  await assert.rejects(pendingHandoff(f.sessionPath), /identity/);
  await f.finish();
  await writeFile(f.sourcePath, "changed");
  await assert.rejects(pendingHandoff(f.sessionPath), /source plan changed/);
});

test("an active waiter returns shortly after submission rather than waiting for its timeout", async () => {
  const f = await fixture();
  const waiting = waitForReview(f.sessionPath, 3000, async (result) => {
    assert.equal(result.review.overallNote, "Use shunting yard");
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  f.review.disposition = "request_changes";
  f.review.overallNote = "Use shunting yard";
  const sentAt = performance.now();
  await f.finish();
  assert.equal(await waiting, true);
  assert.ok(
    performance.now() - sentAt < 1500,
    "Feedback must not wait for the timeout",
  );
});
