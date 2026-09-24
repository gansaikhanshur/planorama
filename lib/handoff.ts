import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readSessionConfig } from "./resume";
import { hashSource } from "./import";
import { validateReview } from "./schema";
import { feedbackMarkdown } from "./feedback";

export type DeliveryStatus = {
  connected: boolean;
  submittedAt: string | null;
  deliveredAt: string | null;
};

async function readJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJson(file: string, value: unknown) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 });
  await rename(temporary, file);
}

export async function deliveryStatus(
  outputDir: string,
): Promise<DeliveryStatus> {
  const [listener, handoff, review, receipt] = await Promise.all([
    readJson(path.join(outputDir, "listener.json")),
    readJson(path.join(outputDir, "handoff.json")),
    readJson(path.join(outputDir, "review.json")),
    readJson(path.join(outputDir, "receipt.json")),
  ]);
  const submittedAt =
    handoff &&
    handoff.updatedAt === review?.updatedAt &&
    review.disposition !== "in_review"
      ? handoff.updatedAt
      : null;
  return {
    connected: Boolean(listener && Date.now() - listener.heartbeat < 10_000),
    submittedAt,
    deliveredAt:
      submittedAt && receipt?.updatedAt === submittedAt
        ? receipt.deliveredAt
        : null,
  };
}

// Return only an explicit, current handoff. Draft saves never release the waiter.
export async function pendingHandoff(sessionPath: string) {
  const config = await readSessionConfig(sessionPath);
  const handoff = await readJson(path.join(config.outputDir, "handoff.json"));
  if (!handoff) return null;
  const raw = await readJson(path.join(config.outputDir, "review.json"));
  if (
    !raw ||
    raw.updatedAt !== handoff.updatedAt ||
    raw.disposition === "in_review"
  )
    return null;
  const receipt = await readJson(path.join(config.outputDir, "receipt.json"));
  if (receipt?.updatedAt === raw.updatedAt) return null;
  const sourceHash = hashSource(await readFile(config.sourcePath, "utf8"));
  if (sourceHash !== config.sourceHash)
    throw new Error(
      "The source plan changed; reconcile the saved review before continuing.",
    );
  const review = validateReview(
    raw,
    config.plan,
    sourceHash,
    hashSource(JSON.stringify(config.plan)),
  );
  for (const key of [
    "planId",
    "revision",
    "sourceHash",
    "modelHash",
    "disposition",
  ] as const) {
    if (handoff[key] !== review[key])
      throw new Error("Handoff identity does not match the saved review.");
  }
  return {
    sessionPath,
    outputDir: config.outputDir,
    review,
    feedback: feedbackMarkdown(config.plan, review),
  };
}

export async function waitForReview(
  sessionPath: string,
  timeoutMs: number,
  deliver: (
    result: NonNullable<Awaited<ReturnType<typeof pendingHandoff>>>,
  ) => Promise<void>,
) {
  const config = await readSessionConfig(sessionPath);
  const lease = path.join(config.outputDir, "listener.json");
  await mkdir(config.outputDir, { recursive: true, mode: 0o700 });
  const existing = await readJson(lease);
  if (existing) {
    // A crashed process must not permanently prevent reconnection.
    let alive = true;
    try {
      process.kill(existing.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false;
    }
    if (alive) throw new Error("An agent is already waiting for this session.");
    await rm(lease, { force: true });
  }
  const listener = { pid: process.pid, heartbeat: Date.now() };
  await writeFile(lease, JSON.stringify(listener), { flag: "wx", mode: 0o600 });
  try {
    const deadline = Date.now() + timeoutMs;
    do {
      await writeJson(lease, { ...listener, heartbeat: Date.now() });
      const result = await pendingHandoff(sessionPath);
      if (result) {
        await deliver(result);
        // Receipt means returned to the agent's tool, not that revisions are complete.
        await writeJson(path.join(config.outputDir, "receipt.json"), {
          updatedAt: result.review.updatedAt,
          deliveredAt: new Date().toISOString(),
        });
        return true;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(500, Math.max(0, deadline - Date.now()))),
      );
    } while (Date.now() < deadline);
    return false;
  } finally {
    await rm(lease, { force: true });
  }
}
