import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  emptyReview,
  planSchema,
  validateReview,
  type Session,
  type Review,
} from "./schema";
import { hashSource, validateSource } from "./import";
import { feedbackMarkdown } from "./feedback";
import { hasRevisionFeedback } from "./review-actions";
import { readSessionConfig, resumeCommand } from "./resume";

async function readOptional(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function getSession(): Promise<Session> {
  const configPath = process.env.PLANORAMA_SESSION;
  const config = configPath ? await readSessionConfig(configPath) : null;
  const plan =
    config?.plan ??
    planSchema.parse(
      JSON.parse(
        await readFile(path.join(process.cwd(), "examples/plan.json"), "utf8"),
      ),
    );
  const sourcePath =
    config?.sourcePath ?? path.join(process.cwd(), "examples/plan.md");
  const outputDir =
    config?.outputDir ?? path.join(process.cwd(), ".planorama/demo");
  const saved = await readOptional(path.join(outputDir, "review.json"));
  const submitted = saved && JSON.parse(saved).disposition !== "in_review";
  // A completed review stays on its original source while the agent writes the next revision.
  const markdown =
    submitted && config?.sourceMarkdown !== undefined
      ? config.sourceMarkdown
      : await readFile(sourcePath, "utf8");
  const hash = hashSource(markdown);
  if (config && config.sourceHash !== hash)
    throw new Error(
      "The source plan changed on disk. Relaunch Planorama to review its new revision.",
    );
  validateSource(plan, markdown);
  const initial = emptyReview(plan, hash, hashSource(JSON.stringify(plan)));
  initial.updatedAt = new Date(0).toISOString();
  const review = saved
    ? validateReview(
        JSON.parse(saved),
        plan,
        hash,
        hashSource(JSON.stringify(plan)),
      )
    : initial;
  return {
    plan,
    source: {
      name: path.basename(sourcePath),
      path: sourcePath,
      markdown,
      hash,
    },
    review,
    outputDir,
    demo: config?.demo ?? true,
    sessionPath: configPath ?? path.join(outputDir, "session.json"),
    resumeCommand: resumeCommand(
      process.cwd(),
      configPath ?? path.join(outputDir, "session.json"),
      process.env.PLANORAMA_PORT ?? process.env.PORT ?? "3000",
    ),
  };
}
async function atomicWrite(file: string, content: string) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, file);
}
let writeQueue: Promise<unknown> = Promise.resolve();
export function saveReview(
  input: unknown,
  expectedUpdatedAt: string,
  finalize: boolean,
): Promise<{ review: Review; feedback: string; outputDir: string }> {
  const operation = writeQueue.then(async () => {
    const session = await getSession();
    if (
      hashSource(await readFile(session.source.path, "utf8")) !==
      session.source.hash
    )
      throw new Error(
        "The source plan changed. This submitted review belongs to the previous revision.",
      );
    if (session.review.updatedAt !== expectedUpdatedAt)
      throw new Error(
        "Another tab saved a newer review. Reload before editing again.",
      );
    const review = validateReview(
      input,
      session.plan,
      session.source.hash,
      hashSource(JSON.stringify(session.plan)),
    );
    if (
      finalize &&
      review.disposition === "request_changes" &&
      !hasRevisionFeedback(review)
    )
      throw new Error(
        "Add an overall note explaining what you would like revised.",
      );
    review.updatedAt = new Date(
      Math.max(Date.now(), Date.parse(session.review.updatedAt) + 1),
    ).toISOString();
    const feedback = feedbackMarkdown(session.plan, review);
    await mkdir(session.outputDir, { recursive: true, mode: 0o700 });
    if (!process.env.PLANORAMA_SESSION) {
      await atomicWrite(
        session.sessionPath,
        JSON.stringify(
          {
            plan: session.plan,
            sourcePath: session.source.path,
            sourceMarkdown: session.source.markdown,
            sourceHash: session.source.hash,
            outputDir: session.outputDir,
            demo: session.demo,
          },
          null,
          2,
        ) + "\n",
      );
    }
    await atomicWrite(
      path.join(session.outputDir, "review.json"),
      JSON.stringify(review, null, 2) + "\n",
    );
    // Always keep the readable counterpart current, including after reopening a submitted draft.
    await atomicWrite(path.join(session.outputDir, "feedback.md"), feedback);
    if (finalize)
      await atomicWrite(
        path.join(session.outputDir, "handoff.json"),
        JSON.stringify(
          {
            planId: review.planId,
            revision: review.revision,
            sourceHash: review.sourceHash,
            modelHash: review.modelHash,
            updatedAt: review.updatedAt,
            disposition: review.disposition,
            reviewFile: "review.json",
            feedbackFile: "feedback.md",
          },
          null,
          2,
        ) + "\n",
      );
    return { review, feedback, outputDir: session.outputDir };
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
