"use client";

import { AuthoringBootstrapEntry } from "@/components/authoring-bootstrap-entry";
import { AuthoringBootstrapEntryLoadingState } from "@/components/authoring-bootstrap-entry-loading-state";
import { loadWorkflowEditorWorkbenchBootstrap } from "@/components/workflow-editor-workbench/bootstrap";
import { WorkflowEditorWorkbench } from "@/components/workflow-editor-workbench";
import type {
  WorkflowEditorWorkbenchBootstrapData,
  WorkflowEditorWorkbenchEntryProps
} from "@/components/workflow-editor-workbench/types";
import { buildWorkflowEditorBootstrapLoadingSurfaceCopy } from "@/lib/workbench-entry-surfaces";

function WorkflowEditorWorkbenchBootstrapLoadingState() {
  return (
    <AuthoringBootstrapEntryLoadingState
      surfaceCopy={buildWorkflowEditorBootstrapLoadingSurfaceCopy()}
    />
  );
}

export function WorkflowEditorWorkbenchEntry({
  bootstrapRequest,
  initialBootstrapData = null,
  ...workbenchShellProps
}: WorkflowEditorWorkbenchEntryProps) {
  return (
    <AuthoringBootstrapEntry
      bootstrapRequest={bootstrapRequest}
      loadBootstrap={loadWorkflowEditorWorkbenchBootstrap}
      initialBootstrapData={initialBootstrapData}
      loadingState={<WorkflowEditorWorkbenchBootstrapLoadingState />}
    >
      {(bootstrapData: WorkflowEditorWorkbenchBootstrapData) => (
        <WorkflowEditorWorkbench {...workbenchShellProps} {...bootstrapData} />
      )}
    </AuthoringBootstrapEntry>
  );
}
