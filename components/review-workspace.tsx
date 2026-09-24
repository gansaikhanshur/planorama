"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import logo from "@/public/planorama.png";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Circle,
  FileCode2,
  Info,
  GitBranch,
  Layers3,
  ListChecks,
  LoaderCircle,
  MessageCircle,
  Network,
  PanelRightClose,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SessionDetails } from "./session-details";
import {
  reviewAction,
  assessmentText,
  needsRevision,
  hasRevisionFeedback,
} from "@/lib/review-actions";
import type { DeliveryStatus } from "@/lib/handoff";
import { feedbackMarkdown } from "@/lib/feedback";
import { affectedObjects } from "@/lib/graph";
import {
  type Assessment,
  type PlanObject,
  type Review,
  type Session,
} from "@/lib/schema";

const PlanMap = dynamic(() => import("./plan-map"), {
  ssr: false,
  loading: () => <div className="empty-state">Loading the dependency map…</div>,
});
import {
  diagramViews,
  reviewSections,
  reviewPrompts,
  type View,
} from "@/lib/presentation";
const viewIcons: Record<View, typeof Layers3> = {
  overview: Layers3,
  decisions: GitBranch,
  attention: TriangleAlert,
  steps: ListChecks,
  supporting: Layers3,
  map: Network,
  files: FileCode2,
  feedback: MessageCircle,
};

const viewCopy: Record<View, { title: string; description: string }> = {
  overview: { title: "Overview", description: "" },
  decisions: {
    title: "Key decisions",
    description:
      "Review the choices that shape this plan: why each was made, the alternatives, and the consequences.",
  },
  attention: {
    title: "Assumptions & risks",
    description:
      "Check what the plan takes for granted, what could go wrong, and which objections need an answer.",
  },
  steps: {
    title: "Implementation",
    description:
      "Review the proposed work and its prerequisites. Open a step to inspect its details and files.",
  },
  supporting: {
    title: "Supporting detail",
    description:
      "Inspect the claims, components, and other details behind this proposal.",
  },
  map: {
    title: "Diagrams",
    description: "Explore the views provided for this plan.",
  },
  files: {
    title: "Proposed files",
    description:
      "Trace each proposed file change to the decisions and steps that require it.",
  },
  feedback: {
    title: "Your review",
    description:
      "Review only what matters to you. You can return partial feedback; untouched items remain unreviewed.",
  },
};

