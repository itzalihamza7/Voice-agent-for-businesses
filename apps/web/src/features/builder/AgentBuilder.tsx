"use client";

import "@xyflow/react/dist/style.css";
import {
  BRANCH_ELSE_HANDLE,
  FLOW_NODE_TYPES,
  validateFlow,
  type AgentConfig,
  type AgentFlow,
  type FlowIssue,
  type FlowNode,
  type FlowNodeType,
  type AgentTools,
  type PromptSettings,
} from "@voice-agent/shared";
import {
  addEdge,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { LogoMark } from "@/features/ui/Logo";
import { EvalsPanel } from "./EvalsPanel";
import { CanvasHighlightContext, FlowNodeCard } from "./FlowNodeCard";
import {
  fromReactFlow,
  toBuilderNode,
  toFlowNode,
  toReactFlow,
  type BuilderNode,
} from "./flow-mapping";
import { createNode, newId } from "./node-catalog";
import { DRAG_MIME_TYPE, NodePalette } from "./NodePalette";
import { NodeSettingsPanel } from "./NodeSettingsPanel";
import { PhoneNumber } from "./PhoneNumber";
import { PromptStudio } from "./PromptStudio";
import { ReleasesPanel } from "./ReleasesPanel";
import { WidgetPanel } from "./WidgetPanel";
import { useToolList } from "./tool-list";
import { ToolsPanel } from "./ToolsPanel";
import { TestChat } from "./TestChat";
import { VersionHistory } from "./VersionHistory";

// The drag-and-drop agent builder: palette on the left, canvas in the middle, settings on
// the right. The canvas state lives in React Flow; "Save version" sends it to the API.

// Every node type is drawn by the same card component. Defined outside the component so
// React Flow gets a stable object (it warns and re-mounts nodes otherwise).
const nodeTypes: NodeTypes = Object.fromEntries(
  FLOW_NODE_TYPES.map((type) => [type, FlowNodeCard]),
);

interface Props {
  agentId: string;
  initial: AgentConfig;
  versions: AgentConfig[];
}

export function AgentBuilder(props: Props) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}

type SaveStatus = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string };

/** What gets saved, as a string, to detect unsaved changes. */
function snapshot(
  name: string,
  flow: AgentFlow,
  prompt: PromptSettings,
  tools: AgentTools,
): string {
  return JSON.stringify({ name, flow, prompt, tools });
}

