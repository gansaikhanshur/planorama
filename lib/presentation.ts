import type { Plan, PlanDiagram } from "./schema";
import { needsRelationshipMap } from "./graph";

export type View =
  | "overview"
  | "decisions"
  | "attention"
  | "steps"
  | "supporting"
  | "map"
  | "files"
  | "feedback";
export type DiagramView = {
  key: string;
  title: string;
  label: string;
  description: string;
  diagram?: PlanDiagram;
};

export function diagramViews(plan: Plan): DiagramView[] {
  const views: DiagramView[] = (plan.diagrams ?? []).map((diagram) => ({
    key: `diagram:${diagram.id}`,
    title: diagram.title,
    label: diagram.kind === "architecture" ? "Architecture" : "Workflow",
    description: diagram.description,
    diagram,
  }));
  if (needsRelationshipMap(plan)) {
    const dependencies = plan.edges.some(
      (edge) => edge.relation === "depends_on",
    );
    views.push({
      key: "relationships",
      title: plan.relationshipMap!.title,
      label: dependencies ? "Dependencies" : "Reasoning map",
      description: plan.relationshipMap!.description,
    });
  }
  return views;
}

export function reviewSections(plan: Plan): {
  id: View;
  label: string;
  group: "start" | "review" | "reference" | "feedback";
}[] {
  const sections: ReturnType<typeof reviewSections> = [
    { id: "overview", label: "Overview", group: "start" },
  ];
  if (plan.objects.some((o) => o.kind === "decision"))
    sections.push({ id: "decisions", label: "Key decisions", group: "review" });
  if (
    plan.objects.some((o) =>
      ["assumption", "risk", "objection"].includes(o.kind),
    )
  )
    sections.push({
      id: "attention",
      label: "Assumptions & risks",
      group: "review",
    });
  if (plan.objects.some((o) => o.kind === "step"))
    sections.push({ id: "steps", label: "Implementation", group: "review" });
  if (plan.objects.some((o) => ["claim", "file", "component"].includes(o.kind)))
    sections.push({
      id: "supporting",
      label: "Supporting detail",
      group: "reference",
    });
  const diagrams = diagramViews(plan);
  if (diagrams.length)
    sections.push({
      id: "map",
      label: diagrams.length === 1 ? diagrams[0].label : "Diagrams",
      group: "reference",
    });
  if (plan.objects.some((o) => o.files.length))
    sections.push({ id: "files", label: "Proposed files", group: "reference" });
  sections.push({ id: "feedback", label: "Your review", group: "feedback" });
  return sections;
}

export function reviewPrompts(plan: Plan): string[] {
  if (plan.reviewFocus?.length) return plan.reviewFocus;
  const prompts: string[] = [];
  if (plan.objects.some((o) => o.kind === "decision"))
    prompts.push(
      "Do the proposed choices fit your goals, and are their tradeoffs acceptable?",
    );
  if (
    plan.objects.some((o) =>
      ["assumption", "risk", "objection"].includes(o.kind),
    )
  )
    prompts.push(
      "Which assumptions need confirmation, and which risks need a stronger response?",
    );
  if (plan.objects.some((o) => o.kind === "step"))
    prompts.push(
      "Does the implementation cover the intended outcome in a workable order?",
    );
  if (!prompts.length)
    prompts.push(
      "Does the proposal match the outcome you want, and what needs clarification?",
    );
  return prompts;
}
