# Local runtime and packaging

The skill directory is self-contained: Next.js App Router, React, TypeScript, Tailwind CSS, a shadcn-style Button primitive, React Flow, and Zod. There is no database, model API, telemetry integration, or cloud backend. The launcher disables Next.js telemetry for the local process.

## Plugin setup

The standard distribution contains `plugin.json`, Claude Code and Codex compatibility manifests, a discoverable `skills/planorama/SKILL.md` entry, the canonical root workflow, and the runtime source. `node scripts/package-plugin.mjs` creates a `.tar.gz`, its SHA-256 checksum, and an extracted catalog under `dist/`. The allowlist excludes installed dependencies, build output, private review sessions, and Git metadata. The included catalogs point at `plugins/planorama` and can be registered with either agent. See [the installation guide](../distribution/INSTALL.md).

The dependency-free entry point is `node <planorama-root>/scripts/planorama.mjs <setup|review|wait|validate>`. It copies runtime source into a content-addressed writable cache, installs locked dependencies with npm, and builds once. Plugin files and the user's project are not modified by setup. The cache key includes source files, platform, architecture, and Node.js major version. A lock serializes concurrent setup and a readiness marker is written after success. Failed setup can be retried; an abruptly terminated process can leave a stale lock, reported with its path. Existing runtime versions are retained for active review servers.

`setup` prints a JSON result with the runtime directory. `review`, `wait`, and `validate` prepare automatically if necessary and then delegate to the corresponding runtime scripts, preserving arguments and exit codes. Setup logs go to stderr, keeping wait results readable as JSON on stdout. First setup needs Node.js 22.13+, npm, registry access, and write access to the runtime cache. It is not instantaneous. Run setup at installation to keep that work out of the first review. Subsequent runs do not reinstall or rebuild.

`PLANORAMA_RUNTIME_HOME` overrides the cache with an absolute path. Defaults: `~/Library/Caches/planorama/runtimes` on macOS and `$XDG_CACHE_HOME/planorama/runtimes` (or `~/.cache/planorama/runtimes`) on Linux. This initial distribution targets macOS and Linux; Windows is not yet verified. Plugin uninstall leaves review files and runtime caches intact.

## Commands

Run these inside the skill directory (use absolute paths to input files):

```sh
npm ci
npm run review -- /path/to/plan.md --model /path/to/planorama.json
npm run review -- --session /path/to/session.json  # resume the same saved review
npm run review -- --no-open                    # bundled example
npm run review -- /path/to/plan.md              # basic import
npm run wait -- --session /path/to/session.json --timeout 55 # agent waits for Finish
npm run validate -- /path/to/planorama.json /path/to/plan.md
npm test
npm run typecheck
npm run build                    # cache the runtime once, not for every plan
npx playwright install chromium   # optional browser-test runtime
npm run test:browser
```

`--session` restores an existing session and its saved feedback. It cannot be combined with a source path, `--model`, or `--out`; the session records these already. The source fingerprint is checked before startup.

Flags: `--port` defaults to `4317`; `--out` overrides the review directory; `--no-open` suppresses the default-browser opener. The server binds to `127.0.0.1`. The launcher returns when ready and leaves the server running, recording its PID in `server.json` and output in `server.log`. Use the printed stop command to end it. `--foreground` keeps it attached, with Ctrl+C stopping it. A busy port is an error rather than a silent fallback to another session. A matching session already running at the requested port is reused without rewriting its files. Cached production servers can run separate sessions on different ports. Only one development server per installed skill directory can run at a time because Next.js uses a development lock.

The launcher prefers a cached production runtime in `.planorama-build/`. `npm run build` creates it and records a fingerprint of app code, configuration, dependencies, and assets. Source plans and review notes do not invalidate it; app edits do. If the build is missing or stale, the launcher falls back to development without building synchronously. `--dev` forces development. Builds are stored in separate release directories and the current build pointer is replaced only after a successful build, keeping assets used by existing servers intact. The production build directory is separate from `.next/`, so preparing it does not delete the development cache. The launcher warms the review page and reports milliseconds from invocation to readiness, excluding agent preparation. Startup readiness has a 60-second deadline. `npm run dev` opens the built-in example at port 3000. A production build can be served with `PLANORAMA_SESSION=/absolute/path/session.json npm start -- --port 4317`.

The validation command prints source and model SHA-256 values for comparison with review files. The model hash is computed from `JSON.stringify(planSchema.parse(model))`, including schema defaults; it is not the hash of the raw JSON file's whitespace.

## Files

The default directory is `<source-directory>/.planorama/<plan-id>-<source-and-model-fingerprint>/`. It contains:

- `session.json`: validated plan model, absolute source path, source SHA-256, original source Markdown, output directory. Completed reviews render this snapshot while the agent edits the next revision; new feedback still requires an unchanged source.
- `review.json`: schema version, plan ID/revision/source and model hashes, timestamp, disposition, per-object assessments, comments, and an optional `overallNote` (defaults to empty for older reviews).
- `feedback.md`: readable counterpart of the latest saved review, with stable object and comment IDs.
- `handoff.json`: last explicit handoff disposition and timestamp. Compare its timestamp to `review.json`; newer draft saves supersede it.
- `listener.json`: temporary heartbeat and process ID for the waiting agent tool. Removed on normal completion/timeout; a crashed process is reclaimed on reconnection.
- `receipt.json`: timestamp of the handoff returned to the agent tool and its delivery time. This records delivery, not completed revisions.

