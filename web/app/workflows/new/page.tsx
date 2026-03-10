import type { Metadata } from "next";

import { WorkflowCreateWizard } from "@/components/workflow-create-wizard";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getWorkflows } from "@/lib/get-workflows";

export const metadata: Metadata = {
  title: "New Workflow | 7Flows Studio"
};

export default async function NewWorkflowPage() {
  const [pluginRegistry, workflows] = await Promise.all([
    getPluginRegistrySnapshot(),
    getWorkflows()
  ]);

  return (
    <WorkflowCreateWizard
      catalogToolCount={pluginRegistry.tools.length}
      workflows={workflows}
    />
  );
}
