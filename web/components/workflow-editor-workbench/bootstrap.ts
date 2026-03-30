import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflows } from "@/lib/get-workflows";

import type {
  WorkflowEditorWorkbenchBootstrapData,
  WorkflowEditorWorkbenchBootstrapRequest
} from "./types";

export async function loadWorkflowEditorWorkbenchBootstrap(
  _request: WorkflowEditorWorkbenchBootstrapRequest
): Promise<WorkflowEditorWorkbenchBootstrapData> {
  const [workflows, workflowLibrary, pluginRegistry, systemOverview] = await Promise.all([
    getWorkflows(),
    getWorkflowLibrarySnapshot(),
    getPluginRegistrySnapshot(),
    getSystemOverview()
  ]);

  return {
    workflows,
    nodeCatalog: workflowLibrary.nodes,
    nodeSourceLanes: workflowLibrary.nodeSourceLanes,
    toolSourceLanes: workflowLibrary.toolSourceLanes,
    tools: workflowLibrary.tools,
    adapters: pluginRegistry.adapters,
    callbackWaitingAutomation: systemOverview.callback_waiting_automation,
    sandboxReadiness: systemOverview.sandbox_readiness,
    sandboxBackends: systemOverview.sandbox_backends
  };
}
