import { getApiBaseUrl } from "@/lib/api-base-url";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  SignalFollowUpExplanation,
  WorkspaceStarterSourceActionDecisionPayload
} from "@/lib/get-workspace-starters";
import type { WorkflowEdgeItem, WorkflowNodeItem } from "@/lib/get-workflows";
import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import type { WorkflowDefinition } from "@/lib/workflow-editor";

export type WorkflowLibrarySourceDescriptor = {
  kind: "starter" | "node" | "tool";
  scope: "builtin" | "workspace" | "ecosystem";
  status: "available" | "planned";
  governance: "repo" | "workspace" | "adapter";
  ecosystem: string;
  label: string;
  shortLabel: string;
  summary: string;
};

export type WorkflowLibrarySourceLane = WorkflowLibrarySourceDescriptor & {
  count: number;
};

export type WorkflowNodeCatalogItem = {
  type: string;
  label: string;
  description: string;
  ecosystem: string;
  source: WorkflowLibrarySourceDescriptor;
  capabilityGroup: "entry" | "agent" | "integration" | "logic" | "output";
  businessTrack: WorkflowBusinessTrack;
  tags: string[];
  supportStatus: "available" | "planned";
  supportSummary: string;
  bindingRequired: boolean;
  bindingSourceLanes: WorkflowLibrarySourceLane[];
  palette: {
    enabled: boolean;
    order: number;
    defaultPosition: { x: number; y: number };
  };
  defaults: {
    name: string;
    config: Record<string, unknown>;
  };
};

export type WorkflowLibraryStarterItem = {
  id: string;
  origin: "builtin" | "workspace";
  workspaceId?: string | null;
  name: string;
  description: string;
  businessTrack: WorkflowBusinessTrack;
  defaultWorkflowName: string;
  workflowFocus: string;
  recommendedNextStep: string;
  tags: string[];
  definition: WorkflowDefinition;
  source: WorkflowLibrarySourceDescriptor;
  createdFromWorkflowId?: string | null;
  createdFromWorkflowVersion?: string | null;
  archived: boolean;
  archivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  sourceGovernance?: WorkflowStarterSourceGovernance | null;
};

export type WorkflowStarterSourceGovernance = {
  kind: "no_source" | "missing_source" | "synced" | "drifted";
  statusLabel: string;
  summary: string;
  sourceWorkflowId?: string | null;
  sourceWorkflowName?: string | null;
  templateVersion?: string | null;
  sourceVersion?: string | null;
  actionDecision?: WorkspaceStarterSourceActionDecisionPayload | null;
  outcomeExplanation?: SignalFollowUpExplanation | null;
};

export type WorkflowLibrarySnapshot = {
  nodes: WorkflowNodeCatalogItem[];
  starters: WorkflowLibraryStarterItem[];
  starterSourceLanes: WorkflowLibrarySourceLane[];
  nodeSourceLanes: WorkflowLibrarySourceLane[];
  toolSourceLanes: WorkflowLibrarySourceLane[];
  tools: PluginToolRegistryItem[];
};

type WorkflowLibrarySnapshotResponse = {
  nodes?: Array<Record<string, unknown>>;
  starters?: Array<Record<string, unknown>>;
  starter_source_lanes?: Array<Record<string, unknown>>;
  node_source_lanes?: Array<Record<string, unknown>>;
  tool_source_lanes?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
};

const fallbackSnapshot: WorkflowLibrarySnapshot = {
  nodes: [],
  starters: [],
  starterSourceLanes: [],
  nodeSourceLanes: [],
  toolSourceLanes: [],
  tools: []
};

export async function getWorkflowLibrarySnapshot(
  workspaceId = "default"
): Promise<WorkflowLibrarySnapshot> {
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflow-library?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return fallbackSnapshot;
    }

    return normalizeWorkflowLibrarySnapshot(
      (await response.json()) as WorkflowLibrarySnapshotResponse
    );
  } catch {
    return fallbackSnapshot;
  }
}

