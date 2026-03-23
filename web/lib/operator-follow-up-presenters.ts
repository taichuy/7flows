import { buildRunDetailHref } from "@/lib/workbench-links";

export type OperatorRecommendedNextStep = {
  label: string;
  detail: string;
  href: string | null;
  href_label: string | null;
};

export type OperatorFollowUpLinkSurface = {
  href: string;
  label: string;
};

export type OperatorFollowUpSurfaceCopy = {
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
    injectedReferencesTitle: "Injected references"
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
  label = "run detail",
  detail,
  fallbackDetail,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  active?: boolean;
  runId?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate {
  const normalizedRunId = normalizeFollowUpCopy(runId);

  return {
    active: active ?? Boolean(normalizedRunId || detail),
    label,
    detail,
    href: normalizedRunId ? buildRunDetailHref(normalizedRunId) : null,
    href_label: normalizedRunId ? hrefLabel?.trim() || surfaceCopy.openRunLabel : null,
    fallback_detail: fallbackDetail
  };
}

export function buildOperatorInboxSliceCandidate({
  active,
  href,
  label = "approval blocker",
  detail,
  fallbackDetail,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  active?: boolean;
  href?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
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
    fallback_detail: fallbackDetail
  };
}

export function buildOperatorNavigationCandidate({
  active,
  href,
  runId,
  label,
  detail,
  fallbackDetail,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  active?: boolean;
  href?: string | null;
  runId?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
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
        hrefLabel,
        surfaceCopy
      })
    : buildOperatorRunDetailCandidate({
        active,
        runId,
        label,
        detail,
        fallbackDetail,
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
  label,
  detail,
  fallbackDetail,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  sharedCandidate?: OperatorRecommendedNextStepCandidate | null;
  active?: boolean;
  currentHref?: string | null;
  href?: string | null;
  runId?: string | null;
  label?: string;
  detail?: string | null;
  fallbackDetail: string;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorRecommendedNextStepCandidate {
  const localCandidate = buildOperatorNavigationCandidate({
    active,
    href,
    runId,
    label,
    detail,
    fallbackDetail,
    hrefLabel,
    surfaceCopy
  });
  const sharedSelfHref = Boolean(sharedCandidate?.href && isSelfHref(sharedCandidate.href, currentHref));
  const localSelfHref = Boolean(localCandidate.href && isSelfHref(localCandidate.href, currentHref));

  if (sharedCandidate && !sharedSelfHref) {
    return sharedCandidate;
  }

  if (localSelfHref) {
    return stripCandidateLink(localCandidate);
  }

  if (sharedCandidate && sharedSelfHref && !localCandidate.active) {
    return stripCandidateLink(sharedCandidate);
  }

  return localCandidate;
}

export function buildOperatorRecommendedActionCandidate({
  action,
  detail,
  fallbackDetail,
  active,
  scope = "any",
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  action?: OperatorRecommendedActionLike | null;
  detail?: string | null;
  fallbackDetail: string;
  active?: boolean;
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
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runId?: string | null;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface | null {
  return resolveLinkSurface(
    buildOperatorRunDetailCandidate({
      active: true,
      runId,
      fallbackDetail: surfaceCopy.openRunLabel,
      hrefLabel,
      surfaceCopy
    }),
    hrefLabel?.trim() || surfaceCopy.openRunLabel
  );
}

export function buildRequiredOperatorRunDetailLinkSurface({
  runId,
  hrefLabel,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
}: {
  runId: string;
  hrefLabel?: string | null;
  surfaceCopy?: OperatorFollowUpSurfaceCopy;
}): OperatorFollowUpLinkSurface {
  const linkSurface = buildOperatorRunDetailLinkSurface({
    runId,
    hrefLabel,
    surfaceCopy
  });

  if (!linkSurface) {
    throw new Error("Cannot build run detail link surface without a run id.");
  }

  return linkSurface;
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

  return {
    label: candidate.label,
    detail:
      normalizeFollowUpCopy(candidate.detail) ??
      normalizeFollowUpCopy(operatorFollowUp) ??
      candidate.fallback_detail,
    href: candidate.href?.trim() || null,
    href_label: candidate.href?.trim() ? candidate.href_label?.trim() || null : null
  };
}

export function buildOperatorRecommendedNextStep({
  callback,
  execution,
  operatorFollowUp,
  operatorLabel = "operator follow-up"
}: {
  callback?: OperatorRecommendedNextStepCandidate | null;
  execution?: OperatorRecommendedNextStepCandidate | null;
  operatorFollowUp?: string | null;
  operatorLabel?: string;
}): OperatorRecommendedNextStep | null {
  return (
    resolveCandidate(callback, operatorFollowUp) ??
    resolveCandidate(execution, operatorFollowUp) ??
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
