import type { Metadata } from "next";

import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getWorkspaceStarterTemplates } from "@/lib/get-workspace-starters";
import { getWorkflows } from "@/lib/get-workflows";

export const metadata: Metadata = {
  title: "New Workflow | 7Flows Studio"
};

type NewWorkflowPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewWorkflowPage({ searchParams }: NewWorkflowPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const [pluginRegistry, workflows, workspaceTemplates] = await Promise.all([
    getPluginRegistrySnapshot(),
    getWorkflows(),
    getWorkspaceStarterTemplates()
  ]);

  return (
    <WorkflowCreateWizard
      catalogToolCount={pluginRegistry.tools.length}
      preferredStarterId={readQueryValue(resolvedSearchParams.starter)}
      workflows={workflows}
      workspaceTemplates={workspaceTemplates}
    />
  );
}

function readQueryValue(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) ? value[0] : undefined;
}
