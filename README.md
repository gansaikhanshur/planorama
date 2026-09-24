<div align="center">
  <img src="public/planorama.png" alt="Planorama logo" width="112" height="112">
  <h1>Planorama</h1>
  <p><strong>Understand the plan. Challenge the decisions. Build with confidence.</strong></p>
  <p>Interactive plan review for Codex and Claude Code.</p>
  <p>
    <a href="#get-started">Get started</a> ·
    <a href="#how-it-works">How it works</a> ·
    <a href="#try-the-demo">Try the demo</a> ·
    <a href="#documentation">Documentation</a>
  </p>
</div>

---

AI coding agents can write a detailed implementation plan in seconds. Understanding its decisions, assumptions, and tradeoffs takes longer.

**Planorama turns that plan into a focused visual review.** Inspect the reasoning behind a decision, question an assumption, or request a change where it matters. When you finish, your feedback returns to the waiting agent so it can revise the plan and bring it back for another look.

Your existing agent interprets the plan. Planorama provides the review interface and local feedback handoff. No additional API key, account, or hosted service is required.

## What you can review

| Review area                    | What it helps you understand                                          |
| ------------------------------ | --------------------------------------------------------------------- |
| Overview                       | What is being proposed and where your input matters.                  |
| Key decisions                  | The proposed approach, its rationale, alternatives, and consequences. |
| Assumptions and risks          | What needs to be true, what could go wrong, and what needs attention. |
| Implementation and files       | How the work is organized and which files are expected to change.     |
| Architecture and relationships | Interactions or dependencies that benefit from a diagram.             |

Sections follow the content of the plan. Details open on demand, and diagrams appear only when explicitly included to explain a useful relationship. A small CLI plan can stay small.

## Get started

**Requirements:** Node.js **22.13+**, npm, Git, and Codex or Claude Code. The commands below use a macOS or Linux shell.

### 1. Install the local runtime

```sh
git clone https://github.com/gansaikhanshur/planorama.git
cd planorama
npm ci
npm run build
```

The build prepares a cached runtime for subsequent reviews. Keep this checkout in a permanent location; the skill registration below points to it.

### 2. Register the skill

Run the block for your agent from the Planorama repository root. You can register both.

**Codex**

```sh
mkdir -p "$HOME/.agents/skills"
ln -s "$PWD" "$HOME/.agents/skills/planorama"
```

**Claude Code**

```sh
mkdir -p "$HOME/.claude/skills"
ln -s "$PWD" "$HOME/.claude/skills/planorama"
```

If a destination already exists, inspect it before replacing it. Start a new agent session after registration.

### 3. Review a plan

Open your project in your agent, create or discuss an implementation plan, then invoke:

| Agent       | Command      |
| ----------- | ------------ |
| Codex       | `$planorama` |
| Claude Code | `/planorama` |

The skill selects the current plan, prepares the review, and opens it in your browser. If the intended plan is unclear, it asks you to choose. You can also include an explicit plan path.

Keep the agent session active while reviewing so it can receive your feedback.

## How it works

1. **The agent structures the plan.** It reads the Markdown and identifies meaningful decisions, assumptions, risks, and steps. Each review item links back to the source plan.
2. **You inspect and respond.** Accept a decision, confirm an assumption, or add a question or change request directly to an item. Review the parts that matter to you; there is no requirement to assess every item.
3. **You finish the review.** Choose **Approve entire plan** or **Request revision**. Existing questions and change requests are included automatically. An overall note is optional when you have already provided feedback.
4. **The agent continues the conversation.** A revision request returns your feedback to the waiting agent. It updates the plan, opens a new review, and waits again. Approval records your decision; it does not automatically authorize implementation.

Feedback stays attached to the decision or issue it concerns. You do not need to download a file or copy comments back into chat.

### A review shaped by the plan

The agent creates a validated semantic model alongside the Markdown. That model separates decisions from supporting reasoning, assumptions, objections, and implementation details. It preserves uncertainty instead of inventing missing rationale.

A diagram does not need to be embedded in the original Markdown. The agent can describe an architecture or workflow from relationships supported by the plan. Diagrams are optional; ordinary step ordering and obvious dependencies do not need a separate graph.

For the model format and examples, see the [semantic model reference](references/semantic-model.md).

## Try the demo

After installation, run this from the Planorama checkout:

```sh
npm run planorama
```

This opens the bundled example in your default browser at **http://127.0.0.1:4317**. No agent is needed to explore the interface. Automatic feedback delivery requires an active agent listener.

The launcher returns once the page is ready and leaves the local server running. It prints the review URL, saved-session location, and a command to stop the server. Add `--no-open` to print the URL without opening a browser, or `--port 4320` if the default port is occupied.

## Saved reviews and feedback

**Save draft** saves your assessments and notes without sending them. **Finish review** submits your approval or revision request.

Reviews are stored in a `.planorama/` directory beside the source plan. **Review details** in the app shows the exact folder and the command to resume a saved session. Closing the browser does not delete saved feedback.

If the agent disconnects, submitted feedback remains saved for pickup when it resumes the listener. Planorama cannot wake an inactive agent conversation. The interface shows the listener connection and delivery status.

The review server binds to `127.0.0.1`, and review files stay on your machine. Plan interpretation uses your existing coding agent and its configured model provider.

<details>
<summary><strong>Manual launch and resume</strong></summary>

Run these commands from the Planorama checkout:

```sh
# Open a plan with a semantic model prepared by your agent.
npm run planorama -- /absolute/path/plan.md --model /absolute/path/planorama.json

# Resume a saved review.
npm run planorama -- --session /absolute/path/session.json
```

The [skill instructions](SKILL.md) describe how the agent prepares the model and waits for feedback. Launching a Markdown file without `--model` uses a basic section importer, which does not infer architecture or understand arbitrary prose.

See the [local runtime reference](references/local-runtime.md) for listener commands, session files, and all launcher options.

</details>

## Updating

From your Planorama checkout:

```sh
git pull --ff-only
npm ci
npm run build
```

Your skill registrations continue to point to the same checkout. New reviews use the updated build; existing servers retain the build they started with.

## Development

Built with Next.js, React, TypeScript, Tailwind CSS, React Flow, and Zod.

```sh
npm ci
npm run dev
```

The development preview is available at **http://127.0.0.1:3000**.

<details>
<summary><strong>Validation commands</strong></summary>

```sh
npm test
npm run typecheck
npm run format:check
npm run build
npx playwright install chromium
npm run test:browser
node --import tsx --test tests/startup.integration.ts
```

Browser tests cover review actions, saved feedback, submission, and responsive layouts. The startup integration check requires a current production build.

</details>

## Documentation

- [Skill workflow](SKILL.md) — plan selection, extraction, review, and revision.
- [Semantic model](references/semantic-model.md) — schema, source references, and optional diagrams.
- [Local runtime](references/local-runtime.md) — commands, saved sessions, and feedback delivery.
- [Example plan](examples/plan.md) and [semantic model](examples/plan.json) — a complete input pair.

Found a bug or have a suggestion? [Open an issue](https://github.com/gansaikhanshur/planorama/issues). For review or diagram problems, include a minimal plan example with sensitive details removed, the agent you used, and the expected behavior.