function normalizeWorkflowLibrarySnapshot(
  input: WorkflowLibrarySnapshotResponse
): WorkflowLibrarySnapshot {
  return {
    nodes: Array.isArray(input.nodes) ? input.nodes.map(normalizeNodeCatalogItem) : [],
    starters: Array.isArray(input.starters)
      ? input.starters.map(normalizeStarterItem)
      : [],
    starterSourceLanes: Array.isArray(input.starter_source_lanes)
      ? input.starter_source_lanes.map(normalizeSourceLane)
      : [],
    nodeSourceLanes: Array.isArray(input.node_source_lanes)
      ? input.node_source_lanes.map(normalizeSourceLane)
      : [],
    toolSourceLanes: Array.isArray(input.tool_source_lanes)
      ? input.tool_source_lanes.map(normalizeSourceLane)
      : [],
    tools: Array.isArray(input.tools) ? input.tools.map(normalizeToolItem) : []
  };
}

function normalizeSourceDescriptor(
  input: Record<string, unknown>
): WorkflowLibrarySourceDescriptor {
  return {
    kind: asString(input.kind, "starter") as WorkflowLibrarySourceDescriptor["kind"],
    scope: asString(input.scope, "builtin") as WorkflowLibrarySourceDescriptor["scope"],
    status: asString(
      input.status,
      "planned"
    ) as WorkflowLibrarySourceDescriptor["status"],
    governance: asString(
      input.governance,
      "repo"
    ) as WorkflowLibrarySourceDescriptor["governance"],
    ecosystem: asString(input.ecosystem),
    label: asString(input.label),
    shortLabel: asString(input.short_label),
    summary: asString(input.summary)
  };
}

function normalizeSourceLane(input: Record<string, unknown>): WorkflowLibrarySourceLane {
  return {
    ...normalizeSourceDescriptor(input),
    count: typeof input.count === "number" ? input.count : 0
  };
}

function normalizeNodeCatalogItem(
  input: Record<string, unknown>
): WorkflowNodeCatalogItem {
  const palette = isRecord(input.palette) ? input.palette : {};
  const defaultPosition = isRecord(palette.default_position)
    ? palette.default_position
    : {};
  const defaults = isRecord(input.defaults) ? input.defaults : {};

  return {
    type: asString(input.type),
    label: asString(input.label),
    description: asString(input.description),
    ecosystem: asString(input.ecosystem, "native"),
    source: normalizeSourceDescriptor(isRecord(input.source) ? input.source : {}),
    capabilityGroup: asString(
      input.capability_group,
      "integration"
    ) as WorkflowNodeCatalogItem["capabilityGroup"],
    businessTrack: asString(
      input.business_track,
      "应用新建编排"
    ) as WorkflowBusinessTrack,
    tags: asStringArray(input.tags),
    supportStatus: asString(
      input.support_status,
      "available"
    ) as WorkflowNodeCatalogItem["supportStatus"],
    supportSummary: asString(input.support_summary),
    bindingRequired: Boolean(input.binding_required),
    bindingSourceLanes: Array.isArray(input.binding_source_lanes)
      ? input.binding_source_lanes
          .filter(isRecord)
          .map((lane) => normalizeSourceLane(lane))
      : [],
    palette: {
      enabled: Boolean(palette.enabled),
      order: typeof palette.order === "number" ? palette.order : 0,
      defaultPosition: {
        x: typeof defaultPosition.x === "number" ? defaultPosition.x : 240,
        y: typeof defaultPosition.y === "number" ? defaultPosition.y : 120
      }
    },
    defaults: {
      name: asString(defaults.name, asString(input.type)),
      config: isRecord(defaults.config) ? { ...defaults.config } : {}
    }
  };
}

function normalizeStarterItem(input: Record<string, unknown>): WorkflowLibraryStarterItem {
  return {
    id: asString(input.id),
    origin: asString(input.origin, "builtin") as WorkflowLibraryStarterItem["origin"],
    workspaceId: asOptionalString(input.workspace_id),
    name: asString(input.name),
    description: asString(input.description),
    businessTrack: asString(
      input.business_track,
      "应用新建编排"
    ) as WorkflowBusinessTrack,
    defaultWorkflowName: asString(input.default_workflow_name, asString(input.name)),
    workflowFocus: asString(input.workflow_focus),
    recommendedNextStep: asString(input.recommended_next_step),
    tags: asStringArray(input.tags),
    definition: normalizeWorkflowDefinition(input.definition),
    source: normalizeSourceDescriptor(isRecord(input.source) ? input.source : {}),
    createdFromWorkflowId: asOptionalString(input.created_from_workflow_id),
    createdFromWorkflowVersion: asOptionalString(input.created_from_workflow_version),
    archived: Boolean(input.archived),
    archivedAt: asOptionalString(input.archived_at),
    createdAt: asOptionalString(input.created_at),
    updatedAt: asOptionalString(input.updated_at),
    sourceGovernance: isRecord(input.source_governance)
      ? normalizeStarterSourceGovernance(input.source_governance)
      : null
  };
}

