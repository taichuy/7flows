import type { RecentRunEventCheck } from "@/lib/get-system-overview";
import {
  buildOperatorTraceSliceLinkSurface,
  type OperatorFollowUpLinkSurface
} from "@/lib/operator-follow-up-presenters";

type RuntimeActivityTraceEventLike = Pick<
  RecentRunEventCheck,
  "run_id" | "node_run_id" | "event_type"
>;

type RuntimeActivityTraceLinkOptions = {
  resolveRunHref?: ((runId: string) => string | null | undefined) | null;
  currentHref?: string | null;
  hrefLabel?: string | null;
};

function trimOrNull(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
}

export function buildRuntimeActivityEventTraceLinkSurface(
  event: RuntimeActivityTraceEventLike,
  options: RuntimeActivityTraceLinkOptions = {}
): OperatorFollowUpLinkSurface | null {
  const runId = trimOrNull(event.run_id);
  if (!runId) {
    return null;
  }

  return buildOperatorTraceSliceLinkSurface({
    runId,
    runHref: options.resolveRunHref?.(runId) ?? null,
    currentHref: options.currentHref,
    nodeRunId: trimOrNull(event.node_run_id),
    eventType: trimOrNull(event.event_type),
    hrefLabel: trimOrNull(options.hrefLabel) ?? "open event trace"
  });
}

export function buildRuntimeActivityEventTypeTraceLinkSurface({
  eventType,
  recentEvents,
  ...options
}: RuntimeActivityTraceLinkOptions & {
  eventType?: string | null;
  recentEvents?: RuntimeActivityTraceEventLike[] | null;
}): OperatorFollowUpLinkSurface | null {
  const normalizedEventType = trimOrNull(eventType);
  if (!normalizedEventType) {
    return null;
  }

  const matchingEvent = recentEvents?.find(
    (event) => trimOrNull(event.event_type) === normalizedEventType && trimOrNull(event.run_id)
  );

  if (!matchingEvent) {
    return null;
  }

  return buildRuntimeActivityEventTraceLinkSurface(matchingEvent, {
    ...options,
    hrefLabel: trimOrNull(options.hrefLabel) ?? `open ${normalizedEventType} trace`
  });
}
