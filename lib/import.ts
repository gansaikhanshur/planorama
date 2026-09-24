import { createHash } from "node:crypto";
import { planSchema, type PlanObject, type Plan } from "./schema";

export const hashSource = (source: string) =>
  createHash("sha256").update(source).digest("hex");
export function validateSource(plan: Plan, markdown: string) {
  const count = markdown.split(/\r?\n/).length;
  for (const object of plan.objects)
    if (object.source && object.source.endLine > count)
      throw new Error(
        `Source range for ${object.id} exceeds the ${count}-line plan.`,
      );
}

// This deliberately extracts explicit structure only. Semantic interpretation belongs to the agent.
export function importMarkdown(markdown: string, name = "plan.md"): Plan {
  if (!markdown.trim()) throw new Error("The Markdown plan is empty.");
  const lines = markdown.split(/\r?\n/);
  const sections: {
    title: string;
    start: number;
    end: number;
    body: string[];
  }[] = [];
  let title = name.replace(/\.md$/i, ""),
    fenced = false,
    fence = "";
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fenced) {
        fenced = true;
        fence = marker[1][0];
      } else if (marker[1][0] === fence) fenced = false;
    }
    const heading = !fenced && lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (heading[1] === "#" && sections.length === 0) title = heading[2];
      sections.push({ title: heading[2], start: i + 1, end: i + 1, body: [] });
    } else {
      if (!sections.length)
        sections.push({ title, start: 1, end: 1, body: [] });
      sections.at(-1)!.body.push(lines[i]);
      sections.at(-1)!.end = i + 1;
    }
  }
  const objects = sections
    .filter((s) => s.body.some((line) => line.trim()))
    .map((s, i) => {
      let kind: PlanObject["kind"] = "claim";
      if (/\b(decision|architecture|approach)\b/i.test(s.title))
        kind = "decision";
      else if (/\b(assumption|assumptions)\b/i.test(s.title))
        kind = "assumption";
      else if (/\b(risk|risks)\b/i.test(s.title)) kind = "risk";
      else if (/\b(step|phase|implementation)\b/i.test(s.title)) kind = "step";
      else if (/\b(file|files)\b/i.test(s.title)) kind = "file";
      else if (/\b(objection|objections)\b/i.test(s.title)) kind = "objection";
      const body = s.body.join("\n").trim();
      const slug =
        s.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 70) || "section";
      return {
        id: `${slug}-${i + 1}`,
        kind,
        title: s.title.slice(0, 240),
        summary: body.slice(0, 20000),
        source: { startLine: s.start, endLine: s.end },
      };
    });
  if (!objects.length)
    objects.push({
      id: "plan-1",
      kind: "claim",
      title: title.slice(0, 240),
      summary: markdown.slice(0, 20000),
      source: { startLine: 1, endLine: lines.length },
    });
  return planSchema.parse({
    schemaVersion: 1,
    id: `plan-${hashSource(name).slice(0, 12)}`,
    revision: hashSource(markdown).slice(0, 12),
    title: title.slice(0, 240),
    summary:
      "Basic import of explicit Markdown sections. Ask your coding agent to extract a semantic plan for individual decisions, reasoning, and dependencies.",
    extraction: "basic",
    objects,
    edges: [],
  });
}
