import {
  getWorkflowBusinessTrack,
  WORKFLOW_BUSINESS_TRACKS,
  type WorkflowBusinessTrack,
  type WorkflowBusinessTrackPriority
} from "@/lib/workflow-business-tracks";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import type { WorkflowDefinition } from "@/lib/workflow-editor";
import {
  summarizeWorkflowDefinitionSandboxGovernance,
  type WorkflowDefinitionSandboxGovernance
} from "@/lib/workflow-definition-sandbox-governance";
import { summarizeWorkflowDefinitionToolGovernance } from "@/lib/workflow-definition-tool-governance";

export type WorkflowStarterTemplateId = string;

export type WorkflowStarterTemplate = {
  id: WorkflowStarterTemplateId;
  origin: "builtin" | "workspace";
  name: string;
  description: string;
  businessTrack: WorkflowBusinessTrack;
  priority: WorkflowBusinessTrackPriority;
  trackSummary: string;
  trackFocus: string;
  defaultWorkflowName: string;
  source: WorkflowLibraryStarterItem["source"];
  createdFromWorkflowId: string | null;
  workflowFocus: string;
  recommendedNextStep: string;
  nodeCount: number;
  nodeLabels: string[];
  referencedTools: PluginToolRegistryItem[];
  missingToolIds: string[];
  governedToolCount: number;
  strongIsolationToolCount: number;
  sandboxGovernance: WorkflowDefinitionSandboxGovernance;
  sourceGovernance: WorkflowLibraryStarterItem["sourceGovernance"];
  archived: boolean;
  tags: string[];
  definition: WorkflowDefinition;
};

export type WorkflowStarterTrackItem = {
  id: WorkflowBusinessTrack;
  priority: WorkflowBusinessTrackPriority;
  summary: string;
  focus: string;
  starterCount: number;
  recommendedStarterId: WorkflowStarterTemplateId | null;
};

export function buildWorkflowStarterTemplates(
  starters: WorkflowLibraryStarterItem[],
  nodeCatalog: WorkflowNodeCatalogItem[],
  tools: PluginToolRegistryItem[]
): WorkflowStarterTemplate[] {
  return starters.map((starter) =>
    buildWorkflowStarterTemplate(starter, nodeCatalog, tools)
  );
}

export function buildWorkflowStarterTracks(
  starters: WorkflowStarterTemplate[]
): WorkflowStarterTrackItem[] {
  return WORKFLOW_BUSINESS_TRACKS.map((track) => {
    const trackStarters = starters.filter(
      (starter) => starter.businessTrack === track.id
    );

    return {
      id: track.id,
      priority: track.priority,
      summary: track.summary,
      focus: track.focus,
      starterCount: trackStarters.length,
      recommendedStarterId: trackStarters[0]?.id ?? null
    };
  });
}

export function inferWorkflowBusinessTrack(
  definition: WorkflowDefinition
): WorkflowBusinessTrack {
  const nodeTypes = new Set(
    (definition.nodes ?? [])
      .map((node) => (typeof node.type === "string" ? node.type : ""))
      .filter(Boolean)
  );
  const publishCount = Array.isArray(definition.publish) ? definition.publish.length : 0;
  const outputNodes = (definition.nodes ?? []).filter((node) => node.type === "output");

  if (
    publishCount > 0 ||
    outputNodes.some((node) => typeof node.config?.responseMode === "string")
  ) {
    return "API 调用开放";
  }

  if (nodeTypes.has("tool")) {
    return "Dify 插件兼容";
  }

  if (
    nodeTypes.has("llm_agent") ||
    nodeTypes.has("sandbox_code") ||
    nodeTypes.has("mcp_query") ||
    nodeTypes.has("condition") ||
    nodeTypes.has("router")
  ) {
    return "编排节点能力";
  }

  return "应用新建编排";
}

function buildWorkflowStarterTemplate(
  starter: WorkflowLibraryStarterItem,
  nodeCatalog: WorkflowNodeCatalogItem[],
  tools: PluginToolRegistryItem[]
): WorkflowStarterTemplate {
  const track = getWorkflowBusinessTrack(starter.businessTrack);
  const definition = normalizeWorkflowDefinition(starter.definition);
  const nodeTypes = (definition.nodes ?? []).map((node) => node.type);
  const toolGovernance = summarizeWorkflowDefinitionToolGovernance(definition, tools);
  const sandboxGovernance = summarizeWorkflowDefinitionSandboxGovernance(definition);

  return {
    id: starter.id,
    origin: starter.origin,
    name: starter.name,
    description: starter.description,
    businessTrack: starter.businessTrack,
    priority: track.priority,
    trackSummary: track.summary,
    trackFocus: track.focus,
    defaultWorkflowName: starter.defaultWorkflowName,
    source: starter.source,
    createdFromWorkflowId: starter.createdFromWorkflowId ?? null,
    workflowFocus: starter.workflowFocus,
    recommendedNextStep: starter.recommendedNextStep,
    nodeCount: definition.nodes?.length ?? 0,
    nodeLabels: nodeTypes.map(
      (nodeType) =>
        nodeCatalog.find((item) => item.type === nodeType)?.label ?? nodeType
    ),
    referencedTools: toolGovernance.referencedTools,
    missingToolIds: toolGovernance.missingToolIds,
    governedToolCount: toolGovernance.governedToolCount,
    strongIsolationToolCount: toolGovernance.strongIsolationToolCount,
    sandboxGovernance,
    sourceGovernance: starter.sourceGovernance ?? null,
    archived: starter.archived,
    tags: starter.tags,
    definition
  };
}

function normalizeWorkflowDefinition(definition: WorkflowDefinition): WorkflowDefinition {
  return {
    nodes: Array.isArray(definition.nodes)
      ? definition.nodes.map((node) => ({
          ...node,
          config: isRecord(node.config) ? { ...node.config } : {}
        }))
      : [],
    edges: Array.isArray(definition.edges)
      ? definition.edges.map((edge) => ({ ...edge }))
      : [],
    variables: Array.isArray(definition.variables)
      ? definition.variables.map((variable) => ({ ...variable }))
      : [],
    publish: Array.isArray(definition.publish)
      ? definition.publish.map((endpoint) => ({ ...endpoint }))
      : []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
