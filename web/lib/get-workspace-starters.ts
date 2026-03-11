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
