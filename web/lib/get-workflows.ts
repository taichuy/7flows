import { getApiBaseUrl } from "@/lib/api-base-url";

export type WorkflowListItem = {
  id: string;
  name: string;
  version: string;
  status: string;
};

export type WorkflowNodeItem = {
  id: string;
  type: string;
  name: string;
  config?: Record<string, unknown>;
  runtimePolicy?: Record<string, unknown>;
  inputSchema?: Record<string, unknown> | null;
  outputSchema?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type WorkflowEdgeItem = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  channel?: string;
  condition?: string | null;
  conditionExpression?: string | null;
  mapping?: Array<Record<string, unknown>> | null;
  [key: string]: unknown;
};

export type WorkflowDetail = WorkflowListItem & {
  definition: {
    nodes?: WorkflowNodeItem[];
    edges?: WorkflowEdgeItem[];
    variables?: Array<Record<string, unknown>>;
    publish?: Array<Record<string, unknown>>;
  };
  created_at: string;
  updated_at: string;
  versions: Array<{
    id: string;
    workflow_id: string;
    version: string;
    created_at: string;
  }>;
};

export async function getWorkflows(): Promise<WorkflowListItem[]> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/workflows`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as WorkflowListItem[];
  } catch {
    return [];
  }
}

export async function getWorkflowDetail(
  workflowId: string | null | undefined
): Promise<WorkflowDetail | null> {
  const normalizedWorkflowId = workflowId?.trim();
  if (!normalizedWorkflowId) {
    return null;
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(normalizedWorkflowId)}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as WorkflowDetail;
  } catch {
    return null;
  }
}
