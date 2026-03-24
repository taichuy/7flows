type ExecutionRuntimeFactCarrier = {
  execution_blocking_reason?: string | null;
  effective_execution_class?: string | null;
  execution_executor_ref?: string | null;
};

function trimOrNull(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasExecutionBlockingReason(value?: ExecutionRuntimeFactCarrier | null) {
  return Boolean(trimOrNull(value?.execution_blocking_reason));
}

export function getEffectiveExecutionClassFact(
  value?: ExecutionRuntimeFactCarrier | null
) {
  if (hasExecutionBlockingReason(value)) {
    return null;
  }

  return trimOrNull(value?.effective_execution_class);
}

export function getExecutionExecutorRefFact(
  value?: ExecutionRuntimeFactCarrier | null
) {
  if (hasExecutionBlockingReason(value)) {
    return null;
  }

  return trimOrNull(value?.execution_executor_ref);
}
