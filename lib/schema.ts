import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/);
const text = z.string().trim().min(1).max(20000);
export const kinds = [
  "decision",
  "step",
  "assumption",
  "risk",
  "claim",
  "objection",
  "file",
  "component",
] as const;
export const sourceRefSchema = z
  .object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  })
  .refine((r) => r.endLine >= r.startLine, "Source end must follow start");
export const objectSchema = z.object({
  id,
  kind: z.enum(kinds),
  title: text.max(240),
  summary: text,
  importance: z.enum(["critical", "normal", "supporting"]).default("normal"),
  context: z.string().max(20000).default(""),
  rationale: z.string().max(20000).default(""),
  alternatives: z
    .array(z.object({ title: text, tradeoff: text }))
    .max(30)
    .default([]),
  consequences: z.array(text).max(50).default([]),
  files: z.array(text.max(1000)).max(100).default([]),
  source: sourceRefSchema.optional(),
});
export const planSchema = z
  .object({
    schemaVersion: z.literal(1),
    id,
    revision: text.max(100),
    title: text.max(240),
    summary: text,
    extraction: z.enum(["agent", "basic"]),
    reviewFocus: z.array(text.max(500)).max(6).optional(),
    relationshipMap: z
      .object({ title: text.max(120), description: text.max(2000) })
      .optional(),
    diagrams: z
      .array(
        z.object({
          id,
          kind: z.enum(["architecture", "workflow"]),
          title: text.max(120),
          description: text.max(2000),
          nodes: z
            .array(
              z.object({
                objectId: id,
                position: z.object({
                  x: z.number().min(-10000).max(10000),
                  y: z.number().min(-10000).max(10000),
                }),
              }),
            )
            .min(1)
            .max(300),
          connections: z
            .array(z.object({ id, from: id, to: id, label: text.max(120) }))
            .max(1000),
        }),
      )
      .max(12)
      .optional(),
    objects: z.array(objectSchema).min(1).max(300),
    edges: z
      .array(
        z.object({
          id,
          from: id,
          to: id,
          relation: z.enum(["depends_on", "supports", "challenges", "affects"]),
          rationale: z.string().max(2000).default(""),
        }),
      )
      .max(1000)
      .default([]),
  })
  .superRefine((plan, ctx) => {
    const ids = new Set<string>();
    for (const item of plan.objects) {
      if (ids.has(item.id))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate object ID: ${item.id}`,
        });
      ids.add(item.id);
    }
    const edgeIds = new Set<string>();
    const diagramIds = new Set<string>();
    for (const diagram of plan.diagrams ?? []) {
      if (diagramIds.has(diagram.id))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate diagram ID: ${diagram.id}`,
        });
      diagramIds.add(diagram.id);
      const nodes = new Set(diagram.nodes.map((n) => n.objectId));
      if (nodes.size !== diagram.nodes.length)
        ctx.addIssue({
          code: "custom",
          message: `Duplicate diagram node in ${diagram.id}`,
        });
      if (diagram.nodes.some((n) => !ids.has(n.objectId)))
        ctx.addIssue({
          code: "custom",
          message: `Unknown diagram object in ${diagram.id}`,
        });
      const connections = new Set<string>();
      for (const connection of diagram.connections) {
        if (connections.has(connection.id))
          ctx.addIssue({
            code: "custom",
            message: `Duplicate diagram connection in ${diagram.id}`,
          });
        connections.add(connection.id);
        if (!nodes.has(connection.from) || !nodes.has(connection.to))
          ctx.addIssue({
            code: "custom",
            message: `Unknown diagram endpoint in ${diagram.id}`,
          });
      }
    }
    for (const edge of plan.edges) {
      if (edgeIds.has(edge.id))
        ctx.addIssue({
          code: "custom",
          message: `Duplicate edge ID: ${edge.id}`,
        });
      edgeIds.add(edge.id);
      if (!ids.has(edge.from) || !ids.has(edge.to))
        ctx.addIssue({
          code: "custom",
          message: `Unknown endpoint in ${edge.id}`,
        });
      if (edge.from === edge.to)
        ctx.addIssue({
          code: "custom",
          message: `Self-reference in ${edge.id}`,
        });
    }
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const parents = new Map<string, string[]>();
    for (const edge of plan.edges.filter((e) => e.relation === "depends_on"))
      parents.set(edge.from, [...(parents.get(edge.from) ?? []), edge.to]);
    function cycle(node: string): boolean {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      if ((parents.get(node) ?? []).some(cycle)) return true;
      visiting.delete(node);
      visited.add(node);
      return false;
    }
    if (plan.objects.some((o) => cycle(o.id)))
      ctx.addIssue({
        code: "custom",
        message: "Dependency edges contain a cycle",
      });
  });

