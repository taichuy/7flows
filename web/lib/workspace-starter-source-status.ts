import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { WorkflowDetail } from "@/lib/get-workflows";

export type WorkspaceStarterSourceStatus = {
  kind: "no-source" | "missing" | "synced" | "drifted";
  label: string;
  summary: string;
  templateVersion: string | null;
  sourceVersion: string | null;
  templateNodeCount: number;
  sourceNodeCount: number;
  templateEdgeCount: number;
  sourceEdgeCount: number;
};

export function summarizeWorkspaceStarterSourceStatus(
  template: WorkspaceStarterTemplateItem,
  sourceWorkflow: WorkflowDetail | null
): WorkspaceStarterSourceStatus {
  const templateNodeCount = countItems(template.definition.nodes);
  const templateEdgeCount = countItems(template.definition.edges);

  if (!template.created_from_workflow_id) {
    return {
      kind: "no-source",
      label: "无来源 workflow",
      summary: "这个 workspace starter 不是从具体 workflow 派生出来的，当前只保留模板快照。",
      templateVersion: template.created_from_workflow_version ?? null,
      sourceVersion: null,
      templateNodeCount,
      sourceNodeCount: 0,
      templateEdgeCount,
      sourceEdgeCount: 0
    };
  }

  if (!sourceWorkflow) {
    return {
      kind: "missing",
      label: "来源不可用",
      summary: "当前找不到对应的源 workflow，可能已被删除，或 API 暂时不可访问。",
      templateVersion: template.created_from_workflow_version ?? null,
      sourceVersion: null,
      templateNodeCount,
      sourceNodeCount: 0,
      templateEdgeCount,
      sourceEdgeCount: 0
    };
  }

  const sourceNodeCount = countItems(sourceWorkflow.definition.nodes);
  const sourceEdgeCount = countItems(sourceWorkflow.definition.edges);
  const templateVersion = template.created_from_workflow_version ?? null;
  const sourceVersion = sourceWorkflow.version;
  const definitionsMatch =
    stringifyDefinition(template.definition) ===
    stringifyDefinition(sourceWorkflow.definition);
  const versionsMatch = templateVersion === sourceVersion;

  if (definitionsMatch && versionsMatch) {
    return {
      kind: "synced",
      label: "已同步",
      summary: "模板快照与当前源 workflow 保持一致，可以直接继续复用。",
      templateVersion,
      sourceVersion,
      templateNodeCount,
      sourceNodeCount,
      templateEdgeCount,
      sourceEdgeCount
    };
  }

  const driftReasons = [
    versionsMatch ? null : "版本号已经前进",
    definitionsMatch ? null : "definition 已发生变化"
  ].filter(Boolean);

  return {
    kind: "drifted",
    label: "源 workflow 已变化",
    summary: `来源 workflow 相比模板快照已有漂移：${driftReasons.join("，")}。`,
    templateVersion,
    sourceVersion,
    templateNodeCount,
    sourceNodeCount,
    templateEdgeCount,
    sourceEdgeCount
  };
}

function stringifyDefinition(definition: WorkspaceStarterTemplateItem["definition"]) {
  return JSON.stringify({
    nodes: Array.isArray(definition.nodes)
      ? definition.nodes.map((node) => ({
          ...node,
          config: isRecord(node.config) ? node.config : {}
        }))
      : [],
    edges: Array.isArray(definition.edges) ? definition.edges : [],
    variables: Array.isArray(definition.variables) ? definition.variables : [],
    publish: Array.isArray(definition.publish) ? definition.publish : []
  });
}

function countItems(value: unknown[] | undefined) {
  return Array.isArray(value) ? value.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
