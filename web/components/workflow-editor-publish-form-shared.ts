export type WorkflowPublishedEndpointDraft = {
  id: string;
  name: string;
  alias?: string;
  path?: string;
  protocol: "native" | "openai" | "anthropic";
  workflowVersion?: string;
  authMode: "api_key" | "token" | "internal";
  streaming: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  rateLimit?: {
    requests: number;
    windowSeconds: number;
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    maxEntries: number;
    varyBy: string[];
  };
};

export const PUBLISH_PROTOCOLS = ["native", "openai", "anthropic"] as const;
export const AUTH_MODES = ["api_key", "token", "internal"] as const;
export const WORKFLOW_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const PUBLISHED_ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const PUBLISHED_PATH_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

export function normalizePublishedEndpoint(
  endpoint: Record<string, unknown>,
  index: number
): WorkflowPublishedEndpointDraft {
  const rateLimit = toRecord(endpoint.rateLimit);
  const cache = toRecord(endpoint.cache);

  return {
    id: toNonEmptyString(endpoint.id, `endpoint_${index + 1}`),
    name: toNonEmptyString(endpoint.name, `Endpoint ${index + 1}`),
    alias: toOptionalString(endpoint.alias),
    path: toOptionalString(endpoint.path),
    protocol: toEnumValue(endpoint.protocol, PUBLISH_PROTOCOLS, "native"),
    workflowVersion: toOptionalString(endpoint.workflowVersion),
    authMode: toEnumValue(endpoint.authMode, AUTH_MODES, "api_key"),
    streaming: typeof endpoint.streaming === "boolean" ? endpoint.streaming : true,
    inputSchema: toRecord(endpoint.inputSchema) ?? {},
    outputSchema: toRecord(endpoint.outputSchema) ?? undefined,
    rateLimit: rateLimit
      ? {
          requests: toPositiveInteger(rateLimit.requests, 60),
          windowSeconds: toPositiveInteger(rateLimit.windowSeconds, 60)
        }
      : undefined,
    cache: cache
      ? {
          enabled: typeof cache.enabled === "boolean" ? cache.enabled : true,
          ttl: toPositiveInteger(cache.ttl, 60),
          maxEntries: toPositiveInteger(cache.maxEntries, 128),
          varyBy: toStringArray(cache.varyBy)
        }
      : undefined
  };
}

export function createPublishedEndpointDraft(
  nextId: string,
  nextIndex: number
): Record<string, unknown> {
  return {
    id: nextId,
    name: `Endpoint ${nextIndex + 1}`,
    alias: nextId,
    path: `/${nextId}`,
    protocol: "native",
    authMode: "api_key",
    streaming: true,
    inputSchema: {},
    outputSchema: {},
    rateLimit: {
      requests: 60,
      windowSeconds: 60
    }
  };
}

export function createUniqueEndpointId(existingIds: string[]) {
  const seen = new Set(existingIds.map((value) => value.trim()).filter(Boolean));
  let index = Math.max(existingIds.length, 0) + 1;
  let candidate = `endpoint_${index}`;

  while (seen.has(candidate)) {
    index += 1;
    candidate = `endpoint_${index}`;
  }

  return candidate;
}

export function normalizePublishedEndpointAlias(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Published endpoint alias 必须是非空字符串。");
  }
  if (!PUBLISHED_ALIAS_PATTERN.test(normalized)) {
    throw new Error(
      "Published endpoint alias 只能包含小写字母、数字、'.'、'_'、'-'，且必须以字母或数字开头。"
    );
  }
  return normalized;
}

export function normalizePublishedEndpointPath(value: string) {
  const normalized = `/${value.trim().replace(/^\/+|\/+$/g, "")}`;
  if (normalized === "/") {
    throw new Error("Published endpoint path 至少要包含一个 segment。");
  }

  const segments = normalized.slice(1).split("/");
  if (segments.some((segment) => !segment)) {
    throw new Error("Published endpoint path 不能包含空 segment。");
  }
  if (
    segments.some((segment) => !PUBLISHED_PATH_SEGMENT_PATTERN.test(segment.toLowerCase()))
  ) {
    throw new Error(
      "Published endpoint path segment 只能包含小写字母、数字、'.'、'_' 或 '-'。"
    );
  }

  return `/${segments.map((segment) => segment.toLowerCase()).join("/")}`;
}

export function assignOptionalString(
  record: Record<string, unknown>,
  field: string,
  value: string
) {
  const normalized = value.trim();
  if (!normalized) {
    delete record[field];
    return record;
  }
  record[field] = normalized;
  return record;
}

export function cloneRecord<T extends Record<string, unknown>>(value: T) {
  return structuredClone(value);
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toRecord(value: unknown) {
  return isRecord(value) ? { ...value } : null;
}

export function parsePositiveInteger(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function toEnumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number]
): T[number] {
  return typeof value === "string" && options.includes(value as T[number])
    ? (value as T[number])
    : fallback;
}

function toOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function toNonEmptyString(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function toPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
