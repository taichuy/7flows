import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflows } from "@/lib/get-workflows";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-client";

import type {
  WorkflowCreateWizardBootstrapRequest,
  WorkflowCreateWizardProps
} from "./types";

export async function loadWorkflowCreateWizardBootstrap(
  request: WorkflowCreateWizardBootstrapRequest
): Promise<WorkflowCreateWizardProps> {
  const [workflowLibrary, workflows, legacyAuthGovernanceSnapshot] = await Promise.all([
    getWorkflowLibrarySnapshot(request.libraryQuery),
    getWorkflows(),
    request.includeLegacyAuthGovernanceSnapshot
      ? getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot()
      : Promise.resolve(null)
  ]);

  return {
    catalogToolCount: workflowLibrary.tools.length,
    governanceQueryScope: request.governanceQueryScope,
    legacyAuthGovernanceSnapshot,
    workflows,
    starters: workflowLibrary.starters,
    starterSourceLanes: workflowLibrary.starterSourceLanes,
    nodeCatalog: workflowLibrary.nodes,
    tools: workflowLibrary.tools
  };
}
