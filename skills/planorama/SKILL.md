---
name: planorama
description: Turn an implementation plan into a local interactive visual review with decisions, reasoning, and object-linked human feedback. Use when a user wants to inspect, challenge, or annotate an agent's plan and return it for revision.
---

# Planorama

Read and follow [the complete Planorama workflow](../../SKILL.md) before starting. It is bundled inside this plugin and is the shared workflow for plugin and standalone installations.

The Planorama root is two directories above this file, where `package.json`, `SKILL.md`, and `scripts/planorama.mjs` live. Use that root for commands and reference paths in the workflow; keep the user's project as the source of the plan.

Invoke the bundled launcher with `node <planorama-root>/scripts/planorama.mjs review ...`. It prepares the local runtime automatically on first use. Do not install dependencies into the plugin directory or the user's project. In Claude Code, this plugin skill is named `/planorama:planorama`; standalone skill installations retain `/planorama`.
