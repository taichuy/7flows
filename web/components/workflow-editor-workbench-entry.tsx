"use client";

import dynamic from "next/dynamic";

import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";
import type { WorkflowEditorWorkbenchProps } from "@/components/workflow-editor-workbench/types";

const LazyWorkflowEditorWorkbench = dynamic(
  () =>
    import("@/components/workflow-editor-workbench").then(
      (module) => module.WorkflowEditorWorkbench
    ),
  {
    ssr: false,
    loading: () => (
      <AuthoringSurfaceLoadingState
        title="正在准备 xyflow Studio"
        summary="编辑器岛会在基础 workflow 壳层渲染后按需挂载。"
        detail="最近运行、凭证列表等次级 no-store 数据已退出首屏阻塞链路，加载后会在面板内继续补齐。"
      />
    )
  }
);

export function WorkflowEditorWorkbenchEntry(props: WorkflowEditorWorkbenchProps) {
  return <LazyWorkflowEditorWorkbench {...props} />;
}
