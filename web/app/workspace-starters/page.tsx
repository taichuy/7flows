import type { Metadata } from "next";

import { WorkspaceStarterLibrary } from "@/components/workspace-starter-library";
import { getWorkspaceStarterTemplatesWithFilters } from "@/lib/get-workspace-starters";

export const metadata: Metadata = {
  title: "Workspace Starters | 7Flows Studio"
};

export default async function WorkspaceStarterPage() {
  const templates = await getWorkspaceStarterTemplatesWithFilters({
    includeArchived: true
  });

  return <WorkspaceStarterLibrary initialTemplates={templates} />;
}
