import type { RunExecutionFocusReason } from "@/lib/get-run-views";

export function formatMetricSummary(metrics: Record<string, number>) {
  return Object.entries(metrics)
    .map(([key, count]) => `${key} ${count}`)
    .join(" · ");
}

export function formatExecutionFocusReasonLabel(
  reason: RunExecutionFocusReason | null | undefined
) {
  switch (reason) {
    case "blocking_node_run":
      return "blocking node run";
    case "blocked_execution":
      return "blocked execution";
    case "current_node":
      return "current node";
    case "fallback_node":
      return "execution fallback";
    default:
      return "execution focus";
  }
}
