import { getApiBaseUrl } from "@/lib/api-base-url";
import type { WorkflowDetail } from "@/lib/get-workflows";
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
};

export type WorkspaceStarterSourceDiffSummary = {
  template_count: number;
  source_count: number;
  added_count: number;
  removed_count: number;
  changed_count: number;
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
  node_entries: WorkspaceStarterSourceDiffEntry[];
  edge_entries: WorkspaceStarterSourceDiffEntry[];
};

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
  archivedOnly = false
}: {
  workspaceId?: string;
  businessTrack?: WorkflowBusinessTrack;
  search?: string;
  includeArchived?: boolean;
  archivedOnly?: boolean;
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
