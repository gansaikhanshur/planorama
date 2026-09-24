import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { planSchema } from "./schema";

const absolutePath = z
  .string()
  .refine(path.isAbsolute, "Session paths must be absolute");
export const sessionConfigSchema = z.object({
  plan: planSchema,
  sourcePath: absolutePath,
  sourceMarkdown: z.string().max(1_000_000).optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  outputDir: absolutePath,
  demo: z.boolean().default(false),
});
export async function readSessionConfig(file: string) {
  return sessionConfigSchema.parse(JSON.parse(await readFile(file, "utf8")));
}
export function resumeCommand(
  appDir: string,
  sessionPath: string,
  port: string,
) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  return `npm --prefix ${quote(appDir)} run review -- --session ${quote(sessionPath)} --port ${quote(port)}`;
}
