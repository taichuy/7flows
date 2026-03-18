import { getApiBaseUrl } from "@/lib/api-base-url";
import type { WorkflowNodeRuntimePolicy } from "@/lib/workflow-runtime-policy";

export type WorkflowListItem = {
  id: string;
  name: string;
  version: string;
  status: string;
  node_count: number;
  tool_governance: WorkflowToolGovernanceSummary;
};

export type WorkflowToolGovernanceSummary = {
  referenced_tool_ids: string[];
  missing_tool_ids: string[];
  governed_tool_count: number;
  strong_isolation_tool_count: number;
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
  definition_issues?: WorkflowDefinitionPreflightIssue[];
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
    | "variables"
    | string;
  message: string;
  path?: string;
  field?: string;
};

type WorkflowValidationErrorDetail =
  | string
  | {
      message?: string;
      issues?: WorkflowDefinitionPreflightIssue[];
    };

type WorkflowValidationErrorBody = {
  detail?: WorkflowValidationErrorDetail;
};

export class WorkflowDefinitionValidationError extends Error {
  readonly issues: WorkflowDefinitionPreflightIssue[];

  constructor(message: string, issues: WorkflowDefinitionPreflightIssue[] = []) {
    super(message);
    this.name = "WorkflowDefinitionValidationError";
    this.issues = issues;
  }
}

export { WorkflowDefinitionValidationError as WorkflowDefinitionPreflightError };

export function parseWorkflowValidationError(
  body: WorkflowValidationErrorBody | null,
  fallbackMessage: string
): WorkflowDefinitionValidationError {
  const detail = body?.detail;
  if (typeof detail === "string") {
    return new WorkflowDefinitionValidationError(detail);
  }
  return new WorkflowDefinitionValidationError(
    detail?.message ?? fallbackMessage,
    Array.isArray(detail?.issues) ? detail.issues : []
  );
}

export async function createWorkflow(payload: {
  name: string;
  definition: WorkflowDetail["definition"];
}): Promise<WorkflowDetail> {
  const response = await fetch(`${getApiBaseUrl()}/api/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as
    | WorkflowValidationErrorBody
    | WorkflowDetail
    | null;

  if (!response.ok) {
    throw parseWorkflowValidationError(body as WorkflowValidationErrorBody | null, `创建失败，API 返回 ${response.status}。`);
  }

  return body as WorkflowDetail;
}

export async function updateWorkflow(
  workflowId: string,
  payload: {
    name?: string;
    definition?: WorkflowDetail["definition"];
  }
): Promise<WorkflowDetail> {
  const response = await fetch(
    `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflowId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  const body = (await response.json().catch(() => null)) as
    | WorkflowValidationErrorBody
    | WorkflowDetail
    | null;

  if (!response.ok) {
    throw parseWorkflowValidationError(body as WorkflowValidationErrorBody | null, `保存失败，API 返回 ${response.status}。`);
  }

  return body as WorkflowDetail;
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
    | WorkflowValidationErrorBody
    | WorkflowDefinitionPreflightSuccessBody
    | null;
  if (!response.ok) {
    throw parseWorkflowValidationError(
      body as WorkflowValidationErrorBody | null,
      `Validation failed with status ${response.status}.`
    );
  }

  const successBody = body as WorkflowDefinitionPreflightSuccessBody | null;

  return {
    definition: successBody?.definition ?? definition,
    next_version: successBody?.next_version ?? "0.1.0",
    issues: Array.isArray(successBody?.issues) ? successBody.issues : []
  };
}
