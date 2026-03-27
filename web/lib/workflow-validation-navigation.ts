import type { WorkflowDefinitionPreflightIssue } from "@/lib/get-workflows";

type WorkflowDefinitionLike = {
  nodes?: unknown;
  publish?: unknown;
  variables?: unknown;
};

export type WorkflowValidationFocusTarget =
  | {
      scope: "node";
      nodeId: string;
      section: "config" | "contract" | "runtime";
      fieldPath?: string;
      label: string;
    }
  | {
      scope: "publish";
      endpointIndex: number;
      fieldPath?: string;
      label: string;
    }
  | {
      scope: "variables";
      variableIndex: number;
      fieldPath?: string;
      label: string;
    };

export type WorkflowValidationNavigatorItem = {
  key: string;
  category: string;
  message: string;
  target: WorkflowValidationFocusTarget;
  catalogGapToolIds?: string[];
  hasLegacyPublishAuthModeIssues?: boolean;
};

export type WorkflowValidationNavigatorIssue = WorkflowDefinitionPreflightIssue & {
  catalogGapToolIds?: string[];
  hasLegacyPublishAuthModeIssues?: boolean;
};

export function buildWorkflowValidationNavigatorItems(
  definition: WorkflowDefinitionLike,
  issues: WorkflowValidationNavigatorIssue[]
): WorkflowValidationNavigatorItem[] {
  const items: WorkflowValidationNavigatorItem[] = [];
  const seen = new Set<string>();

  issues.forEach((issue, index) => {
    const target = resolveWorkflowValidationFocusTarget(definition, issue);
    if (!target) {
      return;
    }

    const key = `${issue.category}:${issue.path ?? issue.field ?? issue.message}:${target.label}:${index}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const catalogGapToolIds = normalizeCatalogGapToolIds(issue.catalogGapToolIds);
    const hasLegacyPublishAuthModeIssues =
      issue.hasLegacyPublishAuthModeIssues ??
      (issue.category === "publish_draft" && issue.field === "authMode");

    items.push({
      key,
      category: issue.category,
      message: issue.message,
      target,
      catalogGapToolIds: catalogGapToolIds.length > 0 ? catalogGapToolIds : undefined,
      hasLegacyPublishAuthModeIssues: hasLegacyPublishAuthModeIssues || undefined
    });
  });

  return items;
}

function resolveWorkflowValidationFocusTarget(
  definition: WorkflowDefinitionLike,
  issue: WorkflowDefinitionPreflightIssue
): WorkflowValidationFocusTarget | null {
  const path = typeof issue.path === "string" ? issue.path.trim() : "";
  if (!path) {
    return null;
  }

  const nodeMatch = /^nodes\.(\d+)\.(.+)$/.exec(path);
  if (nodeMatch) {
    const nodeIndex = Number.parseInt(nodeMatch[1] ?? "", 10);
    const remainder = nodeMatch[2] ?? "";
    const node = readIndexedRecord(definition.nodes, nodeIndex);
    const nodeId = normalizeString(node?.id) ?? `node_${nodeIndex + 1}`;
    const nodeName = normalizeString(node?.name) ?? nodeId;
    const section = remainder.startsWith("runtimePolicy")
      ? "runtime"
      : remainder.startsWith("inputSchema") || remainder.startsWith("outputSchema")
        ? "contract"
        : "config";
    return {
      scope: "node",
      nodeId,
      section,
      fieldPath: remainder || undefined,
      label: `Node · ${nodeName}`
    };
  }

  const publishMatch = /^publish\.(\d+)\./.exec(path);
  if (publishMatch) {
    const endpointIndex = Number.parseInt(publishMatch[1] ?? "", 10);
    const fieldPath = path.replace(/^publish\.\d+\./, "");
    const endpoint = readIndexedRecord(definition.publish, endpointIndex);
    const endpointId = normalizeString(endpoint?.id) ?? `endpoint_${endpointIndex + 1}`;
    const endpointName = normalizeString(endpoint?.name);
    return {
      scope: "publish",
      endpointIndex,
      fieldPath: fieldPath || undefined,
      label: endpointName && endpointName !== endpointId
        ? `Publish · ${endpointName}`
        : `Publish · ${endpointId}`
    };
  }

  const variableMatch = /^variables\.(\d+)\./.exec(path);
  if (variableMatch) {
    const variableIndex = Number.parseInt(variableMatch[1] ?? "", 10);
    const fieldPath = path.replace(/^variables\.\d+\./, "");
    const variable = readIndexedRecord(definition.variables, variableIndex);
    const variableName = normalizeString(variable?.name) ?? `variable_${variableIndex + 1}`;
    return {
      scope: "variables",
      variableIndex,
      fieldPath: fieldPath || undefined,
      label: `Variable · ${variableName}`
    };
  }

  return null;
}

function readIndexedRecord(value: unknown, index: number): Record<string, unknown> | null {
  if (!Array.isArray(value) || index < 0 || index >= value.length) {
    return null;
  }
  const candidate = value[index];
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? (candidate as Record<string, unknown>)
    : null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCatalogGapToolIds(toolIds: readonly unknown[] | undefined) {
  return Array.from(
    new Set(
      (toolIds ?? [])
        .map((toolId) => normalizeString(toolId))
        .filter((toolId): toolId is string => toolId !== null)
    )
  );
}
