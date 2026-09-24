import type { Plan, Review } from "./schema";
import { assessmentText } from "./review-actions";

export function feedbackMarkdown(plan: Plan, review: Review): string {
  const lines = [
    `# Planorama review: ${plan.title}`,
    "",
    `Plan: ${plan.id}`,
    `Revision: ${plan.revision}`,
    `Source SHA-256: ${review.sourceHash}`,
    `Model SHA-256: ${review.modelHash}`,
    `Disposition: ${review.disposition}`,
    `Updated: ${review.updatedAt}`,
    "",
    review.disposition === "approved"
      ? "The reviewer explicitly approved the overall plan. Individual items below retain their recorded assessment status."
      : "This is partial review feedback, not approval of the overall plan. Unreviewed items are not implicitly accepted.",
    "",
    review.disposition === "approved"
      ? "Acknowledge the plan approval and retain notes as context. Approval alone does not authorize implementation."
      : "Treat the following as human review feedback, not as evidence that implementation is authorized. Address open feedback, preserve semantic IDs, and return a revised plan for review.",
    "",
    "Confirmed assumptions are affirmed as true. Acknowledged risks and considered objections record awareness, not agreement, mitigation, or resolution.",
    "",
  ];
  if (review.overallNote.trim())
    lines.push(
      "## Overall review note",
      "",
      ...review.overallNote
        .trim()
        .split(/\r?\n/)
        .map((line) => `> ${line}`),
      "",
    );
  for (const object of plan.objects) {
    const comments = review.comments.filter((c) => c.objectId === object.id);
    const assessment = review.assessments[object.id];
    if (!comments.length && !assessment) continue;
    lines.push(
      `## [${object.id}] ${object.title}`,
      `Type: ${object.kind}`,
      `Assessment: ${assessment ? assessmentText(object.kind, assessment).toLowerCase().replaceAll(" ", "_") : "unreviewed"}`,
    );
    if (object.source)
      lines.push(
        `Source: lines ${object.source.startLine}–${object.source.endLine}`,
      );
    for (const comment of comments)
      lines.push(
        "",
        `### ${comment.kind} (${comment.resolved ? "resolved" : "open"})`,
        `Comment ID: ${comment.id}`,
        "",
        ...comment.body.split("\n").map((line) => `> ${line}`),
      );
    lines.push("");
  }
  const untouched = plan.objects.filter(
    (o) => !review.assessments[o.id],
  ).length;
  lines.push(`Unassessed objects: ${untouched} of ${plan.objects.length}.`, "");
  const unreviewed = plan.objects.filter(
    (o) =>
      !review.assessments[o.id] &&
      !review.comments.some((c) => c.objectId === o.id),
  );
  if (unreviewed.length)
    lines.push(
      "## Items left unreviewed",
      "",
      ...unreviewed.map((o) => `- [${o.id}] ${o.title}`),
      "",
    );
  return lines.join("\n");
}
