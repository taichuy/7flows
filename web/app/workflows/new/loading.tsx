import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";

export default function NewWorkflowLoading() {
  return (
    <div className="workspace-main workspace-workflow-create-main">
      <AuthoringSurfaceLoadingState
        title="正在进入创建应用"
        summary="先渲染最小创建壳层，starter 与治理面板随后按需补齐。"
        detail="这条 loading 边界用于避免作者路由在冷启动时整页空等。"
      />
    </div>
  );
}
