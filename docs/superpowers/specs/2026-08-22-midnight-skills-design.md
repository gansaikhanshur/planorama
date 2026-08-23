# midnight-skills — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation planning

## Purpose

A collection of agent skills themed on trust and verification: skills that
answer "was the thing done right?" rather than "do the thing."

**Multi-agent, not Claude-specific.** v1 targets Claude Code and Codex. Both
are installed and authenticated on the development machine, both expose a
`skills/` directory convention, and both offer a non-interactive mode. Further
agents may be added later; nothing in the design assumes only two.

## Scope

Two skills: `/rubberduck` and `/devils-advocate`. Plus repo scaffolding.

These two happen to share a mechanism (below). That is a fact about these two
skills, not a law governing the repository. Skills added later are free to work
however they need to.

---

## The shared mechanism: starved context via headless dispatch

Both v1 skills depend on review happening in a context that has never seen the
conversation. This matters because:

- An agent reviewing its own work carries every blind spot that produced the
  mistakes, and reliably reports that things went well.
- Given the author's reasoning, a reviewer explains the *intent* fluently and
  glides past the bug. Denied it, the reviewer must work from what is actually
  there — which is what a human reading the code cold has to do.

### How it is achieved

The host skill gathers inputs, then shells out to a **headless run of the host
agent**:

```
claude -p "$(cat <prompt-file>)" < package.md     # on Claude Code
codex exec  "$(cat <prompt-file>)" < package.md   # on Codex
```

A fresh process starts, sees only what it is handed, prints to stdout, and
exits. The host skill captures that output and presents it verbatim.

**This is not a portability compromise — it is the better implementation on
both platforms.** A headless run is strictly more starved than an in-session
subagent, which inherits session framing, working context, and parent setup. A
fresh process inherits nothing but the filesystem and stdin. Since starvation
is the whole mechanism, the portable route is also the more correct one.

### What the wall encloses

The wall is around **the conversation**, not the codebase. The child process
can and should read the repository — to say "the caller does not check this
return value," it has to go look at the caller. It is blind to the story, free
to inspect the evidence.

### Costs, accepted

- A second billed run per invocation.
- Slower, and output arrives as one block rather than streaming.
- Requires the host CLI on PATH and authenticated.
- Headless runs have their own permission defaults; the child needs explicit
  read-only tool permissions. Implementation detail, not a design risk.

---

## Skill: `/rubberduck`

**Runs:** after a work session, on demand.

**Answers:** what did the agent actually do?

### The concept, faithfully

Rubber duck debugging works because narrating code as it exists forces you to
confront what it actually does. The bug surfaces at the moment the narration
stops matching the code, or you hear yourself say something and it sounds
wrong. Nobody ducks by explaining what they meant to build — intent is exactly
what ducking removes.

**You are the duck.** The agent explains its work to you, and the explaining is
what surfaces the problems.

This is the whole skill. It is not a code review with a walkthrough attached.
Findings are the residue of an honest explanation, not a separate pass.

### Inputs

1. **The diff** — file changes since session start.
2. **A bare action log** — commands executed, packages installed, files
   deleted, migrations applied, tests that failed and were never re-run. All
   commentary stripped.

That is all. No plan file, no user turns, no reasoning trace, no statement of
intent.

The action log is included because a diff is silent on everything that did not
hit tracked files: a dropped table, an installed dependency, a deleted
untracked file, a suite that was never re-run after the last edit.

An earlier draft of this design added a third section comparing the work
against what was asked, which required reconstructing the ask from a plan file
or the user's turns. That was scope-checking wearing the duck's costume — a
different activity, and the source of every hard problem in the design.
Removing it deleted all of them.

### Output

One continuous walkthrough, in plain language, describing what the code does.
Problems surface inline, as interruptions, where the narration breaks down. No
sections, no findings appendix, no severity table.

Shape:

```
upload.ts now pulls a Redis client at module load. If Redis is down at
boot the import throws — and nothing catches it.

The handler checks the rate limit, and on limit returns 429. It reads the
counter, adds one, writes it back — three separate calls, so two requests
can interleave and both pass.

legacy-limiter.ts was deleted. Two files still import it.
```

### Stated limitation

Without intent, the skill **cannot tell you that you built the wrong thing.**
It can only tell you what you built and where that looks broken on its own
terms. This limitation belongs in the skill's own text, not hidden.

Intent-independent defects are the more reliable class anyway: they do not
depend on anyone having correctly understood anything.

### Open implementation question

**Diff baseline.** Requires a session-start marker to diff against — likely a
session-start hook recording HEAD, with working-tree diff plus session commits
as fallback. Both agents support hooks (`~/.codex/hooks.json` exists on this
machine). Design is not blocked on this.

---

## Skill: `/devils-advocate`

**Runs:** on a finalized plan, before execution. Works against a superpowers
plan, a plain `plan.md`, or any agent-produced plan file.

