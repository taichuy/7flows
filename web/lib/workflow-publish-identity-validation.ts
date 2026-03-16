type WorkflowPublishIdentityValidationDefinition = {
  publish?: unknown;
};

export type WorkflowPublishIdentityValidationIssue = {
  key: string;
  endpointId: string;
  message: string;
  path: string;
  field: "id" | "alias" | "path";
};

export function buildWorkflowPublishIdentityValidationIssues(
  definition: WorkflowPublishIdentityValidationDefinition
) {
  if (!Array.isArray(definition.publish)) {
    return [] as WorkflowPublishIdentityValidationIssue[];
  }

  const duplicateEndpointIds = collectDuplicatePublishValues(definition.publish, (endpoint) =>
    normalizeString(endpoint.id)
  );
  const duplicateAliases = collectDuplicatePublishValues(definition.publish, (endpoint) =>
    normalizePublishAlias(normalizeString(endpoint.alias) ?? normalizeString(endpoint.id))
  );
  const duplicatePaths = collectDuplicatePublishValues(definition.publish, (endpoint) =>
    normalizePublishPath(
      normalizeString(endpoint.path) ?? `/${normalizePublishAlias(normalizeString(endpoint.alias) ?? normalizeString(endpoint.id)) ?? ""}`
    )
  );

  return [
    ...buildIdentityIssues({
      publish: definition.publish,
      duplicates: duplicateEndpointIds,
      field: "id",
      messageBuilder: (value) => `Publish endpoint id '${value}' 在当前 workflow 中重复。`
    }),
    ...buildIdentityIssues({
      publish: definition.publish,
      duplicates: duplicateAliases,
      field: "alias",
      messageBuilder: (value) => `Publish endpoint alias '${value}' 归一化后发生冲突。`
    }),
    ...buildIdentityIssues({
      publish: definition.publish,
      duplicates: duplicatePaths,
      field: "path",
      messageBuilder: (value) => `Publish endpoint path '${value}' 归一化后发生冲突。`
    })
  ];
}

function buildIdentityIssues({
  publish,
  duplicates,
  field,
  messageBuilder
}: {
  publish: unknown[];
  duplicates: Map<string, number[]>;
  field: "id" | "alias" | "path";
  messageBuilder: (value: string) => string;
}) {
  const issues: WorkflowPublishIdentityValidationIssue[] = [];
  duplicates.forEach((indexes, value) => {
    indexes.forEach((index) => {
      const endpoint = readRecord(publish[index]);
      const endpointId = normalizeString(endpoint?.id) ?? `endpoint_${index + 1}`;
      issues.push({
        key: `publish-identity-${field}-${endpointId}-${value}-${index}`,
        endpointId,
        message: messageBuilder(value),
        path: `publish.${index}.${field}`,
        field
      });
    });
  });
  return issues;
}

function collectDuplicatePublishValues(
  publish: unknown[],
  selector: (endpoint: Record<string, unknown>) => string | null
) {
  const seen = new Map<string, number[]>();
  publish.forEach((candidate, index) => {
    const endpoint = readRecord(candidate);
    if (!endpoint) {
      return;
    }
    const value = selector(endpoint);
    if (!value) {
      return;
    }
    const indexes = seen.get(value);
    if (indexes) {
      indexes.push(index);
      return;
    }
    seen.set(value, [index]);
  });

  return new Map(Array.from(seen.entries()).filter(([, indexes]) => indexes.length > 1));
}

function normalizePublishAlias(value: string | null) {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase() || null;
}

function normalizePublishPath(value: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return null;
  }
  const segments = trimmed
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  return segments.length > 0 ? `/${segments.join("/")}` : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
