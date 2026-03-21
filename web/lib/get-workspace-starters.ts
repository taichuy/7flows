import { getApiBaseUrl } from "@/lib/api-base-url";
import type {
  WorkflowDefinitionPreflightIssue,
  WorkflowDetail
} from "@/lib/get-workflows";
import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";

export type WorkspaceStarterTemplateItem = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  business_track: "应用新建编排" | "编排节点能力" | "Dify 插件兼容" | "API 调用开放";
  default_workflow_name: string;
  workflow_focus: string;
  recommended_next_step: string;
  tags: string[];
  definition: WorkflowDetail["definition"];
  created_from_workflow_id?: string | null;
  created_from_workflow_version?: string | null;
  archived: boolean;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  source_governance?: WorkspaceStarterSourceGovernance | null;
};

export type WorkspaceStarterHistoryItem = {
  id: string;
  template_id: string;
  workspace_id: string;
  action: "created" | "updated" | "archived" | "restored" | "refreshed" | "rebased";
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type WorkspaceStarterSourceDiffEntry = {
  id: string;
  label: string;
  status: "added" | "removed" | "changed";
  changed_fields: string[];
  template_facts: string[];
  source_facts: string[];
};

export type WorkspaceStarterSourceDiffSummary = {
  template_count: number;
  source_count: number;
  added_count: number;
  removed_count: number;
  changed_count: number;
};

export type WorkspaceStarterSourceActionDecisionPayload = {
  recommended_action: "refresh" | "rebase" | "none";
  status_label: string;
  summary: string;
  can_refresh: boolean;
  can_rebase: boolean;
  fact_chips: string[];
};

export type WorkspaceStarterSourceGovernanceKind =
  | "no_source"
  | "missing_source"
  | "synced"
  | "drifted";

export type WorkspaceStarterSourceGovernance = {
  kind: WorkspaceStarterSourceGovernanceKind;
  status_label: string;
  summary: string;
  source_workflow_id?: string | null;
  source_workflow_name?: string | null;
  template_version?: string | null;
  source_version?: string | null;
  action_decision?: WorkspaceStarterSourceActionDecisionPayload | null;
  outcome_explanation?: SignalFollowUpExplanation | null;
};

export type WorkspaceStarterSourceGovernanceCounts = {
  no_source: number;
  missing_source: number;
  synced: number;
  drifted: number;
};

export type WorkspaceStarterSourceGovernanceScopeSummary = {
  workspace_id: string;
  total_count: number;
  attention_count: number;
  counts: WorkspaceStarterSourceGovernanceCounts;
  chips: string[];
  summary: string;
  follow_up_template_ids: string[];
};

export type WorkspaceStarterSourceDiff = {
  template_id: string;
  workspace_id: string;
  source_workflow_id: string;
  source_workflow_name: string;
  template_version?: string | null;
  source_version: string;
  template_default_workflow_name: string;
  source_default_workflow_name: string;
  workflow_name_changed: boolean;
  changed: boolean;
  rebase_fields: string[];
  node_summary: WorkspaceStarterSourceDiffSummary;
  edge_summary: WorkspaceStarterSourceDiffSummary;
  sandbox_dependency_summary: WorkspaceStarterSourceDiffSummary;
  node_entries: WorkspaceStarterSourceDiffEntry[];
  edge_entries: WorkspaceStarterSourceDiffEntry[];
  sandbox_dependency_entries: WorkspaceStarterSourceDiffEntry[];
  action_decision: WorkspaceStarterSourceActionDecisionPayload;
};

export type WorkspaceStarterBulkAction =
  | "archive"
  | "restore"
  | "refresh"
  | "rebase"
  | "delete";

export type WorkspaceStarterBulkPreviewReason =
  | "not_found"
  | "already_archived"
  | "not_archived"
  | "no_source_workflow"
  | "source_workflow_missing"
  | "source_workflow_invalid"
  | "delete_requires_archive"
  | "already_aligned"
  | "name_drift_only";

export type WorkspaceStarterBulkPreviewCandidateItem = {
  template_id: string;
  name?: string | null;
  archived: boolean;
  source_workflow_id?: string | null;
  source_workflow_version?: string | null;
  action_decision?: WorkspaceStarterSourceActionDecisionPayload | null;
  sandbox_dependency_changes?: WorkspaceStarterSourceDiffSummary | null;
  sandbox_dependency_nodes: string[];
};

export type WorkspaceStarterBulkPreviewBlockedItem = {
  template_id: string;
  name?: string | null;
  archived: boolean;
  reason: WorkspaceStarterBulkPreviewReason;
  detail: string;
  source_workflow_id?: string | null;
  source_workflow_version?: string | null;
  action_decision?: WorkspaceStarterSourceActionDecisionPayload | null;
  sandbox_dependency_changes?: WorkspaceStarterSourceDiffSummary | null;
  sandbox_dependency_nodes: string[];
};

export type WorkspaceStarterBulkPreviewReasonSummary = {
  reason: WorkspaceStarterBulkPreviewReason;
  count: number;
  detail: string;
};

export type WorkspaceStarterBulkActionPreview = {
  action: WorkspaceStarterBulkAction;
  candidate_count: number;
  blocked_count: number;
  candidate_items: WorkspaceStarterBulkPreviewCandidateItem[];
  blocked_items: WorkspaceStarterBulkPreviewBlockedItem[];
  blocked_reason_summary: WorkspaceStarterBulkPreviewReasonSummary[];
};

export type WorkspaceStarterBulkPreviewSet = {
  archive: WorkspaceStarterBulkActionPreview;
  restore: WorkspaceStarterBulkActionPreview;
  refresh: WorkspaceStarterBulkActionPreview;
  rebase: WorkspaceStarterBulkActionPreview;
  delete: WorkspaceStarterBulkActionPreview;
};

export type WorkspaceStarterBulkPreview = {
  workspace_id: string;
  requested_count: number;
  previews: WorkspaceStarterBulkPreviewSet;
};

export type WorkspaceStarterBulkSkippedItem = {
  template_id: string;
  name?: string | null;
  archived: boolean;
  reason:
    | "not_found"
    | "already_archived"
    | "not_archived"
    | "no_source_workflow"
    | "source_workflow_missing"
    | "source_workflow_invalid"
    | "delete_requires_archive"
    | "already_aligned"
    | "name_drift_only";
  detail: string;
  source_workflow_id?: string | null;
  source_workflow_version?: string | null;
  action_decision?: WorkspaceStarterSourceActionDecisionPayload | null;
  sandbox_dependency_changes?: WorkspaceStarterSourceDiffSummary | null;
  sandbox_dependency_nodes: string[];
};

export type WorkspaceStarterBulkReceiptItem = {
  template_id: string;
  name?: string | null;
  outcome: "updated" | "deleted" | "skipped";
  archived: boolean;
  reason?: WorkspaceStarterBulkSkippedItem["reason"] | null;
  detail?: string | null;
  source_workflow_id?: string | null;
  source_workflow_version?: string | null;
  action_decision?: WorkspaceStarterSourceActionDecisionPayload | null;
  sandbox_dependency_changes?: WorkspaceStarterSourceDiffSummary | null;
  sandbox_dependency_nodes: string[];
  changed?: boolean | null;
  rebase_fields: string[];
};

export type WorkspaceStarterBulkSkippedSummary = {
  reason: WorkspaceStarterBulkSkippedItem["reason"];
  count: number;
  detail: string;
};

export type WorkspaceStarterBulkDeletedItem = {
  template_id: string;
  name?: string | null;
};

export type WorkspaceStarterBulkSandboxDependencyItem = {
  template_id: string;
  name?: string | null;
  source_workflow_id?: string | null;
  source_workflow_version?: string | null;
  sandbox_dependency_changes: WorkspaceStarterSourceDiffSummary;
  sandbox_dependency_nodes: string[];
};

export type SignalFollowUpExplanation = {
  primary_signal?: string | null;
  follow_up?: string | null;
};

export type WorkspaceStarterBulkActionResult = {
  workspace_id: string;
  action: WorkspaceStarterBulkAction;
  requested_count: number;
  updated_count: number;
  skipped_count: number;
  updated_items: WorkspaceStarterTemplateItem[];
  deleted_items: WorkspaceStarterBulkDeletedItem[];
  skipped_items: WorkspaceStarterBulkSkippedItem[];
  skipped_reason_summary: WorkspaceStarterBulkSkippedSummary[];
  sandbox_dependency_changes?: WorkspaceStarterSourceDiffSummary | null;
  sandbox_dependency_items: WorkspaceStarterBulkSandboxDependencyItem[];
  receipt_items: WorkspaceStarterBulkReceiptItem[];
  outcome_explanation?: SignalFollowUpExplanation | null;
  follow_up_template_ids: string[];
};

export type WorkspaceStarterValidationIssue = WorkflowDefinitionPreflightIssue;

export class WorkspaceStarterValidationError extends Error {
  readonly issues: WorkspaceStarterValidationIssue[];

  constructor(message: string, issues: WorkspaceStarterValidationIssue[] = []) {
    super(message);
    this.name = "WorkspaceStarterValidationError";
    this.issues = issues;
  }
}

type WorkspaceStarterValidationErrorBody = {
  detail?:
    | string
    | {
        message?: string;
        issues?: WorkspaceStarterValidationIssue[];
      };
};

function parseWorkspaceStarterValidationError(
  body: WorkspaceStarterValidationErrorBody | null,
  fallbackMessage: string
): WorkspaceStarterValidationError {
  const detail = body?.detail;
  if (typeof detail === "string") {
    return new WorkspaceStarterValidationError(detail);
  }

  return new WorkspaceStarterValidationError(
    detail?.message ?? fallbackMessage,
    Array.isArray(detail?.issues) ? detail.issues : []
  );
}

export async function createWorkspaceStarterTemplate(payload: Record<string, unknown>) {
  const response = await fetch(`${getApiBaseUrl()}/api/workspace-starters`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as
    | WorkspaceStarterTemplateItem
    | WorkspaceStarterValidationErrorBody
    | null;

  if (!response.ok || !body || !("id" in body)) {
    throw parseWorkspaceStarterValidationError(
      body as WorkspaceStarterValidationErrorBody | null,
      `保存模板失败，API 返回 ${response.status}。`
    );
  }

  return body;
}

export async function updateWorkspaceStarterTemplate(
  templateId: string,
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(templateId)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );
  const body = (await response.json().catch(() => null)) as
    | WorkspaceStarterTemplateItem
    | WorkspaceStarterValidationErrorBody
    | null;

  if (!response.ok || !body || !("id" in body)) {
    throw parseWorkspaceStarterValidationError(
      body as WorkspaceStarterValidationErrorBody | null,
      `更新模板失败，API 返回 ${response.status}。`
    );
  }

  return body;
}

export async function getWorkspaceStarterTemplates(): Promise<
  WorkspaceStarterTemplateItem[]
> {
  return getWorkspaceStarterTemplatesWithFilters();
}

export async function getWorkspaceStarterTemplatesWithFilters({
  workspaceId = "default",
  businessTrack,
  search,
  includeArchived = false,
  archivedOnly = false,
  sourceGovernanceKind,
  needsFollowUp = false
}: {
  workspaceId?: string;
  businessTrack?: WorkflowBusinessTrack;
  search?: string;
  includeArchived?: boolean;
  archivedOnly?: boolean;
  sourceGovernanceKind?: WorkspaceStarterSourceGovernanceKind;
  needsFollowUp?: boolean;
} = {}): Promise<WorkspaceStarterTemplateItem[]> {
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  if (businessTrack) {
    params.set("business_track", businessTrack);
  }
  if (search?.trim()) {
    params.set("search", search.trim());
  }
  if (includeArchived) {
    params.set("include_archived", "true");
  }
  if (archivedOnly) {
    params.set("archived_only", "true");
  }
  if (sourceGovernanceKind) {
    params.set("source_governance_kind", sourceGovernanceKind);
  }
  if (needsFollowUp) {
    params.set("needs_follow_up", "true");
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workspace-starters?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as WorkspaceStarterTemplateItem[];
  } catch {
    return [];
  }
}

export async function getWorkspaceStarterSourceGovernanceScopeSummary({
  workspaceId = "default",
  businessTrack,
  search,
  includeArchived = false,
  archivedOnly = false,
  sourceGovernanceKind,
  needsFollowUp = false
}: {
  workspaceId?: string;
  businessTrack?: WorkflowBusinessTrack;
  search?: string;
  includeArchived?: boolean;
  archivedOnly?: boolean;
  sourceGovernanceKind?: WorkspaceStarterSourceGovernanceKind;
  needsFollowUp?: boolean;
} = {}): Promise<WorkspaceStarterSourceGovernanceScopeSummary | null> {
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  if (businessTrack) {
    params.set("business_track", businessTrack);
  }
  if (search?.trim()) {
    params.set("search", search.trim());
  }
  if (includeArchived) {
    params.set("include_archived", "true");
  }
  if (archivedOnly) {
    params.set("archived_only", "true");
  }
  if (sourceGovernanceKind) {
    params.set("source_governance_kind", sourceGovernanceKind);
  }
  if (needsFollowUp) {
    params.set("needs_follow_up", "true");
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workspace-starters/governance-summary?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as WorkspaceStarterSourceGovernanceScopeSummary;
  } catch {
    return null;
  }
}

export async function getWorkspaceStarterHistory(
  templateId: string,
  {
    workspaceId = "default",
    limit = 20
  }: {
    workspaceId?: string;
    limit?: number;
  } = {}
): Promise<WorkspaceStarterHistoryItem[]> {
  const normalizedTemplateId = templateId.trim();
  if (!normalizedTemplateId) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  params.set("limit", String(limit));

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(
        normalizedTemplateId
      )}/history?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as WorkspaceStarterHistoryItem[];
  } catch {
    return [];
  }
}

