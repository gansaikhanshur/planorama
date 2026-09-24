#!/usr/bin/env node
import { parseArgs } from "node:util";
import path from "node:path";
import { waitForReview } from "../lib/handoff";

async function main() {
  const { values } = parseArgs({
    options: {
      session: { type: "string" },
      timeout: { type: "string", default: "55" },
    },
  });
  const timeout = Number(values.timeout);
  if (
    !values.session ||
    !Number.isFinite(timeout) ||
    timeout <= 0 ||
    timeout > 60
  ) {
    throw new Error(
      "Usage: npm run wait -- --session /absolute/path/session.json [--timeout seconds (1–60)]",
    );
  }
  const delivered = await waitForReview(
    path.resolve(values.session),
    timeout * 1000,
    async (result) => {
      await new Promise<void>((resolve, reject) => {
        process.stdout.write(
          JSON.stringify({ status: "review_finished", ...result }) + "\n",
          (error) => (error ? reject(error) : resolve()),
        );
      });
    },
  );
  if (!delivered) {
    console.log(
      JSON.stringify({
        status: "waiting",
        message:
          "No new finished review. Run this command again to keep waiting.",
      }),
    );
    process.exitCode = 2;
  }
}
main().catch((error) => {
  console.error(`Planorama: ${error.message}`);
  process.exitCode = 1;
});
