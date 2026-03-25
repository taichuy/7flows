import {
  buildRunDiagnosticsExecutionTimelineHref,
  RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID
} from "@/lib/run-diagnostics-links";
import { buildRunDetailHref } from "@/lib/workbench-links";

export type OperatorRecommendedNextStep = {
  label: string;
  detail: string;
  href: string | null;
  href_label: string | null;
  primaryResourceSummary?: string | null;
};

export type OperatorFollowUpLinkSurface = {
  href: string;
  label: string;
};

export type OperatorFollowUpSurfaceCopy = {
  operatorFollowUpTitle: string;
  canonicalOperatorFollowUpTitle: string;
  operatorFollowUpLabel: string;
  callbackFollowUpLabel: string;
  executionFocusTitle: string;
  recommendedNextStepTitle: string;
  openInboxSliceLabel: string;
  runTitlePrefix: string;
  openRunLabel: string;
  runStatusLabel: string;
  currentNodeLabel: string;
  focusNodeLabel: string;
  waitingReasonLabel: string;
  unavailableValueLabel: string;
  focusedSkillTraceTitle: string;
  injectedReferencesTitle: string;
  executionTimelineLinkLabel: string;
  focusedTraceSliceLinkLabel: string;
};

export type OperatorRunSnapshotMetaRow = {
  key: string;
  label: string;
  value: string;
};

export type OperatorRecommendedNextStepCandidate = {
  active?: boolean;
  label: string;
  detail?: string | null;
  href?: string | null;
  href_label?: string | null;
  fallback_detail: string;
  primaryResourceSummary?: string | null;
};

export type OperatorRecommendedActionLike = {
  kind?: string | null;
  entry_key?: string | null;
  entryKey?: string | null;
  href?: string | null;
  label?: string | null;
};

function normalizeFollowUpCopy(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeHref(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeRelativeHref(href?: string | null) {
  const normalized = href?.trim();
  if (!normalized) {
    return null;
  }

  const url = new URL(normalized, "https://sevenflows.local");
  const sortedParams = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });
  const params = new URLSearchParams();
  for (const [key, value] of sortedParams) {
    params.append(key, value);
  }

  const query = params.toString();
  const hash = url.hash?.trim() || "";
  const baseHref = query ? `${url.pathname}?${query}` : url.pathname;

  return hash ? `${baseHref}${hash}` : baseHref;
}

function appendSectionHash(href: string, sectionId: string) {
  const url = new URL(href, "https://sevenflows.local");
  const query = url.searchParams.toString();
  const baseHref = query ? `${url.pathname}?${query}` : url.pathname;

  return `${baseHref}#${sectionId}`;
}

function isSelfHref(href?: string | null, currentHref?: string | null) {
  const normalizedHref = normalizeRelativeHref(href);
  const normalizedCurrentHref = normalizeRelativeHref(currentHref);

  return Boolean(normalizedHref && normalizedCurrentHref && normalizedHref === normalizedCurrentHref);
}

function stripCandidateLink(
  candidate: OperatorRecommendedNextStepCandidate
): OperatorRecommendedNextStepCandidate {
  return {
    ...candidate,
    href: null,
    href_label: null
  };
}

function sanitizeCandidateForCurrentHref(
  candidate: OperatorRecommendedNextStepCandidate | null | undefined,
  currentHref?: string | null
) {
  if (!candidate?.href || !isSelfHref(candidate.href, currentHref)) {
    return candidate ?? null;
  }

  return stripCandidateLink(candidate);
}

function isCallbackLikeOperatorRecommendedAction(
  action?: OperatorRecommendedActionLike | null
) {
  const entryKey = normalizeFollowUpCopy(action?.entry_key)?.toLowerCase();
  const kind = normalizeFollowUpCopy(action?.kind)?.toLowerCase();

  return (
    entryKey === "operatorinbox" ||
    kind === "approval blocker" ||
    kind === "callback waiting" ||
    kind === "approval follow-up"
  );
}

