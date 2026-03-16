import { getApiBaseUrl } from "@/lib/api-base-url";
import type { WorkflowNodeRuntimePolicy } from "@/lib/workflow-runtime-policy";

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
  runtimePolicy?: WorkflowNodeRuntimePolicy;
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

export type WorkflowDefinitionPreflightResult = {
  definition: WorkflowDetail["definition"];
  next_version: string;
  issues: WorkflowDefinitionPreflightIssue[];
};

export type WorkflowDefinitionPreflightIssue = {
  category:
    | "schema"
    | "node_support"
    | "tool_reference"
    | "tool_execution"
    | "publish_version"
    | string;
  message: string;
};

export class WorkflowDefinitionPreflightError extends Error {
  readonly issues: WorkflowDefinitionPreflightIssue[];

  constructor(message: string, issues: WorkflowDefinitionPreflightIssue[] = []) {
    super(message);
    this.name = "WorkflowDefinitionPreflightError";
    this.issues = issues;
  }
}

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

export async function validateWorkflowDefinition(
  workflowId: string,
  definition: WorkflowDetail["definition"]
): Promise<WorkflowDefinitionPreflightResult> {
  type WorkflowDefinitionPreflightErrorBody = {
    detail?:
      | string
      | {
          message?: string;
          issues?: WorkflowDefinitionPreflightIssue[];
        };
  };

  type WorkflowDefinitionPreflightSuccessBody = Partial<WorkflowDefinitionPreflightResult>;

  const response = await fetch(
    `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflowId)}/validate-definition`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ definition })
    }
  );

  const body = (await response.json().catch(() => null)) as
    | WorkflowDefinitionPreflightErrorBody
    | WorkflowDefinitionPreflightSuccessBody
    | null;
  if (!response.ok) {
    const detail = (body as WorkflowDefinitionPreflightErrorBody | null)?.detail;
    if (typeof detail === "string") {
      throw new WorkflowDefinitionPreflightError(detail);
    }
    throw new WorkflowDefinitionPreflightError(
      detail?.message ?? `Validation failed with status ${response.status}.`,
      Array.isArray(detail?.issues) ? detail.issues : []
    );
  }

  const successBody = body as WorkflowDefinitionPreflightSuccessBody | null;

  return {
    definition: successBody?.definition ?? definition,
    next_version: successBody?.next_version ?? "0.1.0",
    issues: Array.isArray(successBody?.issues) ? successBody.issues : []
  };
}
