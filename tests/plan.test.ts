import { test } from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { planSchema, emptyReview, validateReview } from "../lib/schema";
import { hashSource, importMarkdown, validateSource } from "../lib/import";
import {
  affectedObjects,
  graphPositions,
  diagramPositions,
  needsRelationshipMap,
} from "../lib/graph";
import { feedbackMarkdown } from "../lib/feedback";
import { getSession, saveReview } from "../lib/session";

const raw = JSON.parse(
  await readFile(new URL("../examples/plan.json", import.meta.url), "utf8"),
);
const plan = planSchema.parse(raw);
const markdown = await readFile(
  new URL("../examples/plan.md", import.meta.url),
  "utf8",
);
const sourceHash = hashSource(markdown),
  modelHash = hashSource(JSON.stringify(plan));

test("example is valid and all source references point to real source lines", () => {
  validateSource(plan, markdown);
  assert.equal(plan.objects.length, 13);
  for (const object of plan.objects) {
    const lines = markdown.split(/\r?\n/);
    assert.match(lines[object.source!.startLine - 1], /^## /);
    assert.ok(lines[object.source!.endLine - 1].trim());
  }
  assert.throws(() => validateSource(plan, "short"), /exceeds/);
});
test("invalid graph references, duplicates, and dependency cycles are rejected", () => {
  assert.throws(
    () =>
      planSchema.parse({ ...raw, objects: [...raw.objects, raw.objects[0]] }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      planSchema.parse({
        ...raw,
        edges: [
          ...raw.edges,
          {
            id: "missing",
            from: "absent",
            to: "step-ui",
            relation: "supports",
          },
        ],
      }),
    /Unknown endpoint/,
  );
  assert.throws(
    () =>
      planSchema.parse({
        ...raw,
        edges: [
          ...raw.edges,
          {
            id: "cycle",
            from: "decision-tokens",
            to: "step-ui",
            relation: "depends_on",
          },
        ],
      }),
    /cycle/,
  );
});
test("downstream impact follows prerequisites and effects, not all argument links", () => {
  assert.deepEqual([...affectedObjects(plan, "decision-tokens")].sort(), [
    "step-api",
    "step-model",
    "step-rollout",
    "step-ui",
  ]);
  assert.equal(affectedObjects(plan, "objection-expiry").size, 0);
  assert.ok(affectedObjects(plan, "risk-concurrency").has("step-rollout"));
  const positions = graphPositions(plan);
  assert.ok(positions.get("step-ui")!.x > positions.get("step-api")!.x);
});
test("basic import marks uncertainty and never invents relationships from order", () => {
  const result = importMarkdown(
    "# Work\nA goal\n## Decision: cache\nUse a cache.\n## Phase 1\nImplement it.\n```md\n## Not a real heading\n```",
    "plan.md",
  );
  assert.equal(result.extraction, "basic");
  assert.equal(result.edges.length, 0);
  assert.equal(result.objects.length, 3);
  assert.equal(result.objects[1].kind, "decision");
  assert.equal(result.objects[1].rationale, "");
  assert.match(result.objects[2].summary, /Not a real heading/);
  assert.throws(() => importMarkdown("   "), /empty/);
});
test("reviews cannot target another source, model, revision, or nonexistent object", () => {
  const review = emptyReview(plan, sourceHash, modelHash);
  assert.throws(
    () =>
      validateReview(
        { ...review, sourceHash: "a".repeat(64) },
        plan,
        sourceHash,
        modelHash,
      ),
    /changed/,
  );
  assert.throws(
    () =>
      validateReview(
        { ...review, modelHash: "a".repeat(64) },
        plan,
        sourceHash,
        modelHash,
      ),
    /changed/,
  );
  assert.throws(
    () =>
      validateReview(
        { ...review, revision: "another-revision" },
        plan,
        sourceHash,
        modelHash,
      ),
    /changed/,
  );
  assert.throws(
    () =>
      validateReview(
        { ...review, assessments: { absent: "accepted" } },
        plan,
        sourceHash,
        modelHash,
      ),
    /unknown/,
  );
});
test("approval cannot bypass unresolved objections or question assessments", () => {
  const review = emptyReview(plan, sourceHash, modelHash);
  review.disposition = "approved";
  review.assessments[plan.objects[0].id] = "question";
  assert.throws(
    () => validateReview(review, plan, sourceHash, modelHash),
    /Resolve/,
  );
  review.assessments = {};
  review.comments.push({
    id: "b4a3e120-8402-4c53-8507-45dd6f474e84",
    objectId: plan.objects[0].id,
    kind: "objection",
    body: "Why this expiry?",
    createdAt: new Date().toISOString(),
    resolved: false,
  });
  assert.throws(
    () => validateReview(review, plan, sourceHash, modelHash),
    /Resolve/,
  );
  review.comments[0].resolved = true;
  assert.equal(
    validateReview(review, plan, sourceHash, modelHash).disposition,
    "approved",
  );
});
test("feedback preserves semantic IDs, source identity, and comment boundaries", () => {
  const review = emptyReview(plan, sourceHash, modelHash);
  review.assessments[plan.objects[0].id] = "change_requested";
  review.comments.push({
    id: "b4a3e120-8402-4c53-8507-45dd6f474e84",
    objectId: plan.objects[0].id,
    kind: "objection",
    body: "Use a longer expiry.\n## This is still a comment",
    createdAt: new Date().toISOString(),
    resolved: false,
  });
  const result = feedbackMarkdown(plan, review);
  assert.match(result, /\[decision-tokens\]/);
  assert.ok(result.includes(sourceHash));
  assert.match(result, /> ## This is still a comment/);
  assert.match(result, /Unassessed objects: 12 of 13/);
});
test("local round trip persists review and handoff, rejects races and changed source", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planorama-test-"));
  const sourcePath = path.join(directory, "plan.md");
  await writeFile(sourcePath, markdown);
  const sessionPath = path.join(directory, "session.json");
  await writeFile(
    sessionPath,
    JSON.stringify({ plan, sourcePath, sourceHash, outputDir: directory }),
  );
  const previous = process.env.PLANORAMA_SESSION;
  process.env.PLANORAMA_SESSION = sessionPath;
  try {
    const initial = await getSession();
    initial.review.assessments[plan.objects[0].id] = "accepted";
    const attempts = await Promise.allSettled([
      saveReview(initial.review, initial.review.updatedAt, true),
      saveReview(initial.review, initial.review.updatedAt, false),
    ]);
    assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((r) => r.status === "rejected").length, 1);
    const session = await getSession();
    assert.equal(session.review.assessments[plan.objects[0].id], "accepted");
    assert.ok(
      (await readFile(path.join(directory, "feedback.md"), "utf8")).includes(
        "decision-tokens",
      ),
    );
    const handoff = JSON.parse(
      await readFile(path.join(directory, "handoff.json"), "utf8"),
    );
    assert.equal(handoff.updatedAt, session.review.updatedAt);
    await writeFile(sourcePath, markdown + "\nChanged.");
    await assert.rejects(
      saveReview(session.review, session.review.updatedAt, false),
      /source plan changed/,
    );
  } finally {
    if (previous) process.env.PLANORAMA_SESSION = previous;
    else delete process.env.PLANORAMA_SESSION;
  }
});

test("navigation follows the plan contents and diagram semantics stay explicit", async () => {
  const { reviewSections, diagramViews, reviewPrompts } =
    await import("../lib/presentation");
  const minimal = planSchema.parse({
    schemaVersion: 1,
    id: "minimal",
    revision: "1",
    title: "Fix a label",
    summary: "Clarify the button text.",
    extraction: "agent",
    objects: [
      {
        id: "label",
        kind: "step",
        title: "Rename button",
        summary: "Use clearer wording.",
      },
    ],
  });
  assert.deepEqual(
    reviewSections(minimal).map((s) => s.id),
    ["overview", "steps", "feedback"],
  );
  assert.equal(diagramViews(minimal).length, 0);
  assert.ok(reviewPrompts(minimal).length > 0);
  assert.deepEqual(
    diagramViews(plan).map((d) => d.label),
    ["Architecture", "Dependencies"],
  );
  assert.equal(reviewPrompts(plan)[0], plan.reviewFocus![0]);
  assert.equal(affectedObjects(plan, "component-invite-api").size, 0);
});

test("architecture connections require semantic objects and allow interaction cycles", () => {
  const bad = structuredClone(raw);
  bad.diagrams[0].connections[0].to = "missing-component";
  assert.throws(() => planSchema.parse(bad), /Unknown diagram endpoint/);
  const cyclic = structuredClone(raw);
  cyclic.diagrams[0].connections.push({
    id: "acknowledges",
    from: "component-email-worker",
    to: "component-invite-api",
    label: "delivery status",
  });
  assert.doesNotThrow(() => planSchema.parse(cyclic));
  const duplicate = structuredClone(raw);
  duplicate.diagrams[0].nodes.push(duplicate.diagrams[0].nodes[0]);
  assert.throws(() => planSchema.parse(duplicate), /Duplicate diagram node/);
});

test("partial or empty feedback does not imply overall approval", () => {
  const review = emptyReview(plan, sourceHash, modelHash);
  review.disposition = "feedback_only";
  const validated = validateReview(review, plan, sourceHash, modelHash);
  assert.deepEqual(validated.assessments, {});
  const feedback = feedbackMarkdown(plan, validated);
  assert.match(feedback, /Unreviewed items are not implicitly accepted/);
  assert.match(feedback, /## Items left unreviewed/);
  review.assessments["decision-tokens"] = "accepted";
  assert.equal(
    validateReview(review, plan, sourceHash, modelHash).disposition,
    "feedback_only",
  );
});

test("resume config preserves the original source, model, and review directory", async () => {
  const { readSessionConfig, resumeCommand } = await import("../lib/resume");
  const directory = await mkdtemp(path.join(tmpdir(), "planorama-resume-"));
  const file = path.join(directory, "session.json");
  await writeFile(
    file,
    JSON.stringify({
      plan,
      sourcePath: path.join(directory, "plan.md"),
      sourceHash,
      outputDir: directory,
    }),
  );
  const resumed = await readSessionConfig(file);
  assert.deepEqual(resumed.plan, plan);
  assert.equal(resumed.outputDir, directory);
  assert.equal(resumed.sourceHash, sourceHash);
  const command = resumeCommand(
    "/tmp/agent's tools",
    "/tmp/review session/session.json",
    "4317",
  );
  assert.ok(command.includes("'\\''"));
  assert.ok(command.includes("--session '/tmp/review session/session.json'"));
  const parsed = spawnSync(
    "/bin/sh",
    ["-c", command.replace(/^npm /, "printf '%s\\n' ")],
    { encoding: "utf8" },
  );
  assert.equal(parsed.status, 0);
  assert.deepEqual(parsed.stdout.trimEnd().split("\n"), [
    "--prefix",
    "/tmp/agent's tools",
    "run",
    "review",
    "--",
    "--session",
    "/tmp/review session/session.json",
    "--port",
    "4317",
  ]);
  await writeFile(
    file,
    JSON.stringify({ ...resumed, sourcePath: "relative/plan.md" }),
  );
  await assert.rejects(readSessionConfig(file), /absolute/);
});

test("awareness assessments preserve their meaning and cannot target another object type", () => {
  const review = emptyReview(plan, sourceHash, modelHash);
  for (const [kind, assessment] of [
    ["assumption", "confirmed"],
    ["risk", "acknowledged"],
    ["objection", "considered"],
  ] as const) {
    const object = plan.objects.find((o) => o.kind === kind)!;
    review.assessments[object.id] = assessment;
  }
  review.disposition = "approved";
  assert.doesNotThrow(() =>
    validateReview(review, plan, sourceHash, modelHash),
  );
  const feedback = feedbackMarkdown(plan, review);
  assert.match(feedback, /Assessment: acknowledged/);
  assert.match(feedback, /awareness, not agreement, mitigation, or resolution/);
  review.assessments["decision-tokens"] = "acknowledged";
  assert.throws(
    () => validateReview(review, plan, sourceHash, modelHash),
    /object type/,
  );
});

test("revision reasons exclude resolved notes and overall notes preserve their boundaries", async () => {
  const { hasRevisionFeedback } = await import("../lib/review-actions");
  const review = emptyReview(plan, sourceHash, modelHash);
  review.assessments = Object.fromEntries(
    plan.objects.map((o) => [o.id, "accepted"]),
  );
  assert.equal(hasRevisionFeedback(review), false);
  review.overallNote = "  \n ";
  assert.equal(hasRevisionFeedback(review), false);
  review.comments.push({
    id: "b4a3e120-8402-4c53-8507-45dd6f474e84",
    objectId: plan.objects[0].id,
    kind: "question",
    body: "Why?",
    createdAt: new Date().toISOString(),
    resolved: true,
  });
  assert.equal(hasRevisionFeedback(review), false);
  review.comments[0].resolved = false;
  assert.equal(hasRevisionFeedback(review), true);
  review.comments[0].resolved = true;
  review.overallNote = "Split into phases.\n## Still a user note";
  assert.equal(hasRevisionFeedback(review), true);
  assert.match(feedbackMarkdown(plan, review), /> ## Still a user note/);
});

test("sparse dependencies ignore unrelated objects and do not create an unnecessary map", async () => {
  const { diagramViews } = await import("../lib/presentation");
  const sparse = planSchema.parse({
    ...raw,
    diagrams: [],
    relationshipMap: undefined,
    edges: [
      { id: "one", from: "step-ui", to: "step-api", relation: "depends_on" },
    ],
  });
  const positions = graphPositions(sparse);
  assert.equal(positions.size, 2);
  assert.equal(positions.get("step-ui")!.y, positions.get("step-api")!.y);
  assert.equal(positions.get("step-ui")!.x - positions.get("step-api")!.x, 420);
  assert.equal(diagramViews(sparse).length, 0);
  sparse.edges.push({
    id: "chain",
    from: "step-rollout",
    to: "step-ui",
    relation: "depends_on",
    rationale: "",
  });
  assert.equal(needsRelationshipMap(sparse), false);
  sparse.edges.push({
    id: "branch",
    from: "step-model",
    to: "step-api",
    relation: "depends_on",
    rationale: "",
  });
  assert.equal(needsRelationshipMap(sparse), false);
  sparse.relationshipMap = {
    title: "Release dependencies",
    description: "Which independent changes must land before release?",
  };
  assert.equal(needsRelationshipMap(sparse), true);
  assert.equal(diagramViews(sparse)[0].label, "Dependencies");
  assert.equal(affectedObjects(sparse, "step-api").has("step-ui"), true);
});

test("explicit diagrams compact extreme coordinates and separate overlapping cards", () => {
  const diagram = structuredClone(plan.diagrams![0]);
  diagram.nodes[0].position = { x: -10000, y: 0 };
  diagram.nodes[1].position = { x: 10000, y: 0 };
  diagram.nodes[2].position = { x: 10000, y: 0 };
  const positions = diagramPositions(diagram);
  const points = [...positions.values()];
  assert.equal(new Set(points.map((p) => `${p.x}:${p.y}`)).size, points.length);
  assert.equal(Math.max(...points.map((p) => p.x)), 420);
  assert.equal(Math.max(...points.map((p) => p.y)), 200);
});

test("submitted reviews keep the original plan visible while revisions are written, but reject edits against changed source", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "planorama-snapshot-"));
  const sourcePath = path.join(directory, "plan.md");
  const sessionPath = path.join(directory, "session.json");
  await writeFile(sourcePath, markdown);
  await writeFile(
    sessionPath,
    JSON.stringify({
      plan,
      sourcePath,
      sourceMarkdown: markdown,
      sourceHash,
      outputDir: directory,
    }),
  );
  const previous = process.env.PLANORAMA_SESSION;
  process.env.PLANORAMA_SESSION = sessionPath;
  try {
    const initial = await getSession();
    const submitted = await saveReview(
      { ...initial.review, disposition: "approved" },
      initial.review.updatedAt,
      true,
    );
    await writeFile(sourcePath, "# New revision in progress");
    const original = await getSession();
    assert.equal(original.source.markdown, markdown);
    assert.equal(original.review.disposition, "approved");
    await assert.rejects(
      saveReview(
        { ...submitted.review, disposition: "in_review" },
        submitted.review.updatedAt,
        false,
      ),
      /source plan changed/,
    );
  } finally {
    if (previous) process.env.PLANORAMA_SESSION = previous;
    else delete process.env.PLANORAMA_SESSION;
  }
});
