import {
  normalizePublishedEndpointAlias,
  normalizePublishedEndpointPath,
  WORKFLOW_VERSION_PATTERN,
  type WorkflowPublishedEndpointDraft
} from "./workflow-editor-publish-form-shared";

export type WorkflowEditorPublishValidationIssue = {
  key: string;
  endpointKey: string;
  endpointId: string;
  message: string;
};

export function buildPublishedEndpointValidationIssues(
  endpoints: WorkflowPublishedEndpointDraft[]
) {
  const issues: WorkflowEditorPublishValidationIssue[] = [];
  const normalizedItems = endpoints.map((endpoint, index) => {
    const endpointLabel = endpoint.name || endpoint.id || `Endpoint ${index + 1}`;
    const entryKey = `${endpoint.id || "endpoint"}-${index}`;
    const endpointKey = String(index);

    if (
      endpoint.workflowVersion &&
      !WORKFLOW_VERSION_PATTERN.test(endpoint.workflowVersion)
    ) {
      issues.push({
        key: `${entryKey}-workflow-version`,
        endpointKey,
        endpointId: endpoint.id,
        message: `${endpointLabel} 的 workflowVersion 必须使用 major.minor.patch 语义版本格式。`
      });
    }

    const normalizedAlias = readNormalizedAlias(endpoint, endpointKey, endpointLabel, issues);
    const normalizedPath = readNormalizedPath(
      endpoint,
      endpointKey,
      endpointLabel,
      normalizedAlias,
      issues
    );

    if (endpoint.cache && endpoint.cache.varyBy.length > 0) {
      const uniqueFields = new Set(endpoint.cache.varyBy);
      if (uniqueFields.size !== endpoint.cache.varyBy.length) {
        issues.push({
          key: `${entryKey}-cache-vary-by`,
          endpointKey,
          endpointId: endpoint.id,
          message: `${endpointLabel} 的 cache.varyBy 不能包含重复字段。`
        });
      }
    }

    return {
      entryKey,
      endpointKey,
      endpointId: endpoint.id,
      endpointLabel,
      id: endpoint.id,
      name: endpoint.name,
      alias: normalizedAlias,
      path: normalizedPath
    };
  });

  pushDuplicateIssues(normalizedItems, "id", "endpoint id", issues);
  pushDuplicateIssues(normalizedItems, "name", "endpoint name", issues);
  pushDuplicateIssues(normalizedItems, "alias", "endpoint alias", issues);
  pushDuplicateIssues(normalizedItems, "path", "endpoint path", issues);

  return issues;
}

function readNormalizedAlias(
  endpoint: WorkflowPublishedEndpointDraft,
  endpointKey: string,
  endpointLabel: string,
  issues: WorkflowEditorPublishValidationIssue[]
) {
  try {
    return normalizePublishedEndpointAlias(endpoint.alias ?? endpoint.id);
  } catch (error) {
    issues.push({
      key: `${endpoint.id}-alias-format-${issues.length}`,
      endpointKey,
      endpointId: endpoint.id,
      message: `${endpointLabel} 的 endpoint alias 不合法：${readErrorMessage(error)}`
    });
    return undefined;
  }
}

function readNormalizedPath(
  endpoint: WorkflowPublishedEndpointDraft,
  endpointKey: string,
  endpointLabel: string,
  normalizedAlias: string | undefined,
  issues: WorkflowEditorPublishValidationIssue[]
) {
  try {
    return normalizePublishedEndpointPath(endpoint.path ?? `/${normalizedAlias ?? endpoint.id}`);
  } catch (error) {
    issues.push({
      key: `${endpoint.id}-path-format-${issues.length}`,
      endpointKey,
      endpointId: endpoint.id,
      message: `${endpointLabel} 的 endpoint path 不合法：${readErrorMessage(error)}`
    });
    return undefined;
  }
}

function pushDuplicateIssues(
  items: Array<{
    entryKey: string;
    endpointKey: string;
    endpointId: string;
    endpointLabel: string;
    id?: string;
    name?: string;
    alias?: string;
    path?: string;
  }>,
  field: "id" | "name" | "alias" | "path",
  label: string,
  issues: WorkflowEditorPublishValidationIssue[]
) {
  const occurrences = new Map<string, string[]>();
  for (const item of items) {
    const value = item[field];
    if (!value) {
      continue;
    }
    const next = occurrences.get(value) ?? [];
    next.push(item.endpointLabel);
    occurrences.set(value, next);
  }

  for (const item of items) {
    const value = item[field];
    const duplicates = value ? occurrences.get(value) : undefined;
    if (!value || !duplicates || duplicates.length <= 1) {
      continue;
    }
    issues.push({
      key: `${item.entryKey}-${field}-duplicate`,
      endpointKey: item.endpointKey,
      endpointId: item.endpointId,
      message: `${item.endpointLabel} 的 ${label} “${value}” 与其他 publish endpoint 重复。`
    });
  }
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "格式不合法。";
}
