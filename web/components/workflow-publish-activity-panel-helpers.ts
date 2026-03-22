import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type {
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";
import type {
  PublishedEndpointApiKeyItem,
  PublishedEndpointInvocationDetailResponse,
  PublishedEndpointInvocationFacetItem,
  PublishedEndpointInvocationListResponse,
  WorkflowPublishedEndpointItem
} from "@/lib/get-workflow-publish";
import type {
  SensitiveAccessBlockingPayload,
  SensitiveAccessGuardedResult
} from "@/lib/sensitive-access";
import type { WorkflowPublishInvocationActiveFilter } from "@/lib/workflow-publish-governance";
import {
  PUBLISHED_RUN_STATUSES,
  buildBlockingPublishedInvocationInboxHref,
  buildPublishedInvocationActivityBlockedDetailSurfaceCopy,
  buildPublishedInvocationActivityDetailsSurfaceCopy,
  buildPublishedInvocationCanonicalFollowUpCopy,
  buildPublishedInvocationEntrySurfaceCopy,
  buildPublishedInvocationInboxHref,
  buildPublishedInvocationRecommendedNextStep,
  buildPublishedInvocationSelectedNextStepSurface,
  formatPublishedInvocationCacheStatusLabel,
  formatPublishedInvocationReasonLabel,
  formatPublishedInvocationSurfaceLabel,
  formatPublishedRunStatusLabel,
  listPublishedInvocationRunFollowUpSampleViews,
  normalizePublishedInvocationRunSnapshot,
  type PublishedInvocationSelectedNextStepSurface,
  type PublishedInvocationUnavailableDetailSurfaceCopy
} from "@/lib/published-invocation-presenters";
import { buildWorkflowPublishActivityHref } from "@/lib/workflow-publish-activity-query";

export { buildWorkflowPublishActivityHref };

export type WorkflowPublishActivityPanelProps = {
  workflowId: string;
  tools: PluginToolRegistryItem[];
  binding: WorkflowPublishedEndpointItem;
  apiKeys: PublishedEndpointApiKeyItem[];
  invocationAudit: PublishedEndpointInvocationListResponse | null;
  selectedInvocationId: string | null;
  selectedInvocationDetail: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse>;
  rateLimitWindowAudit: PublishedEndpointInvocationListResponse | null;
  activeInvocationFilter: WorkflowPublishInvocationActiveFilter | null;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

type WorkflowPublishActivityDetailLinkOptions = {
  workflowId: string;
  bindingId?: string | null;
  activeInvocationFilter?: WorkflowPublishInvocationActiveFilter | null;
};

export type WorkflowPublishActivityDetailLinks = {
  buildInvocationDetailHref: (invocationId: string) => string;
  clearInvocationDetailHref: string;
};

export type WorkflowPublishSelectedInvocationDetailSurface =
  | {
      kind: "hidden";
      nextStepSurface: null;
    }
  | {
      kind: "ok";
      detail: PublishedEndpointInvocationDetailResponse;
      nextStepSurface: PublishedInvocationSelectedNextStepSurface | null;
    }
  | {
      kind: "blocked";
      payload: SensitiveAccessBlockingPayload;
      blockedSurfaceCopy: ReturnType<typeof buildPublishedInvocationActivityBlockedDetailSurfaceCopy>;
      nextStepSurface: null;
    }
  | {
      kind: "unavailable";
      unavailableSurfaceCopy: PublishedInvocationUnavailableDetailSurfaceCopy;
      nextStepSurface: null;
    };

export const TIME_WINDOW_OPTIONS = [
  { value: "all", label: "全部时间" },
  { value: "24h", label: "最近 24 小时" },
  { value: "7d", label: "最近 7 天" },
  { value: "30d", label: "最近 30 天" }
] as const;

export function facetCount(
  facets: PublishedEndpointInvocationFacetItem[] | undefined,
  value: string
) {
  return facets?.find((item) => item.value === value)?.count ?? 0;
}

export function formatTimeWindowLabel(value: "24h" | "7d" | "30d" | "all") {
  return TIME_WINDOW_OPTIONS.find((option) => option.value === value)?.label ?? "全部时间";
}

export function buildActiveFilterChips(
  activeInvocationFilter: WorkflowPublishActivityPanelProps["activeInvocationFilter"],
  apiKeys: PublishedEndpointApiKeyItem[]
) {
  if (!activeInvocationFilter) {
    return [];
  }

  const chips: string[] = [];
  if (activeInvocationFilter.status) {
    chips.push(`status ${activeInvocationFilter.status}`);
  }
  if (activeInvocationFilter.requestSource) {
    chips.push(`source ${activeInvocationFilter.requestSource}`);
  }
  if (activeInvocationFilter.requestSurface) {
    chips.push(formatPublishedInvocationSurfaceLabel(activeInvocationFilter.requestSurface));
  }
  if (activeInvocationFilter.cacheStatus) {
    chips.push(formatPublishedInvocationCacheStatusLabel(activeInvocationFilter.cacheStatus));
  }
  if (activeInvocationFilter.runStatus) {
    chips.push(formatPublishedRunStatusLabel(activeInvocationFilter.runStatus));
  }
  if (activeInvocationFilter.reasonCode) {
    chips.push(formatPublishedInvocationReasonLabel(activeInvocationFilter.reasonCode));
  }
  if (activeInvocationFilter.apiKeyId) {
    const apiKey = apiKeys.find((item) => item.id === activeInvocationFilter.apiKeyId);
    chips.push(`key ${apiKey?.name ?? apiKey?.key_prefix ?? activeInvocationFilter.apiKeyId}`);
  }
  if (activeInvocationFilter.timeWindow !== "all") {
    chips.push(formatTimeWindowLabel(activeInvocationFilter.timeWindow));
  }
  return chips;
}

export function buildRunStatusOptions(
  runStatusCounts: PublishedEndpointInvocationFacetItem[] | undefined
) {
  const dynamicValues = new Set((runStatusCounts ?? []).map((item) => item.value).filter(Boolean));
  for (const value of PUBLISHED_RUN_STATUSES) {
    dynamicValues.add(value);
  }
  return Array.from(dynamicValues);
}

export function resolveWorkflowPublishActivityDetailLinks({
  workflowId,
  bindingId,
  activeInvocationFilter
}: WorkflowPublishActivityDetailLinkOptions): WorkflowPublishActivityDetailLinks {
  return {
    buildInvocationDetailHref: (invocationId) =>
      buildWorkflowPublishActivityHref({
        workflowId,
        bindingId,
        activeInvocationFilter,
        invocationId
      }),
    clearInvocationDetailHref: buildWorkflowPublishActivityHref({
      workflowId,
      bindingId,
      activeInvocationFilter
    })
  };
}

export function resolveWorkflowPublishSelectedInvocationDetailSurface({
  selectedInvocationId,
  selectedInvocationDetail,
  callbackWaitingAutomation,
  sandboxReadiness
}: {
  selectedInvocationId: string | null;
  selectedInvocationDetail: SensitiveAccessGuardedResult<PublishedEndpointInvocationDetailResponse> | null;
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
}): WorkflowPublishSelectedInvocationDetailSurface {
  const detailsSurfaceCopy = buildPublishedInvocationActivityDetailsSurfaceCopy();

  if (!selectedInvocationId) {
    return {
      kind: "hidden",
      nextStepSurface: null
    };
  }

  if (selectedInvocationDetail?.kind === "ok") {
    const detail = selectedInvocationDetail.data;
    const entrySurfaceCopy = buildPublishedInvocationEntrySurfaceCopy();
    const samples = listPublishedInvocationRunFollowUpSampleViews(detail.run_follow_up ?? null);
    const runId = detail.run?.id ?? detail.invocation.run_id ?? null;
    const recommendedNextStepSample =
      samples.find((sample) => sample.run_id === runId) ?? samples[0] ?? null;
    const sharedCallbackWaitingExplanations = samples
      .filter((sample) => sample.has_callback_waiting_summary)
      .map((sample) => sample.run_snapshot.callbackWaitingExplanation);
    const canonicalFollowUp = buildPublishedInvocationCanonicalFollowUpCopy({
      explanation: detail.run_follow_up?.explanation ?? null,
      sharedCallbackWaitingExplanations,
      fallbackHeadline: entrySurfaceCopy.canonicalFollowUpFallbackHeadline
    });
    const nextStep = buildPublishedInvocationRecommendedNextStep({
      runId,
      canonicalFollowUp,
      canonicalRecommendedAction: detail.run_follow_up?.recommended_action ?? null,
      callbackWaitingActive: Boolean(detail.invocation.run_waiting_lifecycle),
      callbackWaitingFollowUp: detail.callback_waiting_explanation?.follow_up ?? null,
      callbackWaitingAutomation,
      executionFocusFollowUp: detail.execution_focus_explanation?.follow_up ?? null,
      executionSnapshot:
        recommendedNextStepSample?.run_snapshot ??
        normalizePublishedInvocationRunSnapshot(detail.run_snapshot ?? detail.invocation.run_snapshot ?? null),
      sandboxReadiness,
      blockingInboxHref: buildBlockingPublishedInvocationInboxHref({
        runId,
        blockingNodeRunId: detail.blocking_node_run_id,
        blockingSensitiveAccessEntries: detail.blocking_sensitive_access_entries
      }),
      approvalInboxHref: buildPublishedInvocationInboxHref({
        invocation: detail.invocation,
        callbackTickets: detail.callback_tickets,
        sensitiveAccessEntries: detail.sensitive_access_entries
      })
    });

    return {
      kind: "ok",
      detail,
      nextStepSurface: nextStep
        ? buildPublishedInvocationSelectedNextStepSurface({
            invocationId: selectedInvocationId,
            nextStep,
            surfaceCopy: detailsSurfaceCopy
          })
        : null
    };
  }

  if (selectedInvocationDetail?.kind === "blocked") {
    return {
      kind: "blocked",
      payload: selectedInvocationDetail.payload,
      blockedSurfaceCopy: buildPublishedInvocationActivityBlockedDetailSurfaceCopy(
        selectedInvocationDetail.payload
      ),
      nextStepSurface: null
    };
  }

  return {
    kind: "unavailable",
    unavailableSurfaceCopy: detailsSurfaceCopy.unavailableDetail,
    nextStepSurface: null
  };
}
