import type { Plan, PlanDiagram } from "./schema";
export function affectedObjects(plan: Plan, objectId: string): Set<string> {
  const found = new Set<string>(),
    queue = [objectId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of plan.edges) {
      const next =
        edge.relation === "depends_on" && edge.to === current
          ? edge.from
          : edge.relation === "affects" && edge.from === current
            ? edge.to
            : null;
      if (next && next !== objectId && !found.has(next)) {
        found.add(next);
        queue.push(next);
      }
    }
  }
  return found;
}
export function graphPositions(
  plan: Plan,
): Map<string, { x: number; y: number }> {
  const visible = new Set(plan.edges.flatMap((edge) => [edge.from, edge.to]));
  const objects = plan.objects.filter((object) => visible.has(object.id));
  const ranks = new Map<string, number>();
  function rank(id: string): number {
    if (ranks.has(id)) return ranks.get(id)!;
    const parents = plan.edges.filter(
      (e) => e.relation === "depends_on" && e.from === id,
    );
    const result = parents.length
      ? Math.max(...parents.map((e) => rank(e.to))) + 1
      : 0;
    ranks.set(id, result);
    return result;
  }
  const counts = new Map<number, number>();
  for (const object of objects) {
    const column = rank(object.id);
    counts.set(column, (counts.get(column) ?? 0) + 1);
  }
  const rows = new Map<number, number>();
  return new Map(
    objects.map((object) => {
      const column = rank(object.id),
        row = rows.get(column) ?? 0;
      rows.set(column, row + 1);
      return [
        object.id,
        {
          x: column * 420,
          y: (row - ((counts.get(column) ?? 1) - 1) / 2) * 200,
        },
      ];
    }),
  );
}

// Preserve authored row/column ordering while removing excessive gaps and overlaps.
export function diagramPositions(
  diagram: PlanDiagram,
): Map<string, { x: number; y: number }> {
  const xs = [...new Set(diagram.nodes.map((node) => node.position.x))].sort(
    (a, b) => a - b,
  );
  const ys = [...new Set(diagram.nodes.map((node) => node.position.y))].sort(
    (a, b) => a - b,
  );
  const occupied = new Set<string>();
  return new Map(
    diagram.nodes.map((node) => {
      const x = xs.indexOf(node.position.x) * 420;
      let y = ys.indexOf(node.position.y) * 200;
      while (occupied.has(`${x}:${y}`)) y += 200;
      occupied.add(`${x}:${y}`);
      return [node.objectId, { x, y }];
    }),
  );
}

// Edges are review context, not a reason to add a separate page.
export function needsRelationshipMap(plan: Plan): boolean {
  return Boolean(plan.relationshipMap && plan.edges.length);
}