function normalizeStarterSourceGovernance(
  input: Record<string, unknown>
): WorkflowStarterSourceGovernance {
  return {
    kind: asString(input.kind, "no_source") as WorkflowStarterSourceGovernance["kind"],
    statusLabel: asString(input.status_label),
    summary: asString(input.summary),
    sourceWorkflowId: asOptionalString(input.source_workflow_id),
    sourceWorkflowName: asOptionalString(input.source_workflow_name),
    templateVersion: asOptionalString(input.template_version),
    sourceVersion: asOptionalString(input.source_version),
    actionDecision: isRecord(input.action_decision)
      ? normalizeSourceActionDecision(input.action_decision)
      : null,
    outcomeExplanation: isRecord(input.outcome_explanation)
      ? normalizeSignalFollowUpExplanation(input.outcome_explanation)
      : null
  };
}

function normalizeSourceActionDecision(
  input: Record<string, unknown>
): WorkspaceStarterSourceActionDecisionPayload {
  return {
    recommended_action: asString(input.recommended_action, "none") as WorkspaceStarterSourceActionDecisionPayload["recommended_action"],
    status_label: asString(input.status_label),
    summary: asString(input.summary),
    can_refresh: Boolean(input.can_refresh),
    can_rebase: Boolean(input.can_rebase),
    fact_chips: asStringArray(input.fact_chips)
  };
}

function normalizeSignalFollowUpExplanation(
  input: Record<string, unknown>
): SignalFollowUpExplanation {
  return {
    primary_signal: asOptionalString(input.primary_signal),
    follow_up: asOptionalString(input.follow_up)
  };
}

function normalizeToolItem(input: Record<string, unknown>): PluginToolRegistryItem {
  return {
    id: asString(input.id),
    name: asString(input.name),
    ecosystem: asString(input.ecosystem, "native"),
    description: asString(input.description),
    input_schema: isRecord(input.input_schema) ? { ...input.input_schema } : {},
    output_schema: isRecord(input.output_schema) ? { ...input.output_schema } : null,
    source: asString(input.source, "builtin"),
    plugin_meta: isRecord(input.plugin_meta) ? { ...input.plugin_meta } : null,
    callable: Boolean(input.callable),
    supported_execution_classes: asStringArray(input.supported_execution_classes),
    default_execution_class: asOptionalString(input.default_execution_class),
    sensitivity_level: asOptionalString(input.sensitivity_level) as
      | "L0"
      | "L1"
      | "L2"
      | "L3"
      | null
  };
}

function normalizeWorkflowDefinition(value: unknown): WorkflowDefinition {
  const definition = isRecord(value) ? value : {};
  return {
    nodes: Array.isArray(definition.nodes)
      ? definition.nodes
          .filter(isRecord)
          .map((node) => normalizeWorkflowNodeItem(node))
      : [],
    edges: Array.isArray(definition.edges)
      ? definition.edges
          .filter(isRecord)
          .map((edge) => normalizeWorkflowEdgeItem(edge))
      : [],
    variables: Array.isArray(definition.variables)
      ? definition.variables.filter(isRecord).map((item) => ({ ...item }))
      : [],
    publish: Array.isArray(definition.publish)
      ? definition.publish.filter(isRecord).map((item) => ({ ...item }))
      : []
  };
}

function normalizeWorkflowNodeItem(input: Record<string, unknown>): WorkflowNodeItem {
  return {
    ...input,
    id: asString(input.id),
    type: asString(input.type),
    name: asString(input.name, asString(input.type)),
    config: isRecord(input.config) ? { ...input.config } : {}
  };
}

function normalizeWorkflowEdgeItem(input: Record<string, unknown>): WorkflowEdgeItem {
  return {
    ...input,
    id: asString(input.id),
    sourceNodeId: asString(input.sourceNodeId),
    targetNodeId: asString(input.targetNodeId),
    channel: asString(input.channel, "control")
  };
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
