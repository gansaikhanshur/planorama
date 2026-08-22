# midnight-skills — Design

**Date:** 2026-08-22
**Status:** Approved, ready for implementation planning

## Purpose

A personal, publicly shareable collection of Claude Code agent skills with a
single theme: **trust and verification**. Every skill answers some form of
"was the thing done right?" rather than "do the thing."

This niche is underserved. Most public skill repositories are collections of
capabilities. `midnight-skills` is a collection of checks.

## The house pattern

Every skill in this repo works the same way: **adversarial review from starved
context.**

A fresh subagent receives the artifact under review and nothing else. No
reasoning trace, no tool-call commentary, no conversation that talked the work
into sounding reasonable. It sees what exists, not the story of how it came to
exist.

This constraint is load-bearing, not stylistic:

- An agent reviewing its own work from its own context shares every blind spot
  that produced the mistakes. It reliably reports that things went well.
- Given the author's reasoning, a reviewer explains the *intent* fluently and
  glides straight past the bug. Denied it, the reviewer must derive intent from
  what is actually there — which is what a human reading the code cold has to
  do.

The pattern is what gives the collection an identity rather than making it a
grab bag, and it is what new skills must conform to in order to belong here.

## Scope: v1

Two skills, plus repo scaffolding. Not four, not six.

A skills repo that opens with six skills is six untested guesses about what
gets reached for in practice. Two skills used daily are real, and the third
earns its way in from a session where its absence was felt. Everything else
goes to `BACKLOG.md` at one line each — free to write, costless to ignore.

---

## Skill: `/rubberduck`

**Runs:** after a work session, on demand.

**Answers:** what did the agent actually do, what is wrong with it, and how
does that compare to what was asked?

### Inputs to the reviewer

The main agent assembles the review package and then gets out of the way. The
reviewer subagent receives:

1. **The diff** — file changes since session start.
2. **A bare action log** — commands executed, packages installed, files
   deleted, migrations applied, tests that failed and were never re-run. All
   commentary and justification stripped. Facts of what happened, none of the
   spin.
3. **The spec of record** — a distillation of what was asked, used for section
   3 only. Derived from the user's turns, never from the agent's own account of
   what it believed was wanted. See below.

The action log matters because a diff is silent on everything that did not hit
tracked files: a dropped table, an installed dependency, a deleted untracked
file, a test suite that was never re-run after the last edit.

The reviewer does **not** receive the agent's reasoning. See the house pattern.
The spec of record does not violate that constraint: it is a record of what the
*user* said, not of how the agent justified its work.

### The mechanism

The reviewer's task is to explain the work Feynman-style — plainly, concisely,
without jargon, to someone who directed the work but did not read the code.

**The explanation is the audit.** These are not two features stapled together.
Feynman's actual claim is that inability to explain something simply reveals
incomplete understanding. A reviewer forced to explain a diff it has no
backstory for will stumble precisely where the code is incoherent,
unjustified, or wrong — "this function catches the exception and returns null,
which the caller then does not check." The stumbles are the findings.

This is why the starved context is essential here specifically, and not merely
an anti-rationalization habit.

### Output

Three sections, in order:

1. **What happened** — ELI5 / Feynman walkthrough of the changes.
2. **What is broken or missed** — bugs, mistakes, incomplete propagation,
   unverified claims.
3. **Alignment note** — "you asked for X, here is what landed." Cherry on top,
   not the main course.

### The spec of record (section 3 only)

Section 3 needs to know what was asked. The naive answer — the session's first
message — is wrong and would make the skill useless: requirements evolve across
a session through planning, pushback, and course correction. Judging a final
diff against an opening message flags every negotiated decision as drift.
Nothing but false positives.

Instead: the main agent derives a **spec of record** from the user's turns only
— never from its own summary of what it believed was wanted, since a
misunderstanding would be encoded faithfully and then validated against. Later
statements override earlier ones. Dropped requirements are marked as dropped.

Because this feeds only section 3, the stakes are low. A fuzzy brief produces
a fuzzy closing section; it cannot poison the explanation or the findings.
Distill, show it, move on.

**Known gap:** in a compacted session, early user turns are gone from context
and would need recovery from the transcript JSONL. Fallback, not day one.

### Open implementation questions

- **Diff baseline.** Requires a session-start marker to diff against — likely a
  `SessionStart` hook recording HEAD, with the working tree diff plus
  session commits as the fallback. Design is not blocked on this.

---

## Skill: `/devils-advocate`

**Runs:** on a finalized plan, before execution. Works on a superpowers plan,
a plain `plan.md`, or any agent-produced plan.

**Answers:** is this plan actually right?

