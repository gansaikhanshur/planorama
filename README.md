# Planorama

Turn a coding agent's implementation plan into a visual review: a short overview, focused review sections, plan-specific architecture or workflow views, dependencies, and human feedback attached to semantic objects.

In an agent conversation, invoke **`$planorama` in Codex** or **`/planorama` in Claude Code**. No additional prompt or file path is required when the current plan is clear. The skill uses the plan being discussed, or finds the plan in your project, opens the review, and waits for your feedback. It asks only when the plan is missing or ambiguous. An explicit plan path or request to resume a saved review also works.

For local development, register this checkout once in both agents' personal skill directories. Run from the Planorama repository root:

```sh
mkdir -p ~/.agents/skills ~/.claude/skills
ln -s "$PWD" ~/.agents/skills/planorama
ln -s "$PWD" ~/.claude/skills/planorama
```

These links use the current checkout, so edits to the skill remain available without copying it. If a destination already exists, inspect it rather than replacing it blindly. Start a new agent session if the command does not appear.

To preview the bundled example directly, without an agent:

```sh
npm ci
npm run build
npm run planorama -- --no-open
```

The launcher exits when the review is ready and keeps the server running in the background. It prints the URL, log path, and stop command.

Build once after installation or app updates; subsequent plans reuse the cached runtime without compiling again. Use `--dev` for UI development.

Open **http://127.0.0.1:4317** for the bundled example. Omit `--no-open` to open your default browser automatically. Requires Node.js 22.13+.

To review your own plan:

```sh
npm run planorama -- /absolute/path/plan.md --model /absolute/path/planorama.json
```

Have your coding agent follow [the Planorama skill](SKILL.md) to extract `planorama.json`. Omitting `--model` provides a basic section import, visibly labeled as such. The semantic model is what makes a full review possible: decisions, context, rationale, alternatives, consequences, assumptions, and declared relationships.

In the browser, select an object to inspect it, assess it, or add questions and objections. Save drafts locally; **Finish review** offers **Approve entire plan** or **Request revision**, returning your decision and notes to the waiting agent. **Save draft** saves without sending. Downloads are optional. Review as much or as little as you need; untouched items remain unreviewed. After a revision request, the agent updates the Markdown and semantic model, opens the revised review, and waits again. The skill keeps a local listener running while you review. If the agent disconnects, finished feedback stays saved for pickup when it resumes. **Review details** shows where drafts are saved and the command to resume after closing the server. No API key, database, or cloud service is required.

```sh
npm test
npm run typecheck
npm run build
```

See [the semantic model](references/semantic-model.md) and [the local runtime contract](references/local-runtime.md). The repository is a self-contained Planorama app and skill, designed for later Codex and Claude Code packaging; no agent configuration is installed automatically.