export const reviewSchema = z.object({
  schemaVersion: z.literal(1),
  planId: id,
  revision: text.max(100),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  modelHash: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.iso.datetime(),
  overallNote: z.string().max(10000).default(""),
  disposition: z.enum([
    "in_review",
    "feedback_only",
    "request_changes",
    "approved",
  ]),
  assessments: z.record(
    id,
    z.enum([
      "accepted",
      "confirmed",
      "acknowledged",
      "considered",
      "question",
      "change_requested",
    ]),
  ),
  comments: z
    .array(
      z.object({
        id: z.uuid(),
        objectId: id,
        kind: z.enum(["comment", "question", "objection"]),
        body: text.max(10000),
        createdAt: z.iso.datetime(),
        resolved: z.boolean(),
      }),
    )
    .max(2000),
});
export type Plan = z.infer<typeof planSchema>;
export type PlanDiagram = NonNullable<Plan["diagrams"]>[number];
export type PlanObject = z.infer<typeof objectSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Assessment = Review["assessments"][string];
export type Session = {
  plan: Plan;
  source: { name: string; path: string; markdown: string; hash: string };
  review: Review;
  outputDir: string;
  demo: boolean;
  sessionPath: string;
  resumeCommand: string;
};

export function emptyReview(
  plan: Plan,
  sourceHash: string,
  modelHash: string,
): Review {
  return {
    schemaVersion: 1,
    planId: plan.id,
    revision: plan.revision,
    sourceHash,
    modelHash,
    updatedAt: new Date().toISOString(),
    disposition: "in_review",
    assessments: {},
    comments: [],
    overallNote: "",
  };
}
export function validateReview(
  review: unknown,
  plan: Plan,
  sourceHash: string,
  modelHash: string,
): Review {
  const parsed = reviewSchema.parse(review);
  if (
    parsed.planId !== plan.id ||
    parsed.revision !== plan.revision ||
    parsed.sourceHash !== sourceHash ||
    parsed.modelHash !== modelHash
  )
    throw new Error(
      "The plan changed. Reopen Planorama before saving this review.",
    );
  const ids = new Set(plan.objects.map((o) => o.id));
  if (
    Object.keys(parsed.assessments).some((k) => !ids.has(k)) ||
    parsed.comments.some((c) => !ids.has(c.objectId))
  )
    throw new Error("Review refers to an unknown plan object.");
  if (new Set(parsed.comments.map((c) => c.id)).size !== parsed.comments.length)
    throw new Error("Duplicate comment IDs.");
  const kindForAssessment = {
    confirmed: "assumption",
    acknowledged: "risk",
    considered: "objection",
  } as const;
  for (const [objectId, assessment] of Object.entries(parsed.assessments)) {
    if (
      assessment in kindForAssessment &&
      plan.objects.find((object) => object.id === objectId)?.kind !==
        kindForAssessment[assessment as keyof typeof kindForAssessment]
    )
      throw new Error("Assessment does not match the object type.");
  }
  if (
    parsed.disposition === "approved" &&
    (Object.values(parsed.assessments).some(
      (v) => v === "question" || v === "change_requested",
    ) ||
      parsed.comments.some((c) => !c.resolved && c.kind !== "comment"))
  )
    throw new Error(
      "Resolve open questions and change requests before approving.",
    );
  return parsed;
}
