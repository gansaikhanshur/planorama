"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/schema";
import type { DeliveryStatus } from "@/lib/handoff";

export function SessionDetails({
  session,
  delivery,
  savedAt,
  dirty,
  readyForHandoff,
  onClose,
}: {
  session: Session;
  delivery: DeliveryStatus;
  savedAt: string;
  dirty: boolean;
  readyForHandoff: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const saved = !savedAt.startsWith("1970");
  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, []);
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus(`${label} copied.`);
    } catch {
      setCopyStatus("Copy is unavailable. Select and copy the text below.");
    }
  }
  const resumeMessage = `Use Planorama to resume my saved review from this session file: ${session.sessionPath}`;
  const feedbackMessage = `Read my Planorama feedback in ${session.outputDir}. Check handoff.json against review.json, follow the recorded review disposition, and address my comments. Items left unreviewed are not individually accepted.`;
  return (
    <dialog
      ref={dialog}
      className="modal-backdrop"
      aria-labelledby="session-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="handoff-modal session-details">
        <button
          className="modal-close"
          aria-label="Close review details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2 id="session-title">Review details</h2>
        <p>
          This local session reviews one plan. The revision identifies the
          version your feedback belongs to.
        </p>
        <dl className="session-metadata">
          <dt>Plan</dt>
          <dd>{session.plan.title}</dd>
          <dt>Source</dt>
          <dd>
            <code>{session.source.path}</code>
          </dd>
          <dt>Revision</dt>
          <dd>{session.plan.revision}</dd>
        </dl>
        <h3>Your saved draft</h3>
        <p>
          {saved
            ? `Last saved ${new Date(savedAt).toLocaleString()}.`
            : "No draft saved yet."}{" "}
          {dirty ? "Changes on this page have not been saved." : ""}
        </p>
        <p>
          Save draft writes <code>review.json</code> and{" "}
          <code>feedback.md</code> to this folder on your machine:
        </p>
        <div className="session-copy">
          <code>{session.outputDir}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(session.outputDir, "Folder path")}
          >
            <Copy />
            Copy path
          </Button>
        </div>
        <h3>Continue later</h3>
        <p>
          If the local server is still running, reopen this same URL to restore
          your saved draft. Closing the browser does not delete it.
        </p>
        <code className="session-url">
          {typeof window !== "undefined" ? window.location.origin : ""}
        </code>
        <p>
          If the server has stopped, ask your agent to resume the saved session:
        </p>
        <textarea
          aria-label="Message to resume review"
          readOnly
          rows={3}
          value={resumeMessage}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!saved}
          onClick={() => copy(resumeMessage, "Resume message")}
        >
          <Copy />
          Copy resume message
        </Button>
        {!saved && (
          <p className="session-note">
            Save a draft before closing this review.
          </p>
        )}
        <details>
          <summary>Restart from a terminal</summary>
          <code className="session-command">{session.resumeCommand}</code>
          <Button
            size="sm"
            variant="outline"
            disabled={!saved}
            onClick={() => copy(session.resumeCommand, "Resume command")}
          >
            <Copy />
            Copy command
          </Button>
        </details>
        <h3>Return feedback to your agent</h3>
        <p>
          {readyForHandoff &&
          delivery.submittedAt === savedAt &&
          delivery.deliveredAt
            ? "Your feedback was delivered to the agent's waiting tool. Continue in the conversation to see its response."
            : delivery.connected
              ? "Your agent is waiting. Finish review sends your feedback back automatically. Saving a draft does not send it."
              : "No agent is waiting for this session. Ask your agent to resume it using the message above; finished feedback will be picked up automatically."}
        </p>
        <details>
          <summary>Manual handoff</summary>
          <p>
            If your agent cannot wait for this session, use this message after
            finishing your review.
          </p>
          <textarea
            aria-label="Message for agent"
            readOnly
            rows={4}
            value={feedbackMessage}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!readyForHandoff}
            onClick={() => copy(feedbackMessage, "Agent message")}
          >
            <Copy />
            Copy agent message
          </Button>
          {!readyForHandoff && (
            <p className="session-note">
              Finish your latest review before returning it to the agent.
            </p>
          )}
        </details>
        <p className="session-note" role="status">
          {copyStatus}
        </p>
      </section>
    </dialog>
  );
}
