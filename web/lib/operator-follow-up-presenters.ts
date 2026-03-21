import { buildRunDetailHref } from "@/lib/workbench-links";

export type OperatorRecommendedNextStep = {
  label: string;
  detail: string;
  href: string | null;
  href_label: string | null;
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

function normalizeFollowUpCopy(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeHref(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
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

export function formatOperatorOpenRunLinkLabel(
  runId: string,
  surfaceCopy = buildOperatorFollowUpSurfaceCopy()
) {
  const normalizedRunId = normalizeFollowUpCopy(runId);

  return normalizedRunId
    ? `${surfaceCopy.openRunLabel} ${normalizedRunId.slice(0, 8)}`
    : surfaceCopy.openRunLabel;
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
