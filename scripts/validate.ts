import { readFile } from "node:fs/promises";
import { planSchema } from "../lib/schema";
import { hashSource, validateSource } from "../lib/import";
async function main() {
  const [model, source] = process.argv.slice(2);
  if (!model) throw new Error("Usage: npm run validate -- plan.json [plan.md]");
  const plan = planSchema.parse(JSON.parse(await readFile(model, "utf8")));
  if (source) {
    const markdown = await readFile(source, "utf8");
    validateSource(plan, markdown);
    console.log(`Source SHA-256: ${hashSource(markdown)}`);
  }
  console.log(`Model SHA-256: ${hashSource(JSON.stringify(plan))}`);
  console.log(
    `Valid: ${plan.objects.length} objects, ${plan.edges.length} relationships · ${plan.title}`,
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
