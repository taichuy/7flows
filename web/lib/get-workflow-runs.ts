import { fetchConsoleApiPath } from "@/lib/console-session-client";
import type { WorkflowToolGovernanceSummary } from "@/lib/get-workflows";

export type WorkflowRunListItem = {
  id: string;
  workflow_id: string;
  workflow_version: string;
  status: string;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  node_run_count: number;
  event_count: number;
  last_event_at?: string | null;
  tool_governance?: WorkflowToolGovernanceSummary | null;
};

export async function getWorkflowRuns(
  workflowId: string | null | undefined,
  limit = 8
): Promise<WorkflowRunListItem[]> {
  const normalizedWorkflowId = workflowId?.trim();
  if (!normalizedWorkflowId) {
    return [];
  }

  const normalizedLimit = Math.min(Math.max(limit, 1), 20);

  try {
    const response = await fetchConsoleApiPath(
      `/api/workflows/${encodeURIComponent(normalizedWorkflowId)}/runs?limit=${normalizedLimit}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as WorkflowRunListItem[];
  } catch {
    return [];
  }
}
