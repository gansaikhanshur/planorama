# Install the Planorama plugin

Requires Node.js 22.13+, npm, and a local Codex or Claude Code installation. This release targets macOS and Linux. Extract the archive into a permanent directory. Run the following commands from the extracted `planorama-0.1.0` directory.

## Prepare the runtime

```sh
node plugins/planorama/scripts/planorama.mjs setup
```

Setup downloads dependencies from npm and builds the review app once. It prints the writable cache directory used for this runtime. The plugin files stay unchanged. An existing matching runtime is reused, including when both agents use the plugin. Network access is needed for initial setup.

Setup can also happen automatically when the skill first opens a review. Running it now keeps installation work out of that first review. Node.js and npm must already be installed; Planorama does not install them or bypass your agent's execution permissions.

## Claude Code

```sh
claude plugin marketplace add "$PWD"
claude plugin install planorama@planorama
```

Start a new session in your project and invoke **`/planorama:planorama`** after creating or discussing a plan. For a temporary development session, `claude --plugin-dir "$PWD/plugins/planorama"` loads the same plugin without installing a marketplace.

## Codex

```sh
codex plugin marketplace add "$PWD"
codex plugin add planorama@planorama
```

Start a new session in your project and select Planorama or invoke **`$planorama`**. Keep the agent session active while reviewing so it can receive your feedback.

## Standalone skills

For the bare `/planorama` command in Claude Code, register the plugin root as a standalone skill instead of installing the Claude plugin:

```sh
mkdir -p "$HOME/.claude/skills"
ln -s "$PWD/plugins/planorama" "$HOME/.claude/skills/planorama"
```

Codex standalone registration uses `$HOME/.agents/skills/planorama`. Choose one installation method per agent to avoid duplicate skill discovery. Inspect any existing registration before replacing it.

## Updates and removal

Install a new version from its extracted directory using your agent's marketplace and plugin commands. Runtime caches are keyed by package content, platform, architecture, and Node.js major version. New versions get a separate runtime; already-running reviews retain their original files.

Use `claude plugin uninstall planorama@planorama` or `codex plugin remove planorama@planorama` to uninstall the plugin. The local marketplace can then be removed with the agent's `plugin marketplace remove planorama` command. Uninstalling does not delete review feedback or runtime caches.

By default, runtime caches live under `~/Library/Caches/planorama/runtimes` on macOS and `${XDG_CACHE_HOME:-~/.cache}/planorama/runtimes` on Linux. Set `PLANORAMA_RUNTIME_HOME` to an absolute directory to override this. To reclaim cached runtimes, first stop their review servers using the launcher's printed stop command. Saved reviews remain in `.planorama/` beside their source plans.

If setup fails, fix the reported cause and rerun setup. An interrupted setup may leave a lock; only remove the reported stale lock after confirming its recorded process has stopped. No cached runtime is marked ready until setup succeeds.
