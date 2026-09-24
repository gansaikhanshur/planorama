"use client";
import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Plan, PlanObject, Review, PlanDiagram } from "@/lib/schema";
import { diagramPositions, graphPositions } from "@/lib/graph";
import { Check, MessageCircle } from "lucide-react";

type ObjectNode = Node<
  { object: PlanObject; assessment?: string; comments: number },
  "object"
>;
function SemanticNode({ data, selected }: NodeProps<ObjectNode>) {
  return (
    <div
      className={`map-node ${selected ? "is-selected" : ""} kind-${data.object.kind}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="eyebrow">
        <span className="type-dot" />
        {data.object.kind}
        {["accepted", "confirmed", "acknowledged", "considered"].includes(
          data.assessment ?? "",
        ) && <Check size={13} />}
      </div>
      <strong title={data.object.title}>{data.object.title}</strong>
      <div className="map-node-foot">
        <span>Open details</span>
        {data.comments > 0 && (
          <span>
            <MessageCircle size={12} />
            {data.comments}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { object: SemanticNode };
const fitOptions = { padding: 0.16, minZoom: 0.8, maxZoom: 1 };
export default function PlanMap({
  plan,
  diagram,
  review,
  selected,
  onSelect,
}: {
  plan: Plan;
  diagram?: PlanDiagram;
  review: Review;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance<ObjectNode> | null>(null);
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          void flow.current?.fitView(fitOptions);
        });
      }
    });
    if (canvas.current) observer.observe(canvas.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  const positions = useMemo(
    () => (diagram ? diagramPositions(diagram) : graphPositions(plan)),
    [plan, diagram],
  );
  const ys = [...positions.values()].map((position) => position.y);
  const contentHeight = ys.length
    ? Math.max(...ys) - Math.min(...ys) + 160
    : 160;
  const objects = diagram
    ? plan.objects.filter((object) => positions.has(object.id))
    : plan.objects.filter((object) =>
        plan.edges.some(
          (edge) => edge.from === object.id || edge.to === object.id,
        ),
      );
  const nodes: ObjectNode[] = objects.map((object) => ({
    id: object.id,
    type: "object",
    width: 265,
    height: 160,
    position: positions.get(object.id)!,
    selected: selected === object.id,
    ariaLabel: `${object.kind}: ${object.title}`,
    data: {
      object,
      assessment: review.assessments[object.id],
      comments: review.comments.filter(
        (c) => c.objectId === object.id && !c.resolved,
      ).length,
    },
  }));
  const edges: Edge[] = diagram
    ? diagram.connections.map((connection) => ({
        id: connection.id,
        source: connection.from,
        target: connection.to,
        label: connection.label,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#879e8d" },
        style: { stroke: "#879e8d", strokeWidth: 1.5 },
        labelStyle: { fontSize: 13, fill: "#52655b" },
        labelBgStyle: { fill: "#faf9f6" },
      }))
    : plan.edges.map((edge) => ({
        id: edge.id,
        source: edge.relation === "depends_on" ? edge.to : edge.from,
        target: edge.relation === "depends_on" ? edge.from : edge.to,
        label: edge.relation === "depends_on" ? "required by" : edge.relation,
        type: "smoothstep",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.relation === "challenges" ? "#a56f4f" : "#879e8d",
        },
        style: {
          stroke: edge.relation === "challenges" ? "#a56f4f" : "#879e8d",
          strokeWidth: 1.5,
          strokeDasharray: edge.relation === "depends_on" ? undefined : "5 5",
        },
        labelStyle: { fontSize: 13, fill: "#52655b" },
        labelBgStyle: { fill: "#faf9f6" },
      }));
  return (
    <div
      ref={canvas}
      className="map-canvas"
      aria-label={
        diagram
          ? `Interactive ${diagram.kind} diagram`
          : "Interactive plan dependency map"
      }
      style={{
        width: "100%",
        height: `clamp(340px, ${contentHeight + 120}px, min(65vh, 580px))`,
      }}
    >
      <ReactFlow
        onInit={(instance) => {
          flow.current = instance;
        }}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        fitView
        minZoom={0.5}
        maxZoom={1.5}
        fitViewOptions={fitOptions}
        ariaLabelConfig={{
          "controls.fitView.ariaLabel": "Reset readable view",
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#dfe4de"
        />
        <Controls
          showInteractive={false}
          orientation="horizontal"
          fitViewOptions={fitOptions}
        />
        {nodes.length > 6 && (
          <MiniMap
            pannable
            zoomable
            ariaLabel="Diagram overview: drag to navigate"
            nodeColor="#cad9ce"
            maskColor="rgba(14, 59, 46, 0.12)"
            style={{ width: 150, height: 100 }}
          />
        )}
      </ReactFlow>
      {!edges.length && (
        <div className="map-empty-note">
          No relationships declared. Your agent can add evidence-backed
          dependencies to the semantic plan.
        </div>
      )}
    </div>
  );
}
