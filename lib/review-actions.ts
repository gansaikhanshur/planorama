import type { Assessment, PlanObject, Review } from "./schema";

export function reviewAction(kind: PlanObject["kind"]) {
  switch (kind) {
    case "assumption":
      return {
        value: "confirmed" as const,
        label: "Confirm",
        done: "Confirmed",
        guidance:
          "Confirm only if you know this assumption is true. Otherwise, ask the agent to verify it.",
      };
    case "risk":
      return {
        value: "acknowledged" as const,
        label: "Acknowledge",
        done: "Acknowledged",
        guidance:
          "Acknowledge that you’ve seen this risk. This does not mean it is resolved or that you accept the consequences. Request a change if it needs mitigation.",
      };
    case "objection":
      return {
        value: "considered" as const,
        label: "Considered",
        done: "Considered",
        guidance:
          "Mark this concern considered once you’ve reviewed it. This does not mean you agree with it or that it is resolved. Request a change if it needs an answer.",
      };
    default:
      return {
        value: "accepted" as const,
        label: "Accept",
        done: "Accepted",
        guidance: "",
      };
  }
}
export function assessmentText(
  kind: PlanObject["kind"],
  assessment: Assessment,
) {
  if (assessment === "accepted") return reviewAction(kind).done;
  return {
    confirmed: "Confirmed",
    acknowledged: "Acknowledged",
    considered: "Considered",
    question: "Question",
    change_requested: "Change requested",
  }[assessment];
}
export function needsRevision(assessment: string) {
  return assessment === "question" || assessment === "change_requested";
}

export function hasRevisionFeedback(review: Review) {
  return (
    Boolean(review.overallNote.trim()) ||
    Object.values(review.assessments).some(needsRevision) ||
    review.comments.some((note) => !note.resolved && note.kind !== "comment")
  );
}
