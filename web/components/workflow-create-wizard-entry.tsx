"use client";

import dynamic from "next/dynamic";

import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";
import type { WorkflowCreateWizardProps } from "@/components/workflow-create-wizard/types";

const LazyWorkflowCreateWizard = dynamic(
  () => import("@/components/workflow-create-wizard").then((module) => module.WorkflowCreateWizard),
  {
    ssr: false,
    loading: () => (
      <AuthoringSurfaceLoadingState
        title="正在准备创建工作台"
        summary="创建向导会在最小作者壳层之后按需加载。"
        detail="首屏先保留空白创建和 starter 入口所需的数据边界，复杂预览与后续面板稍后补齐。"
      />
    )
  }
);

export function WorkflowCreateWizardEntry(props: WorkflowCreateWizardProps) {
  return <LazyWorkflowCreateWizard {...props} />;
}
