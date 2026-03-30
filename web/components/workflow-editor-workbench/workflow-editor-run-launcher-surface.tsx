"use client";

import { useTransition } from "react";
import dynamic from "next/dynamic";

import { triggerWorkflowRun } from "@/app/actions/runs";

import type { WorkflowEditorRunLauncherSurfaceProps } from "@/components/workflow-editor-workbench/types";

const LazyWorkflowRunLauncher = dynamic(
  () => import("@/components/workflow-run-launcher").then((module) => module.WorkflowRunLauncher),
  {
    ssr: false,
    loading: () => null
  }
);

export function WorkflowEditorRunLauncherSurface({
  workflowId,
  open,
  workflowVariables,
  onClose,
  onRunSuccess,
  onRunError
}: WorkflowEditorRunLauncherSurfaceProps) {
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return null;
  }

  return (
    <LazyWorkflowRunLauncher
      open={open}
      workflowVariables={workflowVariables}
      isSubmitting={isPending}
      onClose={onClose}
      onRun={(payload) => {
        startTransition(async () => {
          const result = await triggerWorkflowRun(workflowId, payload);

          if (result.status === "success") {
            onRunSuccess({ runId: result.runId });
            return;
          }

          onRunError(result.message);
        });
      }}
    />
  );
}