export async function getWorkspaceStarterSourceDiff(
  templateId: string,
  {
    workspaceId = "default"
  }: {
    workspaceId?: string;
  } = {}
): Promise<WorkspaceStarterSourceDiff | null> {
  const normalizedTemplateId = templateId.trim();
  if (!normalizedTemplateId) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(
        normalizedTemplateId
      )}/source-diff?${params.toString()}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as WorkspaceStarterSourceDiff;
  } catch {
    return null;
  }
}

export async function bulkUpdateWorkspaceStarters({
  workspaceId = "default",
  action,
  templateIds
}: {
  workspaceId?: string;
  action: WorkspaceStarterBulkAction;
  templateIds: string[];
}): Promise<WorkspaceStarterBulkActionResult> {
  const normalizedTemplateIds = Array.from(
    new Set(templateIds.map((templateId) => templateId.trim()).filter(Boolean))
  );
  if (normalizedTemplateIds.length === 0) {
    return {
      workspace_id: workspaceId,
      action,
      requested_count: 0,
      updated_count: 0,
      skipped_count: 0,
      updated_items: [],
      deleted_items: [],
      skipped_items: [],
      skipped_reason_summary: [],
      sandbox_dependency_changes: null,
      sandbox_dependency_items: [],
      receipt_items: [],
      outcome_explanation: null,
      follow_up_template_ids: []
    };
  }

  const response = await fetch(`${getApiBaseUrl()}/api/workspace-starters/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      action,
      template_ids: normalizedTemplateIds
    })
  });
  const body = (await response.json().catch(() => null)) as
    | WorkspaceStarterBulkActionResult
    | { detail?: string }
    | null;

  if (!response.ok || !body || !("updated_items" in body)) {
    throw new Error(body && "detail" in body ? body.detail ?? "批量操作失败。" : "批量操作失败。");
  }

  return body;
}

export async function previewWorkspaceStarterBulkActions({
  workspaceId = "default",
  templateIds
}: {
  workspaceId?: string;
  templateIds: string[];
}): Promise<WorkspaceStarterBulkPreview> {
  const normalizedTemplateIds = Array.from(
    new Set(templateIds.map((templateId) => templateId.trim()).filter(Boolean))
  );
  if (normalizedTemplateIds.length === 0) {
    return createEmptyWorkspaceStarterBulkPreview(workspaceId);
  }

  const response = await fetch(`${getApiBaseUrl()}/api/workspace-starters/bulk/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      template_ids: normalizedTemplateIds
    })
  });
  const body = (await response.json().catch(() => null)) as
    | WorkspaceStarterBulkPreview
    | { detail?: string }
    | null;

  if (!response.ok || !body || !("previews" in body)) {
    throw new Error(body && "detail" in body ? body.detail ?? "批量预检失败。" : "批量预检失败。");
  }

  return body;
}

function createEmptyWorkspaceStarterBulkPreview(
  workspaceId: string
): WorkspaceStarterBulkPreview {
  return {
    workspace_id: workspaceId,
    requested_count: 0,
    previews: {
      archive: createEmptyWorkspaceStarterBulkActionPreview("archive"),
      restore: createEmptyWorkspaceStarterBulkActionPreview("restore"),
      refresh: createEmptyWorkspaceStarterBulkActionPreview("refresh"),
      rebase: createEmptyWorkspaceStarterBulkActionPreview("rebase"),
      delete: createEmptyWorkspaceStarterBulkActionPreview("delete")
    }
  };
}

function createEmptyWorkspaceStarterBulkActionPreview(
  action: WorkspaceStarterBulkAction
): WorkspaceStarterBulkActionPreview {
  return {
    action,
    candidate_count: 0,
    blocked_count: 0,
    candidate_items: [],
    blocked_items: [],
    blocked_reason_summary: []
  };
}
