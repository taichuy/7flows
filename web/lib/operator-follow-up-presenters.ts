export type OperatorRecommendedNextStep = {
  label: string;
  detail: string;
  href: string | null;
  href_label: string | null;
};

type OperatorRecommendedNextStepCandidate = {
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

