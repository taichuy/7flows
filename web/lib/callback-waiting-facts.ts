type CallbackWaitingExplanationLike = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

export type CallbackWaitingSummaryFacts = {
  callbackWaitingExplanation?: CallbackWaitingExplanationLike | null;
  callbackWaitingLifecycle?: object | null;
  waitingReason?: string | null;
  scheduledResumeDelaySeconds?: number | null;
  scheduledResumeSource?: string | null;
  scheduledWaitingStatus?: string | null;
  scheduledResumeScheduledAt?: string | null;
  scheduledResumeDueAt?: string | null;
  scheduledResumeRequeuedAt?: string | null;
  scheduledResumeRequeueSource?: string | null;
};

function hasTrimmedText(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasCallbackWaitingSummaryFacts(
  input?: CallbackWaitingSummaryFacts | null
) {
  if (!input) {
    return false;
  }

  return Boolean(
    hasTrimmedText(input.callbackWaitingExplanation?.primary_signal) ||
      hasTrimmedText(input.callbackWaitingExplanation?.follow_up) ||
      input.callbackWaitingLifecycle ||
      hasTrimmedText(input.waitingReason) ||
      (typeof input.scheduledResumeDelaySeconds === "number" &&
        Number.isFinite(input.scheduledResumeDelaySeconds)) ||
      hasTrimmedText(input.scheduledResumeSource) ||
      hasTrimmedText(input.scheduledWaitingStatus) ||
      hasTrimmedText(input.scheduledResumeScheduledAt) ||
      hasTrimmedText(input.scheduledResumeDueAt) ||
      hasTrimmedText(input.scheduledResumeRequeuedAt) ||
      hasTrimmedText(input.scheduledResumeRequeueSource)
  );
}