**Answers:** is this plan actually right?

**Input:** the plan file. Nothing else — not the conversation that produced it,
which is where the plan got talked into sounding reasonable. A plan that does
not state what it is for has a problem; that is a finding, not a missing input
to go fetch.

As with `/rubberduck`, the reviewer may read the repository freely — checking
whether a plan's assumptions actually hold requires it.

### The failure mode being designed against

Prompt an agent to "find flaws" and its implicit success criterion becomes
"produce flaws." Returning nothing looks like failing the task, so it
manufactures, and the result is a twenty-minute litigation over objections
invented to satisfy the prompt.

Two distinct causes:

**An empty result feels like failure.** Addressed by the null exit. Agents
pattern-match hard on which output shapes look legitimate; if every example in
the skill is a list of objections, an empty list reads as malformed.

**No filter means everything coexists.** One real issue and seven nitpicks
arrive undifferentiated, and the reader ends up doing the triage. Addressed by
the bar and the per-item gate.

### Rules

- **The bar:** would acting on this change the plan? Technically-true-but-
  changes-nothing is the largest category of red-team noise and is not
  reported.
- **Uncapped, at every tier.** A plan with eight genuine problems gets eight
  objections. An earlier draft capped output at three; that conflated noise
  suppression with volume limiting, and only noise is the problem. Hiding five
  real issues is worse than the litigation risk.
- **Per-item gate.** Every objection must state a concrete consequence *and*
  the concrete change it implies. Unable to fill both slots, it is not an
  objection and is not written down. A nitpick structurally cannot fill them.
  With no cap anywhere, this gate is the entire filter, so the skill text must
  enforce it hard — especially on minor items, where padding creeps back in.
- **Severity labels.** Triage belongs to the reviewer, not the reader. Labels
  are what turn a twenty-minute argument into a two-minute read.
- **Both directions in scope.** Gaps and oversights, *and* over-engineering,
  speculative abstraction, dead abstractions with a single implementation, and
  assumptions the plan invented rather than inherited. Most red-team prompts
  hunt only for missing things; hunting for excess is the differentiator.
- **Null exit.** `No material objection. The plan is sound.` A real, blessed,
  formatted ending — not an absence.
- **Five or more blocking flips the frame.** That many real problems is not
  eight findings, it is one: the plan needs rework rather than repair. Output
  becomes the root cause, not a patch list.

### Known weakness

The per-item gate forces justification, not quality. A compliant agent can
still produce mediocre-but-well-formed objections. The null exit permits
genuine emptiness but does not guarantee it. Severity labels are the backstop
that lets a reader dismiss quickly.

---

## How the two relate

`/devils-advocate` attacks a plan before implementation. `/rubberduck` narrates
the work afterward. Same lifecycle, opposite ends — but deliberately
decoupled: `/rubberduck` never reads the plan, so neither skill depends on the
other existing or having been run.

---

## Repository structure

```
midnight-skills/
├─ skills/
│  ├─ rubberduck/
│  │  ├─ SKILL.md            host-side: gather, dispatch, print
│  │  └─ duck-prompt.md      child-side: narration instructions
│  └─ devils-advocate/
│     ├─ SKILL.md            host-side: locate plan, dispatch, print
│     └─ advocate-prompt.md  child-side: objection rules
├─ .claude-plugin/           Claude-only convenience wrapper
│  ├─ plugin.json
│  └─ marketplace.json
├─ docs/superpowers/specs/
└─ README.md
```

### The two-file split per skill

`SKILL.md` runs in **your** session and does the gathering and dispatching.
The prompt file runs in the **child's** context and contains the review
instructions. Different audiences, different files.

This makes the starved-context boundary a *file* boundary — auditable at a
glance. Anything in the prompt file reaches the reviewer; anything in SKILL.md
does not.

### Installation

Same `skills/<name>/SKILL.md` layout serves both agents:

- Claude Code — `/plugin marketplace add <user>/midnight-skills`,
  or `cp -r skills/* ~/.claude/skills/`
- Codex — `cp -r skills/* ~/.codex/skills/`

**To verify during implementation:** that Codex's skill format matches Claude's
`SKILL.md` frontmatter convention. `~/.codex/skills/` exists with a system
marker but contains no user skills to inspect, so compatibility is inferred
from the shared convention, not confirmed. If the formats diverge, the prompt
files stay shared and only the thin SKILL.md wrappers fork.

Also unresolved: the GitHub account name for the marketplace install string.

## Success criteria

- Both skills run on Claude Code and Codex from the same repository.
- `/rubberduck` describes what the code does without once describing what it
  was meant to do.
- `/rubberduck` surfaces at least one problem that would otherwise have shipped.
- `/devils-advocate` returns its null exit on genuinely sound plans rather than
  manufacturing objections.
- Neither skill's output requires a follow-up argument to act on.