Review assessments are `accepted`, `confirmed` (assumption), `acknowledged` (risk), `considered` (objection), `question`, or `change_requested`; absence means unassessed. Awareness does not mean a risk or objection is resolved. Legacy `accepted` assessments for these types remain readable with contextual labels. Comments have UUIDs, object IDs, a kind (`comment`, `question`, `objection`), body, timestamp, and resolution flag. The Finish dialog offers “Approve entire plan” (`approved`) and “Request revision” (`request_changes`); `feedback_only` remains readable for older feedback. draft edits return it to `in_review`. Users can return feedback on any subset. A new revision submission requires an open question/change-request assessment, an unresolved question/objection note, or a nonblank overall note; an entirely empty review can still be saved as a draft. Older empty revision handoffs remain readable. Existing item feedback sends directly; otherwise Request revision prompts for an overall note. An optional overall note can accompany item feedback. Untouched objects are listed as unreviewed in exported Markdown; missing assessments are never implicit acceptance. The “Approve entire plan” action explicitly approves the whole plan and discloses the unreviewed count, while retaining individual item statuses. Open questions/objections and question/change-request assessments prevent approval.

Object review uses a contextual positive action plus Question and Change. Decisions use Accept, assumptions Confirm, risks Acknowledge, and objections Considered. Accept/Confirm resolves earlier feedback with history preserved. Acknowledge/Considered records awareness while leaving open feedback unresolved. Clicking a selected positive action again clears that assessment; existing notes and their resolution states are preserved. Question and Change open one note field; adding the note records the corresponding assessment and a `question` or `objection` comment. Cancel does not change the assessment. Saving includes text still in the open note field.

Saves are explicit. Review details shows the exact output folder, save time, and a resume command. Closing the browser does not delete saved files: reopening the same URL restores them while the server is running. After the server stops, relaunch with `--session`. Finish writes the explicit handoff. A waiting agent receives it automatically; downloading Markdown is optional. If disconnected, the handoff stays on disk until the agent resumes and waits. The UI warns on navigation away with unsaved edits. Files are written with restrictive permissions and replaced atomically one at a time. This is a single-process local workspace, not collaborative storage: the server serializes writes and rejects saves when another tab has a newer timestamp. JSON is the canonical review if a crash happens between JSON and Markdown writes; a subsequent save regenerates Markdown.

The server accepts same-origin local POST requests only and never takes arbitrary filesystem paths from browser requests. Source content is rendered as plain text. The runtime is intended for a trusted local machine, not network exposure or multi-user deployment.

A source hash change blocks loading and saving until the launcher is restarted. A new source/model fingerprint gets a fresh review; old comments are not automatically carried onto potentially changed meanings. Agents reconcile old feedback using semantic IDs and the original review directory. If manually reusing `--out`, use a different directory for a new plan/revision.

## Agent listener

Immediately after the launcher returns, the invoking skill runs `npm run wait -- --session /absolute/path/session.json --timeout 55`. This separate command leaves the browser/server alive when feedback arrives. It emits one JSON result with `status: review_finished`, the full structured review, and readable feedback, then exits 0. A timeout emits `status: waiting` and exits 2; the active agent repeats the command, respecting cancellation or new user instructions. Other errors exit 1. Only one listener per session is permitted.

The listener validates the source, model, revision, and handoff identity before returning feedback. Drafts, handoffs superseded by drafts, and previously delivered handoffs are ignored. Feedback Markdown is regenerated from the validated JSON. Delivery is recorded after stdout accepts the result; this does not prove the model has read it or completed revisions. If a host loses the tool result, the agent can read the saved files explicitly. A new Finish timestamp is a new submission. Files are for a single local agent; this is not a distributed exactly-once queue.

The UI polls listener presence and receipt timestamps. A heartbeat expires after 10 seconds without renewal. A skill must keep its turn active and keep waiting for automatic continuation. The app cannot wake a stopped agent or send unsolicited messages to arbitrary conversations. On reconnect, the listener picks up pending finished feedback without asking the human to export or copy it again.

## Packaging boundary

`SKILL.md` is the canonical workflow for standalone and plugin installations. The plugin skill entry at `skills/planorama/SKILL.md` points to that workflow inside the same package; it does not fetch instructions remotely. `agents/openai.yaml` adds standalone Codex metadata. The manifests declare no MCP servers, credentials, or startup hooks. Setup is an explicit command or runs on first skill use; installing plugin files alone does not execute it. Host approvals still apply to shell execution and dependency installation.

The portable `plugin.json` and both compatibility manifests use the same identity and version. The package builder rejects version mismatches. Distribution includes local catalogs for installation and testing; generating the archive does not submit it to a public directory or publish a GitHub release.

This version uses agent-authored JSON for semantic extraction. The basic importer only classifies explicit headings and does not understand arbitrary prose, infer dependencies, or automatically parse ADR fields. Browser file upload, live source watching, semantic revision reconciliation, graph editing, and waking inactive agent conversations remain future extensions. The local file handoff plus waiting CLI is the portable integration boundary.
