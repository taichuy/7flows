type AuthoringSurfaceLoadingStateProps = {
  title: string;
  summary: string;
  detail: string;
};

export function AuthoringSurfaceLoadingState({
  title,
  summary,
  detail
}: AuthoringSurfaceLoadingStateProps) {
  return (
    <section className="panel-card panel-stack-gap" data-component="authoring-surface-loading-state">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
      </div>
      <div className="panel-muted">
        <p>{detail}</p>
      </div>
      <div className="dashboard-card-grid">
        <article className="diagnostic-card panel-muted">
          <strong>首屏策略</strong>
          <p>先交付作者壳层，再按需加载编辑器与次级面板。</p>
        </article>
        <article className="diagnostic-card panel-muted">
          <strong>当前阶段</strong>
          <p>正在拆离作者热路径里的重客户端工作台与 no-store 次级数据。</p>
        </article>
      </div>
    </section>
  );
}
