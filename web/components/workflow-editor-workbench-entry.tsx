"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";
import { loadWorkflowEditorWorkbenchBootstrap } from "@/components/workflow-editor-workbench/bootstrap";
import type {
  WorkflowEditorWorkbenchBootstrapData,
  WorkflowEditorWorkbenchEntryProps
} from "@/components/workflow-editor-workbench/types";

const loadWorkflowEditorWorkbenchModule = () =>
  import("@/components/workflow-editor-workbench").then(
    (module) => module.WorkflowEditorWorkbench
  );

const LazyWorkflowEditorWorkbench = dynamic(loadWorkflowEditorWorkbenchModule,
  {
    ssr: false,
    loading: () => <WorkflowEditorWorkbenchBootstrapLoadingState />
  }
);

function WorkflowEditorWorkbenchBootstrapLoadingState() {
  return (
    <AuthoringSurfaceLoadingState
      title="正在准备 xyflow Studio"
      summary="编辑器岛会在基础 workflow 壳层渲染后按需挂载。"
      detail="workflow inventory、catalog、plugin registry 与 system overview 会在最小 workflow 壳层之后按需补齐。"
    />
  );
}

export function WorkflowEditorWorkbenchEntry({
  bootstrapRequest,
  ...workbenchShellProps
}: WorkflowEditorWorkbenchEntryProps) {
  const [bootstrapData, setBootstrapData] = useState<WorkflowEditorWorkbenchBootstrapData | null>(
    null
  );

  useEffect(() => {
    let active = true;

    void loadWorkflowEditorWorkbenchModule();
    void loadWorkflowEditorWorkbenchBootstrap(bootstrapRequest).then((nextBootstrapData) => {
      if (!active) {
        return;
      }

      setBootstrapData(nextBootstrapData);
    });

    return () => {
      active = false;
    };
  }, [bootstrapRequest]);

  if (!bootstrapData) {
    return <WorkflowEditorWorkbenchBootstrapLoadingState />;
  }

  return <LazyWorkflowEditorWorkbench {...workbenchShellProps} {...bootstrapData} />;
}
