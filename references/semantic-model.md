# Semantic plan contract

`lib/schema.ts` is the executable Zod contract. Use `npm run validate -- <model.json> <plan.md>` from the skill directory to validate a model and its source ranges.

A plan has `schemaVersion: 1`, a stable `id`, a string `revision`, `title`, a concise `summary`, `extraction: "agent"`, an `objects` array, and an `edges` array. Use ASCII letters, digits, dots, underscores, or hyphens for IDs (maximum 100 characters, starting with a letter or digit). Do not use coordinates or array indexes as semantic IDs. The schema permits at most 300 objects and 1,000 edges; split larger plans into coherent sessions.

## Objects

Every object needs `id`, `kind`, `title`, and `summary`. The available kinds are:

| Kind         | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `decision`   | A choice of approach, with context and reasoning                   |
| `step`       | An implementable unit of work                                      |
| `assumption` | A premise that has not yet been established                        |
| `risk`       | A possible failure and its proposed mitigation, if known           |
| `claim`      | An assertion supporting a choice or argument                       |
| `objection`  | A challenge already present in the source plan                     |
| `file`       | A proposed file change substantial enough to review independently  |
| `component`  | A system component, service, or store in the proposed architecture |

Additional fields:

- `importance`: `critical`, `normal` (default), or `supporting`. Mark decisions with broad architectural impact as critical. Decisions appear before implementation detail; critical decisions sort first.
- `context`: the situation or constraint motivating the object.
- `rationale`: why this choice or assertion is justified.
- `alternatives`: objects containing `title` and `tradeoff`.
- `consequences`: strings describing costs, benefits, or resulting obligations.
- `files`: proposed file paths, relative to the user's repository. These are displayed as data, never executed or opened by the server.
- `source`: `{ "startLine": 5, "endLine": 12 }`, using inclusive, 1-based Markdown line numbers.

The detail strings and arrays may be omitted; defaults are empty. The UI exposes missing decision rationale. Do not invent it just to fill the interface. Keep summaries short enough to scan; put reasoning in the detail fields. Titles are limited to 240 characters.

## Edges and direction

Each edge needs a unique `id`, `from`, `to`, and `relation`. Optional `rationale` explains why the connection exists. Both endpoints must reference existing objects.

| Relation     | Meaning of `from → to`             |
| ------------ | ---------------------------------- |
| `depends_on` | `from` requires `to` first         |
| `supports`   | `from` provides reasoning for `to` |
| `challenges` | `from` raises an objection to `to` |
| `affects`    | Changing `from` may affect `to`    |

Dependency cycles are rejected. Other argument relationships can form cycles. The visual map reverses dependency arrows to read prerequisite → dependent, with the label “required by.” Other edges retain their declared direction. Downstream impact follows reverse dependency edges and forward `affects` edges transitively; it does not treat every supporting claim as an implementation dependency.

Declare relationships only where the plan provides evidence. Ordering two headings does not establish a dependency. If you infer a relationship that is needed for review, make that uncertainty explicit in its rationale and an assumption object.

## Overview and optional diagrams

`summary` describes the intended outcome and scope. Optional `reviewFocus` is an array of up to six short questions (500 characters each) that help a human know what to examine. These questions frame the review; they do not become new plan claims. Without them, the overview uses general review prompts appropriate to the object kinds that are present. Detailed objects live in their sidebar sections, not on the overview.

The sidebar adapts to the model: no decision objects means no Key decisions section; a single relationship or linear dependency chain stays in the implementation list and object inspectors without adding a diagram entry. Edges alone never add a map. Only an explicit `relationshipMap: {title, description}` adds the dependency/reasoning view; use it for a requested map or a concrete non-obvious review question, not generic implementation relationships. A simple plan can be just an overview and implementation steps.

Optional `diagrams` contains up to 12 explicit architecture or workflow views. Each diagram has:

- `id`: a unique diagram ID.
- `kind`: `architecture` for components and interactions, or `workflow` for a process or user journey.
- `title` and `description`: explain what this specific view represents.
- `nodes`: `{ "objectId": "component-api", "position": { "x": 0, "y": 0 } }`. Positions are finite numbers between −10,000 and 10,000; positions express the intended row and column ordering. The UI normalizes spacing to keep cards readable and prevent overlaps. Every object must exist in the plan and occur once in the diagram.
- `connections`: `{ "id": "api-store", "from": "component-api", "to": "component-store", "label": "writes invitation" }`. Endpoints must be present in this diagram. Labels describe actual source-supported interactions. Unlike dependencies, architecture interactions and workflow loops can be cyclic.

Diagrams are views of semantic objects: clicking a component or step opens its normal inspector and comments attach to its object ID. Positions only control presentation. Connections are labels on interactions, not separate review targets; challenge one by commenting on the participating object.

Dependency views are explicitly enabled by `relationshipMap` and derive their connections from `edges`, and include only objects participating in those edges. Simple dependencies remain visible in implementation prerequisites and connected reasoning. A component calling another component does not imply implementation ordering or downstream change impact. Use `depends_on` or `affects` explicitly when that meaning is intended. If the plan has both architecture and dependencies, the Diagrams section offers a view selector; if it has a single view, the sidebar names its type directly. With only argument links, the derived view is named Reasoning map.

A diagram is optional. Use one when it explains meaningful branching, component interactions, or boundaries more clearly than a list. A simple calculator CLI with sequential steps generally does not need one. Choose the appropriate view from the plan's content; do not relabel a dependency graph as architecture or invent missing components. More specialized visuals such as sequence diagrams, timelines, and arbitrary embedded diagrams are not supported in this version.

## Minimal example

```json
{
  "schemaVersion": 1,
  "id": "cache-refresh",
  "revision": "1",
  "title": "Refresh cached account data",
  "summary": "Use a background job to refresh stale data while keeping reads fast.",
  "extraction": "agent",
  "objects": [
    {
      "id": "decision-background-refresh",
      "kind": "decision",
      "importance": "critical",
      "title": "Refresh data in the background",
      "summary": "Serve the cached value and queue a refresh when it becomes stale.",
      "rationale": "The plan prioritizes read latency over immediate freshness."
    },
    {
      "id": "step-refresh-worker",
      "kind": "step",
      "title": "Implement the refresh worker",
      "summary": "Load fresh data and replace the cached value.",
      "files": ["src/jobs/refresh-account.ts"]
    }
  ],
  "edges": [
    {
      "id": "worker-requires-decision",
      "from": "step-refresh-worker",
      "to": "decision-background-refresh",
      "relation": "depends_on"
    }
  ]
}
```

For a real source plan, add accurate line references; they are omitted here because this example is not tied to a Markdown file.
