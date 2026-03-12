export const PUBLISHED_INVOCATION_REASON_CODES = [
  "api_key_invalid",
  "api_key_required",
  "auth_mode_unsupported",
  "binding_inactive",
  "compiled_blueprint_missing",
  "protocol_mismatch",
  "rate_limit_exceeded",
  "rejected_other",
  "run_status_unsupported",
  "runtime_failed",
  "streaming_unsupported",
  "sync_waiting_unsupported",
  "target_version_missing",
  "unknown",
  "workflow_missing"
] as const;

export const PUBLISHED_INVOCATION_REQUEST_SURFACES = [
  "native.workflow",
  "native.workflow.async",
  "native.alias",
  "native.alias.async",
  "native.path",
  "native.path.async",
  "openai.chat.completions",
  "openai.chat.completions.async",
  "openai.responses",
  "openai.responses.async",
  "openai.unknown",
  "anthropic.messages",
  "anthropic.messages.async",
  "unknown"
] as const;
export const PUBLISHED_INVOCATION_CACHE_STATUSES = ["hit", "miss", "bypass"] as const;

export type PublishedInvocationReasonCode =
  (typeof PUBLISHED_INVOCATION_REASON_CODES)[number];
export type PublishedInvocationRequestSurface =
  (typeof PUBLISHED_INVOCATION_REQUEST_SURFACES)[number];
export type PublishedInvocationCacheStatus =
  (typeof PUBLISHED_INVOCATION_CACHE_STATUSES)[number];

const REASON_LABELS: Record<string, string> = {
  api_key_invalid: "Invalid API key",
  api_key_required: "Missing API key",
  auth_mode_unsupported: "Unsupported auth mode",
  binding_inactive: "Inactive binding",
  compiled_blueprint_missing: "Missing blueprint",
  protocol_mismatch: "Protocol mismatch",
  rate_limit_exceeded: "Rate limit exceeded",
  rejected_other: "Rejected (other)",
  run_status_unsupported: "Unsupported run status",
  runtime_failed: "Runtime failed",
  streaming_unsupported: "Streaming not ready",
  sync_waiting_unsupported: "Sync waiting not supported",
  target_version_missing: "Missing workflow version",
  unknown: "Unknown issue",
  workflow_missing: "Workflow missing"
};

const REQUEST_SURFACE_LABELS: Record<string, string> = {
  "native.workflow": "Native workflow route",
  "native.workflow.async": "Native workflow async route",
  "native.alias": "Native alias route",
  "native.alias.async": "Native alias async route",
  "native.path": "Native path route",
  "native.path.async": "Native path async route",
  "openai.chat.completions": "OpenAI chat.completions",
  "openai.chat.completions.async": "OpenAI chat.completions async route",
  "openai.responses": "OpenAI responses",
  "openai.responses.async": "OpenAI responses async route",
  "openai.unknown": "OpenAI unknown surface",
  "anthropic.messages": "Anthropic messages",
  "anthropic.messages.async": "Anthropic messages async route",
  unknown: "Unknown surface"
};
const CACHE_STATUS_LABELS: Record<string, string> = {
  hit: "Cache hit",
  miss: "Cache miss",
  bypass: "Cache bypass"
};

export function formatPublishedInvocationReasonLabel(
  reasonCode: string | null | undefined
) {
  if (!reasonCode) {
    return "No issue";
  }

  return REASON_LABELS[reasonCode] ?? reasonCode.replaceAll("_", " ");
}

export function formatPublishedInvocationSurfaceLabel(
  requestSurface: string | null | undefined
) {
  if (!requestSurface) {
    return "Unknown surface";
  }

  return REQUEST_SURFACE_LABELS[requestSurface] ?? requestSurface;
}

export function formatPublishedInvocationCacheStatusLabel(
  cacheStatus: string | null | undefined
) {
  if (!cacheStatus) {
    return "Unknown cache state";
  }

  return CACHE_STATUS_LABELS[cacheStatus] ?? cacheStatus;
}

export function formatRateLimitPressure(
  requests: number,
  used: number
) {
  if (requests <= 0) {
    return {
      percentage: 0,
      label: "0%"
    };
  }

  const percentage = Math.min(Math.round((used / requests) * 100), 100);
  return {
    percentage,
    label: `${percentage}%`
  };
}
