import type { ComponentProps } from "react";
import type { Edge, Node } from "@xyflow/react";

import type { PluginAdapterRegistryItem, PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { CredentialItem } from "@/lib/get-credentials";
import type {
  NativeModelProviderCatalogItem,
  WorkspaceModelProviderConfigItem,
  WorkspaceModelProviderRegistryStatus
} from "@/lib/model-provider-registry";
import type { RunSnapshotWithId } from "@/app/actions/run-snapshot";
import type {
  CallbackWaitingAutomationCheck,
  SandboxBackendCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type {
  WorkflowLibrarySourceLane,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { UnsupportedWorkflowNodeSummary } from "@/lib/workflow-node-catalog";
import type { RunDetail } from "@/lib/get-run-detail";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import type { RunTrace } from "@/lib/get-run-trace";
import type { WorkflowRunListItem } from "@/lib/get-workflow-runs";
import type {
  WorkflowDetail,
  WorkflowListItem
} from "@/lib/get-workflows";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";
import type {
  WorkflowCanvasEdgeData,
  WorkflowCanvasNodeData
} from "@/lib/workflow-editor";
import type { WorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";

import type { WorkflowPersistBlocker } from "./persist-blockers";
import type { WorkflowEditorMessageKind, WorkflowEditorMessageTone } from "./shared";

type WorkflowEditorShellState = ReturnType<
  typeof import("./use-workflow-editor-shell-state")["useWorkflowEditorShellState"]
>;
type WorkflowEditorGraphState = ReturnType<
  typeof import("./use-workflow-editor-graph")["useWorkflowEditorGraph"]
>;
type WorkflowEditorValidationState = ReturnType<
  typeof import("./use-workflow-editor-validation")["useWorkflowEditorValidation"]
>;
type WorkflowRunOverlayState = ReturnType<
  typeof import("./use-workflow-run-overlay")["useWorkflowRunOverlay"]
>;
type WorkflowEditorPersistenceState = ReturnType<
  typeof import("./use-workflow-editor-persistence")["useWorkflowEditorPersistence"]
>;

export type WorkflowEditorSidebarTabKey = "1" | "2" | "3";

export type WorkflowEditorSidebarAuthoringSourceContext =
  | "selected"
  | "default_trigger";

export type WorkflowEditorSidebarProps = {
  currentHref?: string;
  workflowId: string;
  workflowName: string;
  workflowVersion?: string;
  workflowStageLabel?: string;
  workflowLibraryHref?: string;
  workflows: WorkflowListItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  editorNodeLibrary: WorkflowNodeCatalogItem[];
  plannedNodeLibrary: WorkflowNodeCatalogItem[];
  unsupportedNodes: UnsupportedWorkflowNodeSummary[];
  message: string | null;
  messageTone: WorkflowEditorMessageTone;
  messageKind?: WorkflowEditorMessageKind;
  savedWorkspaceStarter?: WorkspaceStarterTemplateItem | null;
  persistBlockerSummary: string | null;
  persistBlockers: WorkflowPersistBlocker[];
  persistBlockerRecommendedNextStep?: OperatorRecommendedNextStep | null;
  executionPreflightMessage: string | null;
  toolExecutionValidationIssueCount: number;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  preflightValidationItem?: WorkflowValidationNavigatorItem | null;
  validationNavigatorItems: WorkflowValidationNavigatorItem[];
  runs: WorkflowRunListItem[];
  selectedRunId: string | null;
  run: RunDetail | null;
  runSnapshot: RunSnapshotWithId | null;
  trace: RunTrace | null;
  traceError: string | null;
  selectedNodeId: string | null;
  authoringSourceNodeId?: string | null;
  authoringSourceNodeLabel?: string | null;
  authoringSourceContext?: WorkflowEditorSidebarAuthoringSourceContext | null;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  isLoadingRunOverlay: boolean;
  isRefreshingRuns: boolean;
  onCollapse?: () => void;
  onActiveTabChange?: (tabKey: WorkflowEditorSidebarTabKey) => void;
  onAddNode: (type: string, options?: { sourceNodeId?: string | null }) => void;
  onNavigateValidationIssue: (item: WorkflowValidationNavigatorItem) => void;
  onSelectRunId: (runId: string | null) => void;
  onRefreshRuns: () => void;
};

export type WorkflowEditorInspectorTabKey =
  | "node-config"
  | "node-runtime"
  | "node-assistant"
  | "edge-config"
  | "workflow-overview"
  | "workflow-variables"
  | "workflow-publish";

export type WorkflowEditorInspectorProps = {
  workflowId: string;
  currentHref?: string | null;
  selectedNode: Node<WorkflowCanvasNodeData> | null;
  selectedEdge: Edge<WorkflowCanvasEdgeData> | null;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  edges: Array<Edge<WorkflowCanvasEdgeData>>;
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  credentials: CredentialItem[];
  modelProviderCatalog?: NativeModelProviderCatalogItem[];
  modelProviderConfigs?: WorkspaceModelProviderConfigItem[];
  modelProviderRegistryStatus?: WorkspaceModelProviderRegistryStatus;
  nodeConfigText: string;
  onNodeConfigTextChange: (value: string) => void;
  onApplyNodeConfigJson: () => void;
  onNodeNameChange: (value: string) => void;
  onNodeConfigChange: (nextConfig: Record<string, unknown>) => void;
  onNodeInputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeOutputSchemaChange: (nextSchema: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyUpdate: (nextRuntimePolicy: Record<string, unknown> | undefined) => void;
  onNodeRuntimePolicyChange: (value: string) => void;
  workflowVersion: string;
  availableWorkflowVersions: string[];
  workflowVariables: Array<Record<string, unknown>>;
  workflowPublish: Array<Record<string, unknown>>;
  onWorkflowVariablesChange: (
    nextVariables: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  onWorkflowPublishChange: (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
  onDeleteSelectedNode: () => void;
  onUpdateSelectedEdge: (
    patch: Partial<WorkflowCanvasEdgeData> & { label?: string | undefined }
  ) => void;
  onDeleteSelectedEdge: () => void;
  highlightedNodeSection?: "config" | "contract" | "runtime" | null;
  highlightedNodeFieldPath?: string | null;
  highlightedPublishEndpointIndex?: number | null;
  highlightedPublishEndpointFieldPath?: string | null;
  highlightedVariableIndex?: number | null;
  highlightedVariableFieldPath?: string | null;
  focusedValidationItem?: WorkflowValidationNavigatorItem | null;
  persistBlockedMessage?: string | null;
  persistBlockerSummary?: string | null;
  persistBlockers: WorkflowPersistBlocker[];
  persistBlockerRecommendedNextStep?: OperatorRecommendedNextStep | null;
  assistantRequestSerial?: number;
  sandboxReadiness?: SandboxReadinessCheck | null;
  onRuntimeRunSuccess?: (runId?: string | null) => void;
  onRuntimeRunError?: (message: string) => void;
  onOpenRunOverlay?: () => void;
};

export type WorkflowEditorWorkbenchProps = {
  workflow: WorkflowDetail;
  workflows: WorkflowListItem[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  initialCredentials?: CredentialItem[];
  initialModelProviderCatalog?: NativeModelProviderCatalogItem[];
  initialModelProviderConfigs?: WorkspaceModelProviderConfigItem[];
  initialModelProviderRegistryStatus?: WorkspaceModelProviderRegistryStatus;
  initialRecentRuns?: WorkflowRunListItem[];
  currentEditorHref?: string;
  workflowLibraryHref?: string;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
};

export type WorkflowEditorWorkbenchBootstrapRequest = {
  workflowId: string;
  surface: "editor";
};

export type WorkflowEditorWorkbenchBootstrapData = Pick<
  WorkflowEditorWorkbenchProps,
  | "workflows"
  | "nodeCatalog"
  | "nodeSourceLanes"
  | "toolSourceLanes"
  | "tools"
  | "adapters"
  | "callbackWaitingAutomation"
  | "sandboxReadiness"
  | "sandboxBackends"
  | "initialModelProviderCatalog"
  | "initialModelProviderConfigs"
  | "initialModelProviderRegistryStatus"
>;

export type WorkflowEditorWorkbenchEntryProps = Omit<
  WorkflowEditorWorkbenchProps,
  keyof WorkflowEditorWorkbenchBootstrapData
> & {
  bootstrapRequest: WorkflowEditorWorkbenchBootstrapRequest;
  initialBootstrapData?: WorkflowEditorWorkbenchBootstrapData | null;
};

export type UseWorkflowEditorPanelsArgs = {
  workflow: WorkflowDetail;
  workflows: WorkflowListItem[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  tools: PluginToolRegistryItem[];
  adapters: PluginAdapterRegistryItem[];
  credentials: CredentialItem[];
  modelProviderCatalog: NativeModelProviderCatalogItem[];
  modelProviderConfigs: WorkspaceModelProviderConfigItem[];
  modelProviderRegistryStatus: WorkspaceModelProviderRegistryStatus;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
  sandboxBackends?: SandboxBackendCheck[] | null;
  recentRuns: WorkflowRunListItem[];
  currentEditorHref?: string;
  workflowLibraryHref?: string;
  createWorkflowHref?: string;
  workspaceStarterLibraryHref?: string;
  hasScopedWorkspaceStarterFilters?: boolean;
  workspaceStarterGovernanceQueryScope?: WorkspaceStarterGovernanceQueryScope | null;
  editorNodeLibrary: WorkflowNodeCatalogItem[];
  plannedNodeLibrary: WorkflowNodeCatalogItem[];
  shell: WorkflowEditorShellState;
  graph: WorkflowEditorGraphState;
  validation: WorkflowEditorValidationState;
  runOverlay: WorkflowRunOverlayState;
  persistence: WorkflowEditorPersistenceState;
  onActivateRunOverlay: () => void;
};

export type UseWorkflowEditorPanelsResult = {
  heroProps: ComponentProps<
    typeof import("./workflow-editor-hero")["WorkflowEditorHero"]
  >;
  sidebarProps: WorkflowEditorSidebarProps;
  inspectorProps: WorkflowEditorInspectorProps;
  runLauncherSurfaceProps: WorkflowEditorRunLauncherSurfaceProps;
};

export type WorkflowEditorRunLauncherSurfaceProps = {
  workflowId: string;
  open: boolean;
  workflowVariables: Array<Record<string, unknown>>;
  onClose: () => void;
  onRunSuccess: (result: { runId?: string | null }) => void;
  onRunError: (message: string) => void;
};