function Builder({ agentId, initial, versions: initialVersions }: Props) {
  const [versions, setVersions] = useState(initialVersions);
  const [openVersion, setOpenVersion] = useState(initial.version);
  const [name, setName] = useState(initial.name);
  const [providers, setProviders] = useState(initial.providers);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [toolConfig, setToolConfig] = useState(initial.tools);
  const toolList = useToolList(toolConfig);
  // "flow" = the canvas; "prompt" = the prompt studio (shown on top of the canvas).
  const [mode, setMode] = useState<"flow" | "prompt" | "tools" | "evals" | "releases" | "website">(
    "flow",
  );
  const [initialCanvas] = useState(() => toReactFlow(initial.flow));
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(initialCanvas.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshot(initial.name, initial.flow, initial.prompt, initial.tools),
  );
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  // While testing, the right column shows the test chat instead of step settings.
  const [testing, setTesting] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const { screenToFlowPosition, fitView, setCenter, getZoom } = useReactFlow();

  const flow = useMemo(() => fromReactFlow(nodes, edges), [nodes, edges]);
  const issues = useMemo(() => validateFlow(flow), [flow]);
  const highlights = useMemo(
    () => ({
      issueNodeIds: new Set(issues.flatMap((issue) => (issue.nodeId ? [issue.nodeId] : []))),
      activeNodeId: testing ? activeNodeId : null,
    }),
    [issues, testing, activeNodeId],
  );
  const dirty = snapshot(name, flow, prompt, toolConfig) !== savedSnapshot;
  const savedPrompt = versions.find((v) => v.version === openVersion)?.prompt ?? initial.prompt;
  const latestVersion = versions.at(-1)?.version ?? 0;
  // Saving an unchanged old version is allowed: it restores it as the newest version.
  const canSave =
    name.trim() !== "" && (dirty || openVersion !== latestVersion) && status.kind !== "saving";

  const selectedBuilderNode = nodes.find((node) => node.id === selectedId);
  const selectedNode = selectedBuilderNode ? toFlowNode(selectedBuilderNode) : undefined;

  // Fit the whole flow in view once every node has been measured. (React Flow's own
  // `fitView` prop can run before all nodes are measured and then fits only some of them.)
  const nodesInitialized = useNodesInitialized();
  const fittedOnLoad = useRef(false);
  useEffect(() => {
    if (!nodesInitialized || fittedOnLoad.current) return;
    fittedOnLoad.current = true;
    void fitView({ maxZoom: 1 });
  }, [nodesInitialized, fitView]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function selectNode(id: string) {
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
    setSelectedId(id);
    fitView({ nodes: [{ id }], duration: 300, maxZoom: 1 });
  }

  function addNode(type: FlowNodeType, position: { x: number; y: number }) {
    const node = toBuilderNode(createNode(type, position));
    setNodes((current) => [
      ...current.map((n) => ({ ...n, selected: false })),
      { ...node, selected: true },
    ]);
    setSelectedId(node.id);
  }

  // Clicking a palette item adds the step below the selected step (or below the lowest
  // step), so it never covers an existing one, then pans the view to it.
  function addNodeBelow(type: FlowNodeType) {
    const anchor =
      nodes.find((node) => node.id === selectedId) ??
      nodes.reduce<BuilderNode | undefined>(
        (lowest, node) => (!lowest || node.position.y > lowest.position.y ? node : lowest),
        undefined,
      );
    const position = anchor
      ? { x: anchor.position.x, y: anchor.position.y + (anchor.measured?.height ?? 80) + 60 }
      : { x: 0, y: 0 };
    addNode(type, position);
    setCenter(position.x + 112, position.y + 40, { zoom: getZoom(), duration: 300 });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer.getData(DRAG_MIME_TYPE);
    if (!(FLOW_NODE_TYPES as string[]).includes(type)) return;
    addNode(type as FlowNodeType, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  function onConnect(connection: Connection) {
    // Each output has at most one connection: a new one replaces the old one.
    setEdges((current) =>
      addEdge(
        { ...connection, id: newId("e") },
        current.filter(
          (edge) =>
            edge.source !== connection.source ||
            (edge.sourceHandle ?? null) !== (connection.sourceHandle ?? null),
        ),
      ),
    );
  }

  function updateNodeData(id: string, data: FlowNode["data"]) {
    setNodes((current) => current.map((node) => (node.id === id ? { ...node, data } : node)));
    if ("conditions" in data) {
      // A removed Branch path takes its connection with it.
      const outputs = new Set([...data.conditions.map((c) => c.id), BRANCH_ELSE_HANDLE]);
      setEdges((current) =>
        current.filter(
          (edge) => edge.source !== id || (edge.sourceHandle && outputs.has(edge.sourceHandle)),
        ),
      );
    }
  }

  function deleteNode(id: string) {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(null);
  }

  function openOldVersion(version: AgentConfig) {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    const loaded = toReactFlow(version.flow);
    setNodes(loaded.nodes);
    setEdges(loaded.edges);
    setName(version.name);
    setProviders(version.providers);
    setPrompt(version.prompt);
    setToolConfig(version.tools);
    setOpenVersion(version.version);
    setSavedSnapshot(snapshot(version.name, version.flow, version.prompt, version.tools));
    setSelectedId(null);
    setStatus({ kind: "idle" });
    // Wait for React Flow to render the loaded nodes before fitting them in view.
    requestAnimationFrame(() => fitView({ duration: 300 }));
  }

  async function save() {
    setStatus({ kind: "saving" });
    const sent = snapshot(name, flow, prompt, toolConfig);
    const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/versions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ schemaVersion: 1, name, providers, flow, prompt, tools: toolConfig }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "error", message: body?.error ?? `Save failed (HTTP ${response.status})` });
      return;
    }
    const { version } = (await response.json()) as { version: AgentConfig };
    setVersions((current) => [...current, version]);
    setOpenVersion(version.version);
    setSavedSnapshot(sent);
    setStatus({ kind: "saved" });
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link
          href="/agents"
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-600"
        >
          <LogoMark className="h-7 w-7" />
          Agents
        </Link>
        <span className="text-slate-300">/</span>
        <input
          aria-label="Agent name"
          className="rounded border border-gray-300 px-2 py-1 font-semibold"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <span data-testid="save-state" className="text-sm text-gray-500">
          {dirty ? "Unsaved changes" : `v${openVersion}`}
          {!dirty && openVersion !== latestVersion && ` (latest is v${latestVersion})`}
        </span>
        <span
          data-testid="issue-count"
          className={`text-sm ${issues.length ? "text-red-600" : "text-emerald-600"}`}
        >
          {issues.length ? `${issues.length} issue(s)` : "Ready to run ✓"}
        </span>
        <PhoneNumber agentId={agentId} />
        <div className="flex overflow-hidden rounded border border-gray-300 text-sm" role="tablist">
          {(["flow", "prompt", "tools", "evals", "releases", "website"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              onClick={() => {
                setMode(tab);
                setTesting(false);
              }}
              className={`px-3 py-1 ${mode === tab ? "bg-gray-800 text-white" : "hover:bg-gray-100"}`}
            >
              {
                {
                  flow: "Flow",
                  prompt: "Prompt",
                  tools: "Tools",
                  evals: "Evals",
                  releases: "Releases",
                  website: "Website",
                }[tab]
              }
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            hidden={mode !== "flow"}
            onClick={() => setTesting((on) => !on)}
            className={`rounded border px-3 py-1.5 text-sm font-medium ${
              testing
                ? "border-emerald-600 bg-emerald-600 text-white"
                : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            {testing ? "Close test" : "Test"}
          </button>
          {status.kind === "error" && (
            <span className="text-sm text-red-600">{status.message}</span>
          )}
          {status.kind === "saved" && !dirty && (
            <span className="text-sm text-emerald-600">Saved as v{openVersion}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {status.kind === "saving" ? "Saving…" : "Save version"}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {mode === "website" && (
          <div className="absolute inset-0 z-10 flex bg-white">
            <WidgetPanel agentId={agentId} />
          </div>
        )}
        {mode === "releases" && (
          <div className="absolute inset-0 z-10 flex bg-white">
            <ReleasesPanel agentId={agentId} versions={versions.map((v) => v.version)} />
          </div>
        )}
        {mode === "evals" && (
          <div className="absolute inset-0 z-10 flex bg-white">
            <EvalsPanel agentId={agentId} versions={versions.map((v) => v.version)} />
          </div>
        )}
        {mode === "tools" && (
          <div className="absolute inset-0 z-10 flex bg-white">
            <ToolsPanel
              config={toolConfig}
              onChange={setToolConfig}
              available={toolList.tools}
              problems={toolList.problems}
            />
          </div>
        )}
        {mode === "prompt" && (
          // On top of the canvas instead of replacing it, so the canvas keeps its zoom and position.
          <div className="absolute inset-0 z-10 flex bg-white">
            <PromptStudio
              prompt={prompt}
              onChange={setPrompt}
              savedPrompt={savedPrompt}
              savedLabel={`v${openVersion}`}
              flow={flow}
            />
          </div>
        )}
        <aside className="w-60 overflow-y-auto border-r border-gray-200 p-3">
          <NodePalette onAdd={addNodeBelow} />
        </aside>

        <div
          className="flex-1"
          onDrop={onDrop}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
        >
          <CanvasHighlightContext.Provider value={highlights}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={(connection) => connection.source !== connection.target}
              onNodeClick={(_event, node) => setSelectedId(node.id)}
              onPaneClick={() => setSelectedId(null)}
              defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
              deleteKeyCode={["Backspace", "Delete"]}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </CanvasHighlightContext.Provider>
        </div>

        <aside className="w-80 space-y-6 overflow-y-auto border-l border-gray-200 p-4">
          {testing ? (
            <TestChat
              flow={flow}
              prompt={prompt}
              tools={toolConfig}
              onActiveNodeChange={setActiveNodeId}
              agentId={agentId}
              agentVersion={openVersion}
            />
          ) : selectedNode ? (
            <NodeSettingsPanel
              key={selectedNode.id}
              node={selectedNode}
              issues={issues.filter((issue) => issue.nodeId === selectedNode.id)}
              tools={toolList.tools}
              onChange={(data) => updateNodeData(selectedNode.id, data)}
              onDelete={() => deleteNode(selectedNode.id)}
            />
          ) : (
            <>
              <IssueList issues={issues} onSelect={selectNode} />
              <VersionHistory
                versions={versions}
                openVersion={openVersion}
                onOpen={openOldVersion}
              />
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function IssueList({ issues, onSelect }: { issues: FlowIssue[]; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold text-gray-700">Checks</h2>
      {issues.length === 0 ? (
        <p className="text-sm text-emerald-700">Every step is set up and connected.</p>
      ) : (
        <ul className="space-y-1">
          {issues.map((issue, index) => (
            <li key={`${index}-${issue.message}`}>
              <button
                type="button"
                disabled={!issue.nodeId}
                onClick={() => issue.nodeId && onSelect(issue.nodeId)}
                className="w-full rounded bg-red-50 px-2 py-1 text-left text-sm text-red-700 enabled:hover:bg-red-100"
              >
                {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">Drafts with issues can still be saved.</p>
    </div>
  );
}
