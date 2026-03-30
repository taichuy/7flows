import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";

export default function WorkflowEditorLoading() {
  return (
    <section className="workflow-studio-surface" data-surface="editor-loading">
      <AuthoringSurfaceLoadingState
        title="正在进入 workflow studio"
        summary="先交付基础 workflow 壳层，编辑器岛与次级面板按需加载。"
        detail="recent runs、credentials 等 no-store 数据已退出首屏阻塞链路。"
      />
    </section>
  );
}
