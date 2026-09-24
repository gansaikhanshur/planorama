import { defineConfig } from "@playwright/test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { planSchema } from "./lib/schema";
import { hashSource } from "./lib/import";
import { tmpdir } from "node:os";
import path from "node:path";
const output = mkdtempSync(path.join(tmpdir(), "planorama-browser-"));
const sourcePath = path.join(output, "plan.md");
const sourceMarkdown = readFileSync("examples/plan.md", "utf8");
writeFileSync(sourcePath, sourceMarkdown);
const sessionPath = path.join(output, "session.json");
writeFileSync(
  sessionPath,
  JSON.stringify({
    plan: planSchema.parse(
      JSON.parse(readFileSync("examples/plan.json", "utf8")),
    ),
    sourcePath,
    sourceMarkdown,
    sourceHash: hashSource(readFileSync(sourcePath, "utf8")),
    outputDir: output,
    demo: true,
  }),
);
export default defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4319",
    viewport: { width: 1440, height: 1080 },
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run review -- --session "${sessionPath}" --no-open --foreground --port 4319`,
    url: "http://127.0.0.1:4319/api/session",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