**Inputs:** the plan and the goal it serves. Never the conversation that
produced the plan — that conversation is where the plan got talked into
sounding reasonable.

### The failure mode being designed against

Prompt an agent to "find flaws" and its implicit success criterion becomes
"produce flaws." Returning nothing looks like failing the task, so it
manufactures. The result is a twenty-minute litigation over objections that
were invented to satisfy the prompt.

Two distinct causes, addressed separately:

**Cause 1 — an empty result feels like failure.** Fixed by the null exit
(below). Agents pattern-match hard on which output shapes look legitimate; if
every example in the skill is a list of objections, an empty list reads as
malformed output.

**Cause 2 — no filter means everything coexists.** One real issue and seven
nitpicks arrive undifferentiated, and the *reader* ends up doing the triage.
Fixed by the bar and the per-item gate.

### Rules

- **The bar:** would acting on this change the plan? Technically-true-but-
  changes-nothing is the largest category of red-team noise and does not get
  reported.
- **Uncapped.** No limit at any severity. A plan with eight genuine problems
  gets eight objections. An earlier draft of this design capped output at three;
  that conflated noise suppression with volume limiting, and only noise is the
  problem. Hiding five real issues is worse than the litigation risk.
- **Per-item gate.** Every objection must state a concrete consequence *and*
  the concrete change it implies. Unable to fill both slots, it is not an
  objection and does not get written. A nitpick structurally cannot fill them.
  With no cap, this gate is the entire filter, so the skill text must enforce
  it hard — especially on the minor tier, where padding creeps back in.
- **Severity labels.** Triage belongs to the reviewer, not the reader. Labels
  are what turn a twenty-minute argument into a two-minute read.
- **Both directions in scope.** Gaps and oversights, *and* over-engineering,
  speculative abstraction, dead abstractions with one implementation, and
  assumptions the plan invented rather than inherited. Most red-team prompts
  only hunt for missing things; hunting for excess is a genuine differentiator.
- **Null exit.** `No material objection. The plan is sound.` A real, blessed,
  formatted ending — not an absence.
- **Five or more blocking flips the frame.** That many real problems is not
  eight findings, it is one: the plan needs rework rather than repair. Output
  becomes the root cause, not a patch list. A cap would have hidden this signal
  entirely.

### Known weakness

The per-item gate forces justification, not quality. A compliant agent can
still produce mediocre-but-well-formed objections. The null exit is what
permits genuine emptiness, but compliance is not guaranteed. Severity labels
are the backstop that lets a reader dismiss quickly.

---

## Repository structure

```
midnight-skills/
├─ .claude-plugin/
│  ├─ plugin.json
│  └─ marketplace.json
├─ skills/
│  ├─ rubberduck/SKILL.md
│  └─ devils-advocate/SKILL.md
├─ docs/superpowers/specs/
├─ BACKLOG.md
└─ README.md
```

The `skills/<name>/SKILL.md` layout is identical with or without the plugin
manifests, so adding `.claude-plugin/` is purely additive. Both install paths
work:

- `/plugin marketplace add <user>/midnight-skills`
- `cp -r skills/* ~/.claude/skills/`

Manifest schema to be verified against current Claude Code plugin docs during
implementation.

## BACKLOG.md

Parked ideas, one line each. Built only when a real session makes their absence
felt.

- **`/scope-drift`** — diff what was asked against what changed; catch
  unrequested edits and, more importantly, silently dropped requirements.
- **`/blast-radius`** — given a change, hunt everything that should have
  changed with it: callers, tests, fixtures, docs, config, migrations.
- **`/steelman`** — make the agent honestly defend its position under pushback
  instead of instantly capitulating. Nothing comparable exists publicly.
- **`/receipts`** — retroactively audit session claims ("tests pass", "no other
  callers") and demand executable proof of each. Must differentiate from
  `superpowers:verification-before-completion`, which is a pre-flight checklist
  rather than a transcript audit.
- **`/assumptions`** — surface load-bearing assumptions made silently mid-task,
  each marked verified / assumed / guessed.
- **`/regret`** — extract durable lessons from a session into CLAUDE.md.
  Overlaps `claude-md-management`; weakest of the set.

`/second-opinion` was considered as a peer skill and rejected as one: it is the
starved-context mechanism itself, which belongs inside every skill here rather
than beside them.

## Success criteria

- Both skills are used in real sessions within two weeks of shipping.
- `/devils-advocate` returns its null exit on genuinely sound plans rather than
  manufacturing objections.
- `/rubberduck` surfaces at least one finding that would otherwise have shipped.
- Neither skill's output requires a follow-up argument to act on.
