type WorkflowPublishVersionValidationDefinition = {
  publish?: unknown;
};

export type WorkflowPublishVersionValidationIssue = {
  key: string;
  endpointId: string;
  message: string;
};

export function buildAllowedPublishWorkflowVersions(options: {
  workflowVersion: string;
  historicalVersions?: string[];
}) {
  const allowedVersions = new Set<string>();
  options.historicalVersions?.forEach((version) => {
    const normalizedVersion = normalizeString(version);
    if (normalizedVersion) {
      allowedVersions.add(normalizedVersion);
    }
  });

  const currentVersion = normalizeString(options.workflowVersion);
  if (currentVersion) {
    allowedVersions.add(currentVersion);
    const nextVersion = tryBumpWorkflowVersion(currentVersion);
    if (nextVersion) {
      allowedVersions.add(nextVersion);
    }
  }

  return Array.from(allowedVersions).sort(compareSemanticVersion);
}

export function buildWorkflowPublishVersionValidationIssues(
  definition: WorkflowPublishVersionValidationDefinition,
  allowedVersions: string[]
) {
  if (!Array.isArray(definition.publish) || allowedVersions.length === 0) {
    return [] as WorkflowPublishVersionValidationIssue[];
  }

  const allowedVersionSet = new Set(allowedVersions);
  const issues: WorkflowPublishVersionValidationIssue[] = [];
  definition.publish.forEach((endpoint, index) => {
    if (!isRecord(endpoint)) {
      return;
    }

    const workflowVersion = normalizeString(endpoint.workflowVersion);
    if (!workflowVersion || allowedVersionSet.has(workflowVersion)) {
      return;
    }

    const endpointId = normalizeString(endpoint.id) ?? `endpoint_${index + 1}`;
    const endpointName = normalizeString(endpoint.name);
    const endpointLabel =
      endpointName && endpointName !== endpointId ? `${endpointName} (${endpointId})` : endpointId;
    issues.push({
      key: `publish-version-${endpointId}-${workflowVersion}`,
      endpointId,
      message: `${endpointLabel} 引用了当前不可用的 workflowVersion ${workflowVersion}。可选版本：${allowedVersions.join(
        ", "
      )}；如果要跟随本次保存版本，请直接留空。`
    });
  });

  return issues;
}

export function tryBumpWorkflowVersion(version: string) {
  const parts = version.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }
  const [major, minor, patch] = parts.map((part) => Number.parseInt(part, 10));
  return `${major}.${minor}.${patch + 1}`;
}

function compareSemanticVersion(left: string, right: string) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