export function buildOperatorFollowUpSurfaceCopy(): OperatorFollowUpSurfaceCopy {
  return {
    operatorFollowUpTitle: "Operator follow-up",
    canonicalOperatorFollowUpTitle: "Canonical operator follow-up",
    operatorFollowUpLabel: "operator follow-up",
    callbackFollowUpLabel: "callback waiting follow-up",
    executionFocusTitle: "Execution focus",
    recommendedNextStepTitle: "Recommended next step",
    openInboxSliceLabel: "open inbox slice",
    runTitlePrefix: "Run",
    openRunLabel: "open run",
    runStatusLabel: "Run status",
    currentNodeLabel: "Current node",
    focusNodeLabel: "Focus node",
    waitingReasonLabel: "Waiting reason",
    unavailableValueLabel: "n/a",
    focusedSkillTraceTitle: "Focused skill trace",
    injectedReferencesTitle: "Injected references",
    executionTimelineLinkLabel: "jump to execution timeline",
    focusedTraceSliceLinkLabel: "jump to focused trace slice"
  };
}

export function buildOperatorRunSnapshotMetaRows({
  runStatus,
  currentNodeId,
  focusNodeLabel,
  waitingReason,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runStatus?: string | null;
  currentNodeId?: string | null;
  focusNodeLabel?: string | null;
  waitingReason?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRunSnapshotMetaRow[] {
  if (!runStatus && !currentNodeId && !focusNodeLabel && !waitingReason) {
    return [];
  }

  return [
    {
      key: "run_status",
      label: surfaceCopy.runStatusLabel,
      value: runStatus ?? surfaceCopy.unavailableValueLabel
    },
    {
      key: "current_node",
      label: surfaceCopy.currentNodeLabel,
      value: currentNodeId ?? surfaceCopy.unavailableValueLabel
    },
    {
      key: "focus_node",
      label: surfaceCopy.focusNodeLabel,
      value: focusNodeLabel ?? surfaceCopy.unavailableValueLabel
    },
    {
      key: "waiting_reason",
      label: surfaceCopy.waitingReasonLabel,
      value: waitingReason ?? surfaceCopy.unavailableValueLabel
    }
  ];
}

export function buildOperatorRunDetailCandidate({
  active,
  runId,
  runHref,
  label = "run detail",
  detail,
  fallbackDetail,
  primaryResourceSummary,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  active?: boolean;
  runId?: string | null;
  runHref?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
  primaryResourceSummary?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate {
  const normalizedRunId = normalizeFollowUpCopy(runId);

  return {
    active: active ?? Boolean(normalizedRunId || detail),
    label,
    detail,
    href:
      normalizeHref(runHref) ?? (normalizedRunId ? buildRunDetailHref(normalizedRunId) : null),
    href_label:
      normalizedRunId || normalizeHref(runHref)
        ? hrefLabel?.trim() || surfaceCopy.openRunLabel
        : null,
    fallback_detail: fallbackDetail,
    primaryResourceSummary
  };
}

export function buildOperatorInboxSliceCandidate({
  active,
  href,
  label = "approval blocker",
  detail,
  fallbackDetail,
  primaryResourceSummary,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  active?: boolean;
  href?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
  primaryResourceSummary?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate {
  const normalizedHref = normalizeHref(href);

  return {
    active: active ?? Boolean(normalizedHref || detail),
    label,
    detail,
    href: normalizedHref,
    href_label: normalizedHref ? hrefLabel?.trim() || surfaceCopy.openInboxSliceLabel : null,
    fallback_detail: fallbackDetail,
    primaryResourceSummary
  };
}

export function buildOperatorNavigationCandidate({
  active,
  href,
  runId,
  runHref,
  label,
  detail,
  fallbackDetail,
  primaryResourceSummary,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  active?: boolean;
  href?: string | null;
  runId?: string | null;
  runHref?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
  primaryResourceSummary?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate {
  const normalizedHref = normalizeHref(href);

  return normalizedHref
    ? buildOperatorInboxSliceCandidate({
        active,
        href: normalizedHref,
        label,
        detail,
        fallbackDetail,
        primaryResourceSummary,
        hrefLabel,
        surfaceCopy
      })
    : buildOperatorRunDetailCandidate({
        active,
        runId,
        runHref,
        label,
        detail,
        fallbackDetail,
        primaryResourceSummary,
        hrefLabel,
        surfaceCopy
      });
}

export function buildSharedOrLocalOperatorCandidate({
  sharedCandidate,
  active,
  currentHref,
  href,
  runId,
  runHref,
  label,
  detail,
  fallbackDetail,
  primaryResourceSummary,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  sharedCandidate?: OperatorRecommendedNextStepCandidate | null;
  active?: boolean;
  currentHref?: string | null;
  href?: string | null;
  runId?: string | null;
  runHref?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
  primaryResourceSummary?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate {
  const localCandidate = buildOperatorNavigationCandidate({
    active,
    href,
    runId,
    runHref,
    label,
    detail,
    fallbackDetail,
    primaryResourceSummary,
    hrefLabel,
    surfaceCopy
  });
  const sharedSelfHref = Boolean(sharedCandidate?.href && isSelfHref(sharedCandidate.href, currentHref));
  const localSelfHref = Boolean(localCandidate.href && isSelfHref(localCandidate.href, currentHref));
  const sharedCandidateWithPrimaryResourceSummary =
    sharedCandidate &&
    !normalizeFollowUpCopy(sharedCandidate.primaryResourceSummary) &&
    normalizeFollowUpCopy(localCandidate.primaryResourceSummary)
      ? {
          ...sharedCandidate,
          primaryResourceSummary: localCandidate.primaryResourceSummary
        }
      : sharedCandidate;

  if (sharedCandidateWithPrimaryResourceSummary && !sharedSelfHref) {
    return sharedCandidateWithPrimaryResourceSummary;
  }

  if (localSelfHref) {
    return stripCandidateLink(localCandidate);
  }

  if (sharedCandidateWithPrimaryResourceSummary && sharedSelfHref && !localCandidate.active) {
    return stripCandidateLink(sharedCandidateWithPrimaryResourceSummary);
  }

  return localCandidate;
}

export function buildOperatorRecommendedActionCandidate({
  action,
  detail,
  fallbackDetail,
  active,
  primaryResourceSummary,
  scope = "any",
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  action?: OperatorRecommendedActionLike | null;
  detail?: string | null;
  fallbackDetail: string;
  active?: boolean;
  primaryResourceSummary?: string | null;
  scope?: "callback" | "execution" | "any";
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate | null {
  const kind = normalizeFollowUpCopy(action?.kind);
  const entryKey = normalizeFollowUpCopy(action?.entry_key ?? action?.entryKey);
  const href = normalizeHref(action?.href);
  const hrefLabel = normalizeFollowUpCopy(action?.label);
  const callbackLike = isCallbackLikeOperatorRecommendedAction(action);

  if (!kind && !entryKey && !href && !hrefLabel) {
    return null;
  }

  if (scope === "callback" && !callbackLike) {
    return null;
  }

  if (scope === "execution" && callbackLike) {
    return null;
  }

  return buildOperatorNavigationCandidate({
    active: active ?? true,
    href,
    label: kind ?? (callbackLike ? "approval blocker" : "run detail"),
    detail,
    fallbackDetail,
    primaryResourceSummary,
    hrefLabel,
    surfaceCopy
  });
}

export function formatOperatorOpenRunLinkLabel(
  runId: string,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
) {
  const normalizedRunId = normalizeFollowUpCopy(runId);

  return normalizedRunId
    ? `${surfaceCopy.openRunLabel} ${normalizedRunId.slice(0, 8)}`
    : surfaceCopy.openRunLabel;
}

function resolveLinkSurface(
  candidate: OperatorRecommendedNextStepCandidate,
  fallbackLabel: string
): OperatorFollowUpLinkSurface | null {
  const href = normalizeHref(candidate.href);

  if (!href) {
    return null;
  }

  return {
    href,
    label: normalizeFollowUpCopy(candidate.href_label) ?? fallbackLabel
  };
}

export function buildOperatorRunDetailLinkSurface({
  runId,
  runHref,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runId?: string | null;
  runHref?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface | null {
  return resolveLinkSurface(
    buildOperatorRunDetailCandidate({
      active: true,
      runId,
      runHref,
      fallbackDetail: surfaceCopy.openRunLabel,
      hrefLabel,
      surfaceCopy
    }),
    hrefLabel?.trim() || surfaceCopy.openRunLabel
  );
}

export function buildRequiredOperatorRunDetailLinkSurface({
  runId,
  runHref,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runId: string;
  runHref?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface {
  const linkSurface = buildOperatorRunDetailLinkSurface({
    runId,
    runHref,
    hrefLabel,
    surfaceCopy
  });

  if (!linkSurface) {
    throw new Error("Cannot build run detail link surface without a run id.");
  }

  return linkSurface;
}

export function buildOperatorExecutionTimelineLinkSurface({
  runId,
  runHref,
  currentHref,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runId?: string | null;
  runHref?: string | null;
  currentHref?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface | null {
  const normalizedHrefLabel =
    normalizeFollowUpCopy(hrefLabel) ?? surfaceCopy.executionTimelineLinkLabel;
  const normalizedRunHref = normalizeHref(runHref);
  const normalizedRunId = normalizeFollowUpCopy(runId);
  const href = normalizedRunHref
    ? appendSectionHash(normalizedRunHref, RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID)
    : normalizedRunId
      ? buildRunDiagnosticsExecutionTimelineHref(normalizedRunId)
      : null;

  if (!href || isSelfHref(href, currentHref)) {
    return null;
  }

  return {
    href,
    label: normalizedHrefLabel
  };
}

export function buildOperatorTraceSliceLinkSurface({
  runId,
  runHref,
  currentHref,
  nodeRunId,
  eventType,
  payloadKey,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runId?: string | null;
  runHref?: string | null;
  currentHref?: string | null;
  nodeRunId?: string | null;
  eventType?: string | null;
  payloadKey?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface | null {
  const normalizedNodeRunId = normalizeFollowUpCopy(nodeRunId);
  const normalizedEventType = normalizeFollowUpCopy(eventType);
  const normalizedPayloadKey = normalizeFollowUpCopy(payloadKey);
  const hasTraceFilters = Boolean(
    normalizedNodeRunId || normalizedEventType || normalizedPayloadKey
  );

  if (!hasTraceFilters) {
    return buildOperatorExecutionTimelineLinkSurface({
      runId,
      runHref,
      currentHref,
      hrefLabel,
      surfaceCopy
    });
  }

  const normalizedHrefLabel =
    normalizeFollowUpCopy(hrefLabel) ?? surfaceCopy.focusedTraceSliceLinkLabel;
  const normalizedRunHref = normalizeHref(runHref);
  const normalizedRunId = normalizeFollowUpCopy(runId);
  const href = normalizedRunId
    ? buildRunDiagnosticsExecutionTimelineHref(normalizedRunId, {
        baseHref: normalizedRunHref,
        traceQuery: {
          ...(normalizedNodeRunId ? { node_run_id: normalizedNodeRunId } : {}),
          ...(normalizedEventType ? { event_type: normalizedEventType } : {}),
          ...(normalizedPayloadKey ? { payload_key: normalizedPayloadKey } : {})
        }
      })
    : null;

  if (!href || isSelfHref(href, currentHref)) {
    return null;
  }

  return {
    href,
    label: normalizedHrefLabel
  };
}

export function buildOperatorInboxSliceLinkSurface({
  href,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  href?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface | null {
  return resolveLinkSurface(
    buildOperatorInboxSliceCandidate({
      active: true,
      href,
      fallbackDetail: surfaceCopy.openInboxSliceLabel,
      hrefLabel,
      surfaceCopy
    }),
    hrefLabel?.trim() || surfaceCopy.openInboxSliceLabel
  );
}

function resolveCandidate(
  candidate: OperatorRecommendedNextStepCandidate | null | undefined,
  operatorFollowUp?: string | null
): OperatorRecommendedNextStep | null {
  if (!candidate?.active) {
    return null;
  }

  const primaryResourceSummary = normalizeFollowUpCopy(candidate.primaryResourceSummary);

  return {
    label: candidate.label,
    detail:
      normalizeFollowUpCopy(candidate.detail) ??
      normalizeFollowUpCopy(operatorFollowUp) ??
      candidate.fallback_detail,
    href: candidate.href?.trim() || null,
    href_label: candidate.href?.trim() ? candidate.href_label?.trim() || null : null,
    ...(primaryResourceSummary ? { primaryResourceSummary } : {})
  };
}

export function buildOperatorRecommendedNextStep({
  callback,
  execution,
  currentHref,
  operatorFollowUp,
  operatorLabel = "operator follow-up"
}: {
  callback?: OperatorRecommendedNextStepCandidate | null;
  execution?: OperatorRecommendedNextStepCandidate | null;
  currentHref?: string | null;
  operatorFollowUp?: string | null;
  operatorLabel?: string;
}): OperatorRecommendedNextStep | null {
  const sanitizedCallback = sanitizeCandidateForCurrentHref(callback, currentHref);
  const sanitizedExecution = sanitizeCandidateForCurrentHref(execution, currentHref);

  return (
    resolveCandidate(sanitizedCallback, operatorFollowUp) ??
    resolveCandidate(sanitizedExecution, operatorFollowUp) ??
    (normalizeFollowUpCopy(operatorFollowUp)
      ? {
          label: operatorLabel,
          detail: normalizeFollowUpCopy(operatorFollowUp)!,
          href: null,
          href_label: null
        }
      : null)
  );
}
