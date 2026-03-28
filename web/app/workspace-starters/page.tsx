import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceStarterLibrary } from "@/components/workspace-starter-library";
import { resolveWorkspaceStarterLibraryViewState } from "@/components/workspace-starter-library/shared";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getWorkflows } from "@/lib/get-workflows";
import { getWorkspaceStarterTemplatesWithFilters } from "@/lib/get-workspace-starters";

type WorkspaceStarterPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: "Workspace Starters | 7Flows Studio"
};

export default async function WorkspaceStarterPage({
  searchParams
}: WorkspaceStarterPageProps) {
  const workspaceContext = await getServerWorkspaceContext();
  if (!workspaceContext) {
    redirect("/login?next=/workspace-starters");
  }

  const resolvedSearchParams = (searchParams ? await searchParams : {}) satisfies Record<
    string,
    string | string[] | undefined
  >;
  const [templates, pluginRegistry, workflows] = await Promise.all([
    getWorkspaceStarterTemplatesWithFilters({
      includeArchived: true
    }),
    getPluginRegistrySnapshot(),
    getWorkflows()
  ]);

  return (
    <WorkspaceShell
      activeNav="starters"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <div className="workspace-main">
        <WorkspaceStarterLibrary
          initialTemplates={templates}
          initialViewState={resolveWorkspaceStarterLibraryViewState(resolvedSearchParams, templates)}
          initialWorkflows={workflows}
          tools={pluginRegistry.tools}
        />
      </div>
    </WorkspaceShell>
  );
}
