import { AuthoringSurfaceLoadingState } from "@/components/authoring-surface-loading-state";

export default function WorkflowPublishRouteLoading() {
  return (
    <section className="workflow-studio-surface workflow-studio-surface-governance" data-surface="publish-loading">
      <AuthoringSurfaceLoadingState
        title="正在进入 publish governance"
        summary="先交付 workflow 壳层，再按需装载 publish activity、binding 与治理事实。"
        detail="publish invocation、cache inventory 与 API key 审计只在 publish surface 首屏读取。"
      />
    </section>
  );
}