export function ReviewWorkspace({ initial }: { initial: Session }) {
  const { plan, source } = initial;
  const navigation = useMemo(() => reviewSections(plan), [plan]);
  const diagrams = useMemo(() => diagramViews(plan), [plan]);
  const [diagramKey, setDiagramKey] = useState(diagrams[0]?.key ?? "");
  const activeDiagram =
    diagrams.find((d) => d.key === diagramKey) ?? diagrams[0];
  const firstReviewView =
    navigation.find((item) => item.group === "review")?.id ?? "supporting";
  const [review, setReview] = useState<Review>(initial.review);
  const [savedAt, setSavedAt] = useState(initial.review.updatedAt);
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [dirty, setDirty] = useState(false);
  const [comment, setComment] = useState("");
  const hasEdits = dirty || Boolean(comment.trim());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [handoff, setHandoff] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showOverallNote, setShowOverallNote] = useState(false);
  const [revisionReasonRequired, setRevisionReasonRequired] = useState(false);
  const overallNoteInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (handoff && (showOverallNote || revisionReasonRequired))
      overallNoteInput.current?.focus();
  }, [handoff, showOverallNote, revisionReasonRequired]);
  const [delivery, setDelivery] = useState<DeliveryStatus>({
    connected: false,
    submittedAt: null,
    deliveredAt: null,
  });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/handoff", { cache: "no-store" });
        if (!response.ok) throw new Error("Connection unavailable");
        const status: DeliveryStatus = await response.json();
        if (!stopped) setDelivery(status);
      } catch {
        if (!stopped)
          setDelivery({
            connected: false,
            submittedAt: null,
            deliveredAt: null,
          });
      }
      if (!stopped) timer = setTimeout(poll, 2000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  const finished = !hasEdits && review.disposition !== "in_review";
  const delivered =
    delivery.submittedAt === savedAt && Boolean(delivery.deliveredAt);
  const completionTitle =
    review.disposition === "approved"
      ? "Plan approved"
      : review.disposition === "request_changes"
        ? "Revision requested"
        : "Review finished";
  const completionText = finished
    ? delivered
      ? review.disposition === "approved"
        ? "Your plan has been approved and sent back to the agent."
        : review.disposition === "request_changes"
          ? "Your revision request and notes have been sent to the agent."
          : "Your feedback has been sent to the agent."
      : delivery.connected
        ? `${completionTitle}. Sending it to your agent…`
        : `${completionTitle} and saved. Your agent is not connected; it will receive this when it resumes.`
    : "";
  function downloadFeedback() {
    const url = URL.createObjectURL(
      new Blob([feedbackMarkdown(plan, review)], { type: "text/markdown" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${plan.id}-feedback.md`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const handoffDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = handoffDialog.current;
    if (handoff && dialog) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [handoff]);
  const [noteAction, setNoteAction] = useState<
    "question" | "change_requested" | null
  >(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (noteAction) noteInput.current?.focus();
  }, [noteAction]);
  const object = plan.objects.find((o) => o.id === selected);
  const positiveAction = reviewAction(object?.kind ?? "decision");
  const activeAssessment =
    noteAction ??
    (object &&
      (review.assessments[object.id] === "accepted"
        ? positiveAction.value
        : review.assessments[object.id]));
  const covered = new Set([
    ...Object.keys(review.assessments),
    ...review.comments.map((c) => c.objectId),
    ...(selected && comment.trim() ? [selected] : []),
  ]).size;
  const unreviewed = plan.objects.length - covered;
  const openComments = review.comments.filter((c) => !c.resolved);
  const blockers =
    Boolean(comment.trim() && noteAction) ||
    Object.values(review.assessments).some(needsRevision) ||
    openComments.some((c) => c.kind !== "comment");
  const steps = plan.objects.filter((o) => o.kind === "step");
  const risks = plan.objects.filter((o) =>
    ["assumption", "risk", "objection"].includes(o.kind),
  );
  const files = useMemo(
    () => [...new Set(plan.objects.flatMap((o) => o.files))].sort(),
    [plan],
  );
  const impact = useMemo(
    () => (object ? affectedObjects(plan, object.id) : new Set<string>()),
    [object, plan],
  );
  const matches = (o: PlanObject) =>
    (filter === "all" ||
      (filter === "unreviewed"
        ? !review.assessments[o.id]
        : o.kind === filter)) &&
    `${o.title} ${o.summary} ${o.id} ${o.files.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
  const edit = (next: Review) => {
    setReview({ ...next, disposition: "in_review" });
    setDirty(true);
    setNotice("");
    setError("");
  };
  const select = (id: string) => {
    if (id === selected) return;
    if (
      comment.trim() &&
      id !== selected &&
      !window.confirm(
        "Discard your unfinished comment and inspect another item?",
      )
    )
      return;
    setSelected(id);
    setComment("");
    setNoteAction(null);
  };
  const closeInspector = () => {
    if (comment.trim() && !window.confirm("Discard your unfinished comment?"))
      return;
    setSelected(null);
    setComment("");
    setNoteAction(null);
  };
  const navigate = (next: View, preserveNote = false) => {
    if (comment.trim()) {
      if (preserveNote) edit(withNote());
      else if (
        !window.confirm("Discard your unfinished comment and switch sections?")
      )
        return;
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
    setFilter("all");
    setQuery("");
    setSelected(null);
    setComment("");
    setNoteAction(null);
  };
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || comment.trim()) event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, comment]);
  function requestRevision() {
    if (!hasRevisionFeedback(withNote())) {
      setRevisionReasonRequired(true);
      setShowOverallNote(true);
      overallNoteInput.current?.focus();
      return;
    }
    void save(true, "request_changes");
  }
  async function save(
    finalize = false,
    disposition: Review["disposition"] = "in_review",
  ) {
    if (saving) return;
    if (finalize && finished) {
      setShowConfirmation(true);
      setHandoff(true);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review: { ...withNote(), disposition },
          expectedUpdatedAt: savedAt,
          finalize,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setReview(data.review);
      setSavedAt(data.review.updatedAt);
      setDirty(false);
      setComment("");
      setNoteAction(null);
      setRevisionReasonRequired(false);
      setShowConfirmation(finalize);
      setHandoff(finalize);
      setNotice(
        finalize
          ? ""
          : "Draft saved on this machine. Reopen this session to continue.",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Save failed. Your review is still on this page.",
      );
    } finally {
      setSaving(false);
    }
  }
  function assess(value: Assessment) {
    if (!object) return;
    if (value === "question" || value === "change_requested") {
      setNoteAction(value);
      noteInput.current?.focus();
      return;
    }
    if (activeAssessment === positiveAction.value) {
      const assessments = { ...review.assessments };
      delete assessments[object.id];
      edit({ ...review, assessments });
      return;
    }
    if (
      comment.trim() &&
      !window.confirm(
        `Discard this unfinished note and mark the item ${positiveAction.done.toLowerCase()}?`,
      )
    )
      return;
    edit({
      ...review,
      assessments: { ...review.assessments, [object.id]: positiveAction.value },
      comments: review.comments.map((c) =>
        c.objectId === object.id &&
        c.kind !== "comment" &&
        !["risk", "objection"].includes(object.kind)
          ? { ...c, resolved: true }
          : c,
      ),
    });
    setComment("");
    setNoteAction(null);
  }
  function withNote(): Review {
    if (!object || !comment.trim() || !noteAction) return review;
    return {
      ...review,
      assessments: { ...review.assessments, [object.id]: noteAction },
      comments: [
        ...review.comments,
        {
          id: crypto.randomUUID(),
          objectId: object.id,
          kind: noteAction === "question" ? "question" : "objection",
          body: comment.trim(),
          createdAt: new Date().toISOString(),
          resolved: false,
        },
      ],
    };
  }
  function addComment(event: React.FormEvent) {
    event.preventDefault();
    if (!object || !comment.trim() || !noteAction) return;
    edit(withNote());
    setComment("");
    setNoteAction(null);
  }
  function toggleNote(id: string) {
    const note = review.comments.find((c) => c.id === id);
    if (!note) return;
    const comments = review.comments.map((c) =>
      c.id === id ? { ...c, resolved: !c.resolved } : c,
    );
    const open = comments.filter(
      (c) =>
        c.objectId === note.objectId && !c.resolved && c.kind !== "comment",
    );
    const assessments = { ...review.assessments };
    if (open.length)
      assessments[note.objectId] = open.some((c) => c.kind === "objection")
        ? "change_requested"
        : "question";
    else if (needsRevision(assessments[note.objectId]))
      delete assessments[note.objectId];
    edit({ ...review, comments, assessments });
  }
  function reviewStatus(item: PlanObject) {
    const status = review.assessments[item.id];
    return status ? (
      <span className={`assessment ${status}`}>
        {!needsRevision(status) ? (
          <Check size={12} />
        ) : (
          <MessageCircle size={12} />
        )}{" "}
        {assessmentText(item.kind, status)}
      </span>
    ) : (
      <span className="unreviewed">
        <Circle size={10} />{" "}
        {review.comments.some((c) => c.objectId === item.id)
          ? "Commented"
          : "Unreviewed"}
      </span>
    );
  }
  function card(item: PlanObject, index: number) {
    const count = affectedObjects(plan, item.id).size;
    return (
      <button
        key={item.id}
        className={`decision-card kind-${item.kind} ${selected === item.id ? "is-selected" : ""}`}
        onClick={() => select(item.id)}
      >
        <div className="card-top">
          <span className="eyebrow">
            <span className="type-dot" />
            {item.kind}{" "}
            <span className="number">{String(index + 1).padStart(2, "0")}</span>
          </span>
          <ArrowUpRight size={17} />
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
        <div className="card-bottom">
          {reviewStatus(item)}
          <span>
            {count ? (
              <>
                <GitBranch size={13} />
                {count} downstream
              </>
            ) : (
              <>
                <MessageCircle size={13} />
                {
                  review.comments.filter((c) => c.objectId === item.id).length
                }{" "}
                notes
              </>
            )}
          </span>
        </div>
      </button>
    );
  }
  function sectionHeader(title: string, count: number, subtitle?: string) {
    return (
      <div className="section-heading">
        <div>
          <h2>
            {title}
            <span className="count">{count}</span>
          </h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
    );
  }
  const filteredObjects = plan.objects.filter(matches);
  return (
    <div className={`workspace ${object ? "with-inspector" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <a
            className="brand"
            aria-label="Planorama overview"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("overview");
            }}
          >
            <span className="brand-wordmark">
              <Image
                src={logo}
                alt=""
                sizes="(max-width: 560px) 126px, (max-width: 1200px) 166px, 184px"
                priority
              />
            </span>
            <span className="brand-initial" aria-hidden="true">
              P
            </span>
          </a>
          <div className="project-switch">
            <span className="project-icon">
              <FileCode2 size={17} />
            </span>
            <div>
              <strong title={source.name}>{source.name}</strong>
              <span>{initial.demo ? "Example plan" : "Current plan"}</span>
            </div>
          </div>
        </div>
        <nav aria-label="Plan views" tabIndex={0}>
          {navigation.map(({ id, label, group }, index) => {
            const Icon = viewIcons[id];
            return (
              <Fragment key={id}>
                {group !== navigation[index - 1]?.group &&
                  group !== "start" && (
                    <span className="nav-group">
                      {group === "review"
                        ? "REVIEW"
                        : group === "reference"
                          ? "EXPLORE"
                          : "FEEDBACK"}
                    </span>
                  )}
                <button
                  aria-label={label}
                  title={label}
                  aria-current={view === id ? "page" : undefined}
                  className={view === id ? "active" : ""}
                  onClick={() => navigate(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {id === "feedback" && openComments.length > 0 && (
                    <span className="nav-count">{openComments.length}</span>
                  )}
                </button>
              </Fragment>
            );
          })}
        </nav>
        <label className="mobile-section-nav">
          <span>Review section</span>
          <select
            aria-label="Review section"
            value={view}
            onChange={(e) => navigate(e.target.value as View)}
          >
            {navigation.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="session-trigger"
            aria-label="Review details"
            title="Review details, saved files, and how to resume"
            onClick={() => setShowDetails(true)}
          >
            <Info size={16} />
            <span>Review details</span>
          </button>
          <div className="topbar-actions">
            <span className={`save-status ${hasEdits ? "unsaved" : ""}`}>
              {saving
                ? "Saving…"
                : hasEdits
                  ? "Unsaved changes"
                  : review.updatedAt.startsWith("1970")
                    ? "Ready to review"
                    : "Saved locally"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => save()}
              disabled={saving || !hasEdits}
            >
              Save draft
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowConfirmation(finished);
                setRevisionReasonRequired(false);
                setShowOverallNote(Boolean(review.overallNote.trim()));
                setHandoff(true);
              }}
              disabled={saving}
            >
              {finished ? "Review submitted" : "Finish review"}
              {finished ? <Check /> : <ArrowUpRight />}
            </Button>
          </div>
        </header>
        <main className="main-content" id="main-content">
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {(notice || completionText) && !handoff && (
            <div className="alert success" role="status">
              <Check size={17} />
              <span>
                {completionText || notice}{" "}
                {finished && (
                  <button className="notice-link" onClick={downloadFeedback}>
                    Download a copy
                  </button>
                )}{" "}
                <button
                  className="notice-link"
                  onClick={() => setShowDetails(true)}
                >
                  Review details
                </button>
              </span>
              {!finished && (
                <button
                  aria-label="Dismiss message"
                  onClick={() => setNotice("")}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}
          <div
            className={`page-heading ${view === "overview" ? "overview-heading" : ""}`}
          >
            <span className="eyebrow">
              <span className="heading-line" />
              {view === "overview"
                ? initial.demo
                  ? "OVERVIEW · EXAMPLE PLAN"
                  : "OVERVIEW"
                : plan.title}
            </span>
            <h1>
              {view === "overview"
                ? plan.title
                : view === "map"
                  ? activeDiagram?.title
                  : viewCopy[view].title}
            </h1>
            <p>
              {view === "overview"
                ? plan.summary
                : view === "map"
                  ? activeDiagram?.description
                  : viewCopy[view].description}
            </p>
          </div>
          {plan.extraction === "basic" && (
            <div className="alert basic">
              <Sparkles size={17} />
              <span>
                <strong>Basic Markdown import.</strong> Sections are grouped by
                explicit headings. Reasoning and diagrams have not been
                inferred.
              </span>
            </div>
          )}
          {view === "overview" && (
            <section className="overview-brief">
              <div className="review-focus-heading">
                <h2>What to look for</h2>
                <span>Review as much or as little as you need.</span>
              </div>
              <ul className="review-prompts">
                {reviewPrompts(plan).map((prompt, index) => (
                  <li key={index}>{prompt}</li>
                ))}
              </ul>
              <div className="overview-action">
                <Button onClick={() => navigate(firstReviewView)}>
                  Start review
                  <ArrowRight />
                </Button>
              </div>
            </section>
          )}
          {view !== "overview" && view !== "map" && (
            <div className="content-toolbar">
              <div className="filter-tabs" aria-label="Filter objects">
                {["decisions", "attention", "steps", "supporting"].includes(
                  view,
                ) ? (
                  [
                    ["all", "All items"],
                    ["unreviewed", "Unassessed"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={filter === value ? "active" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))
                ) : (
                  <span className="toolbar-caption">
                    {view === "feedback"
                      ? `${openComments.length} open notes`
                      : `${files.length} proposed files`}
                  </span>
                )}
              </div>
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Search plan objects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    view === "files" ? "Find a file…" : "Search this section…"
                  }
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>
          )}
          {(view === "decisions" || view === "supporting") && (
            <section>
              <div className="decision-grid">
                {filteredObjects
                  .filter((o) =>
                    view === "decisions"
                      ? o.kind === "decision"
                      : ["claim", "file", "component"].includes(o.kind),
                  )
                  .sort(
                    (a, b) =>
                      Number(b.importance === "critical") -
                      Number(a.importance === "critical"),
                  )
                  .map(card)}
              </div>
              {!filteredObjects.some((o) =>
                view === "decisions"
                  ? o.kind === "decision"
                  : ["claim", "file", "component"].includes(o.kind),
              ) && (
                <div className="empty-state">
                  No matching items. Try another search or filter.
                </div>
              )}
            </section>
          )}
          {view === "attention" && (
            <section>
              {(
                [
                  ["assumption", "Assumptions to confirm"],
                  ["risk", "Risks to address"],
                  ["objection", "Objections to consider"],
                ] as const
              ).map(([kind, title]) => {
                const items = risks.filter(
                  (o) => o.kind === kind && matches(o),
                );
                return items.length ? (
                  <div className="attention-group" key={kind}>
                    {sectionHeader(title, items.length)}
                    <div className="attention-list">
                      {items.map((item) => (
                        <button
                          key={item.id}
                          className={`attention-row kind-${item.kind}`}
                          onClick={() => select(item.id)}
                        >
                          <span className="attention-icon">
                            <TriangleAlert size={17} />
                          </span>
                          <span className="attention-copy">
                            <strong>{item.title}</strong>
                            <span className="attention-summary">
                              {item.summary}
                            </span>
                          </span>
                          {reviewStatus(item)}
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })}
              {!risks.some(matches) && (
                <div className="empty-state">
                  No matching assumptions, risks, or objections.
                </div>
              )}
            </section>
          )}
          {view === "map" && activeDiagram && (
            <section className="graph-section">
              {diagrams.length > 1 && (
                <label className="diagram-picker">
                  View
                  <select
                    aria-label="Diagram view"
                    value={activeDiagram.key}
                    onChange={(e) => setDiagramKey(e.target.value)}
                  >
                    {diagrams.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label} · {d.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <PlanMap
                key={activeDiagram.key}
                plan={plan}
                diagram={activeDiagram.diagram}
                review={review}
                selected={selected}
                onSelect={select}
              />
              <p className="diagram-caption">
                Drag to pan. Use + and − to zoom. Select an item for its full
                details.{" "}
                {activeDiagram.diagram
                  ? "Arrows show the labeled interactions in this view."
                  : "Dependency arrows run from prerequisite to dependent. Dashed links show supporting reasoning, effects, or challenges."}
              </p>
            </section>
          )}
          {view === "steps" && (
            <section className="implementation-list">
              {steps.filter(matches).map((step, index) => (
                <button
                  key={step.id}
                  className="implementation-row"
                  onClick={() => select(step.id)}
                >
                  <span className="step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.summary}</p>
                    <div className="prerequisites">
                      {plan.edges
                        .filter(
                          (e) =>
                            e.from === step.id && e.relation === "depends_on",
                        )
                        .map((e) => (
                          <span key={e.id}>
                            <GitBranch size={12} />
                            Requires:{" "}
                            {plan.objects.find((o) => o.id === e.to)?.title}
                          </span>
                        ))}
                    </div>
                  </div>
                  {reviewStatus(step)}
                  <ArrowUpRight size={17} />
                </button>
              ))}
              {steps.filter(matches).length === 0 && (
                <div className="empty-state">
                  No implementation steps match this view.
                </div>
              )}
            </section>
          )}
          {view === "files" && (
            <section className="file-list">
              {files
                .filter((file) =>
                  file.toLowerCase().includes(query.toLowerCase()),
                )
                .map((file) => (
                  <div className="file-row" key={file}>
                    <div>
                      <FileCode2 size={18} />
                      <code>{file}</code>
                    </div>
                    <div>
                      {plan.objects
                        .filter((o) => o.files.includes(file))
                        .map((o) => (
                          <button key={o.id} onClick={() => select(o.id)}>
                            <span className={`type-dot kind-${o.kind}`} />
                            {o.title}
                            <ArrowUpRight size={12} />
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              {files.filter((file) =>
                file.toLowerCase().includes(query.toLowerCase()),
              ).length === 0 && (
                <div className="empty-state">
                  No proposed files match this view.
                </div>
              )}
            </section>
          )}
          {view === "feedback" && (
            <section id="your-review">
              {review.overallNote.trim() && (
                <div className="overall-review-note">
                  <h2>Overall note</h2>
                  <p>{review.overallNote}</p>
                </div>
              )}
              {plan.objects
                .filter(
                  (o) =>
                    matches(o) &&
                    (review.assessments[o.id] ||
                      review.comments.some((c) => c.objectId === o.id)),
                )
                .map((o) => (
                  <div key={o.id} className="feedback-group">
                    <button
                      className="feedback-group-heading"
                      onClick={() => select(o.id)}
                    >
                      <span>
                        <span className="eyebrow">{o.kind}</span>
                        <strong>{o.title}</strong>
                      </span>
                      {reviewStatus(o)}
                      <ArrowUpRight size={16} />
                    </button>
                    {review.comments
                      .filter((c) => c.objectId === o.id)
                      .map((c) => (
                        <div
                          key={c.id}
                          className={`review-comment ${c.resolved ? "resolved" : ""}`}
                        >
                          <div>
                            <span className="comment-kind">
                              {c.kind === "objection"
                                ? "Change requested"
                                : c.kind}
                            </span>
                            <button
                              disabled={saving}
                              onClick={() => toggleNote(c.id)}
                            >
                              {c.resolved ? "Reopen" : "Resolve"}
                              {c.resolved && <Check size={12} />}
                            </button>
                          </div>
                          <p>{c.body}</p>
                        </div>
                      ))}
                  </div>
                ))}
              {!review.overallNote.trim() &&
                !plan.objects.some(
                  (o) =>
                    matches(o) &&
                    (review.assessments[o.id] ||
                      review.comments.some((c) => c.objectId === o.id)),
                ) && (
                  <div className="empty-state">
                    <MessageCircle size={28} />
                    <h3>
                      {query
                        ? "No matching feedback"
                        : "Your perspective belongs here."}
                    </h3>
                    <p>
                      {query
                        ? "Try another search."
                        : "Open any object to accept it, ask a question, or challenge its reasoning."}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigate(firstReviewView);
                      }}
                    >
                      Explore the plan
                      <ArrowRight />
                    </Button>
                  </div>
                )}
            </section>
          )}
        </main>
      </div>
      {object && (
        <aside className="inspector" aria-label="Object inspector">
          <div className="inspector-heading">
            <span className={`eyebrow kind-${object.kind}`}>
              <span className="type-dot" />
              {object.kind}
            </span>
            <button aria-label="Close inspector" onClick={closeInspector}>
              <PanelRightClose size={18} />
            </button>
          </div>
          <div className="inspector-scroll">
            <div className="object-id">{object.id}</div>
            <h2>{object.title}</h2>
            <p className="object-summary">{object.summary}</p>
            {positiveAction.guidance && (
              <p className="review-guidance">{positiveAction.guidance}</p>
            )}
            <div
              className="assessment-controls"
              aria-label="Assess this object"
            >
              {(
                [
                  [positiveAction.value, positiveAction.label],
                  ["question", "Question"],
                  ["change_requested", "Change"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  disabled={saving}
                  key={value}
                  variant="outline"
                  size="sm"
                  aria-pressed={activeAssessment === value}
                  className={`${value === positiveAction.value ? "positive" : value} ${activeAssessment === value ? "chosen" : ""}`}
                  onClick={() => assess(value)}
                >
                  <span className="assessment-label">
                    {value === positiveAction.value &&
                    activeAssessment === positiveAction.value
                      ? positiveAction.done
                      : label}
                  </span>
                </Button>
              ))}
            </div>
            {noteAction && (
              <form className="object-note-form" onSubmit={addComment}>
                <label htmlFor="object-note">
                  {noteAction === "question"
                    ? "What would you like clarified?"
                    : "What should change?"}
                </label>
                <textarea
                  disabled={saving}
                  ref={noteInput}
                  id="object-note"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={10000}
                  rows={3}
                />
                <div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!comment.trim() || saving}
                  >
                    {noteAction === "question"
                      ? "Add question"
                      : "Request change"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setComment("");
                      setNoteAction(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {review.comments.some(
              (c) =>
                c.objectId === object.id && !c.resolved && c.kind !== "comment",
            ) && (
              <p className="accept-hint">
                {["risk", "objection"].includes(object.kind)
                  ? "Open questions and change requests still need answers before plan approval."
                  : "Confirming this item resolves its open questions and change requests."}
              </p>
            )}
            {(object.context ||
              object.rationale ||
              object.alternatives.length > 0 ||
              object.consequences.length > 0) && (
              <div className="argument-sections">
                {object.context && (
                  <div>
                    <h3>Context</h3>
                    <p>{object.context}</p>
                  </div>
                )}
                {object.rationale && (
                  <div>
                    <h3>Why this approach</h3>
                    <p>{object.rationale}</p>
                  </div>
                )}
                {object.alternatives.length > 0 && (
                  <details>
                    <summary>
                      Alternatives considered
                      <span>{object.alternatives.length}</span>
                    </summary>
                    {object.alternatives.map((a, i) => (
                      <div className="alternative" key={i}>
                        <strong>{a.title}</strong>
                        <p>{a.tradeoff}</p>
                      </div>
                    ))}
                  </details>
                )}
                {object.consequences.length > 0 && (
                  <details>
                    <summary>
                      Consequences<span>{object.consequences.length}</span>
                    </summary>
                    <ul>
                      {object.consequences.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            {object.kind === "decision" && !object.rationale && (
              <div className="missing-detail">
                No rationale recorded. Ask the agent to explain why this choice
                is preferable.
              </div>
            )}
            {impact.size > 0 && (
              <div className="impact-box">
                <GitBranch size={16} />
                <div>
                  <strong>
                    {impact.size} downstream{" "}
                    {impact.size === 1 ? "object" : "objects"}
                  </strong>
                  <p>Changing this may affect:</p>
                  {plan.objects
                    .filter((o) => impact.has(o.id))
                    .map((o) => (
                      <button key={o.id} onClick={() => select(o.id)}>
                        {o.title}
                        <ArrowUpRight size={12} />
                      </button>
                    ))}
                </div>
              </div>
            )}
            {plan.edges.some(
              (e) => e.from === object.id || e.to === object.id,
            ) && (
              <details className="relations">
                <summary>
                  Connected reasoning
                  <span>
                    {
                      plan.edges.filter(
                        (e) => e.from === object.id || e.to === object.id,
                      ).length
                    }
                  </span>
                </summary>
                {plan.edges
                  .filter((e) => e.from === object.id || e.to === object.id)
                  .map((e) => {
                    const other = plan.objects.find(
                      (o) => o.id === (e.from === object.id ? e.to : e.from),
                    )!;
                    const label =
                      e.from === object.id
                        ? e.relation.replaceAll("_", " ")
                        : {
                            depends_on: "required by",
                            supports: "supported by",
                            challenges: "challenged by",
                            affects: "affected by",
                          }[e.relation];
                    return (
                      <button key={e.id} onClick={() => select(other.id)}>
                        <span>{label}</span>
                        {other.title}
                        {e.rationale && <small>{e.rationale}</small>}
                      </button>
                    );
                  })}
              </details>
            )}
            {object.files.length > 0 && (
              <details className="source-details">
                <summary>
                  Proposed files<span>{object.files.length}</span>
                </summary>
                {object.files.map((file) => (
                  <code key={file}>{file}</code>
                ))}
              </details>
            )}
            {object.source ? (
              <details className="source-details">
                <summary>
                  View source
                  <span>
                    L{object.source.startLine}–{object.source.endLine}
                  </span>
                </summary>
                <pre>
                  {source.markdown
                    .split(/\r?\n/)
                    .slice(object.source.startLine - 1, object.source.endLine)
                    .map(
                      (line, index) =>
                        `${String(object.source!.startLine + index).padStart(3, " ")}  ${line}`,
                    )
                    .join("\n")}
                </pre>
              </details>
            ) : (
              <p className="missing-detail">No source reference recorded.</p>
            )}
            {review.comments.some((c) => c.objectId === object.id) && (
              <section className="comment-section">
                <div className="section-heading">
                  <h3>
                    Your notes
                    <span className="count">
                      {
                        review.comments.filter((c) => c.objectId === object.id)
                          .length
                      }
                    </span>
                  </h3>
                </div>
                {review.comments
                  .filter((c) => c.objectId === object.id)
                  .map((c) => (
                    <div
                      key={c.id}
                      className={`review-comment ${c.resolved ? "resolved" : ""}`}
                    >
                      <div>
                        <span className="comment-kind">
                          {c.kind === "objection" ? "Change requested" : c.kind}
                        </span>
                        <button
                          disabled={saving}
                          onClick={() => toggleNote(c.id)}
                        >
                          {c.resolved ? "Reopen" : "Resolve"}
                          {c.resolved && <Check size={12} />}
                        </button>
                      </div>
                      <p>{c.body}</p>
                    </div>
                  ))}
              </section>
            )}
          </div>
        </aside>
      )}
      {showDetails && (
        <SessionDetails
          session={initial}
          delivery={delivery}
          savedAt={savedAt}
          dirty={dirty || Boolean(comment.trim())}
          readyForHandoff={
            !dirty && !comment.trim() && review.disposition !== "in_review"
          }
          onClose={() => setShowDetails(false)}
        />
      )}
      {handoff && (
        <dialog
          ref={handoffDialog}
          className="modal-backdrop finish-dialog"
          aria-labelledby="handoff-title"
          onCancel={(e) => {
            if (saving) e.preventDefault();
            else setHandoff(false);
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setHandoff(false);
          }}
        >
          <section className="handoff-modal finish-modal">
            <div className="finish-toolbar">
              <button
                className="finish-close"
                aria-label="Close handoff"
                onClick={() => setHandoff(false)}
                disabled={saving}
              >
                <X size={20} />
              </button>
            </div>
            {showConfirmation ? (
              <div className="completion-confirmation" role="status">
                <Check size={32} />
                <h2 id="handoff-title">{completionTitle}</h2>
                <p>{completionText}</p>
                {delivered && <p>You can return to the agent conversation.</p>}
                <Button onClick={() => setHandoff(false)}>Done</Button>
              </div>
            ) : (
              <>
                <h2 id="handoff-title">Finish your review</h2>
                <p>
                  {unreviewed
                    ? `${unreviewed} items left unreviewed. Approving accepts the whole plan; requesting a revision sends your feedback without approving it.`
                    : "Approve the plan, or send your feedback back for a revision."}
                </p>
                <div className="handoff-actions finish-decisions">
                  <Button
                    disabled={saving || blockers}
                    onClick={() => save(true, "approved")}
                  >
                    <Check />
                    Approve entire plan
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      saving ||
                      (revisionReasonRequired &&
                        !hasRevisionFeedback(withNote()))
                    }
                    onClick={requestRevision}
                  >
                    <ArrowRight />
                    Request revision
                  </Button>
                </div>
                <section
                  className="overall-note-section"
                  aria-label="Overall review note"
                >
                  {!showOverallNote && !revisionReasonRequired && (
                    <Button
                      variant="outline"
                      className="overall-note-toggle"
                      onClick={() => setShowOverallNote(true)}
                    >
                      <MessageCircle aria-hidden="true" />
                      <span>Add an overall note</span>
                    </Button>
                  )}
                  {(showOverallNote || revisionReasonRequired) && (
                    <div className="overall-note-form">
                      <label htmlFor="overall-review-note">
                        {revisionReasonRequired
                          ? "What would you like revised?"
                          : "Overall note (optional)"}
                      </label>
                      {revisionReasonRequired && (
                        <p id="revision-reason-help">
                          There are no open questions or change requests. Tell
                          the agent what to revise.
                        </p>
                      )}
                      <Textarea
                        ref={overallNoteInput}
                        id="overall-review-note"
                        aria-describedby={
                          revisionReasonRequired
                            ? "revision-reason-help"
                            : undefined
                        }
                        aria-required={revisionReasonRequired}
                        value={review.overallNote}
                        disabled={saving}
                        onChange={(event) =>
                          edit({ ...review, overallNote: event.target.value })
                        }
                        maxLength={10000}
                        rows={5}
                      />
                    </div>
                  )}
                </section>
                {blockers && (
                  <p className="handoff-warning">
                    Your open questions and change requests will be included. No
                    need to repeat them. Resolve them before approving.{" "}
                    <a
                      href="#your-review"
                      className="review-return-link"
                      onClick={(event) => {
                        event.preventDefault();
                        navigate("feedback", true);
                        setHandoff(false);
                      }}
                    >
                      View your review{" "}
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  </p>
                )}
                <p className="delivery-note">
                  {delivery.connected
                    ? "Your agent is waiting. Either choice sends your review back automatically."
                    : "Your agent is not connected. Your review will be saved for pickup when it resumes."}
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="handoff-warning">
                {error}
              </p>
            )}
          </section>
        </dialog>
      )}
    </div>
  );
}
