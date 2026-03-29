import Link from "next/link";

export default function Custom404Page() {
  return (
    <main className="workspace-feedback-shell">
      <section className="workspace-feedback-card">
        <p className="workspace-eyebrow">Page not found</p>
        <h1>当前页面不存在</h1>
        <p className="workspace-muted workspace-copy-wide">
          这个入口可能已经迁移，或当前账号没有对应工作台权限。请先回到 Workspace，沿登录、应用列表和编辑器主链继续操作。
        </p>
        <div className="workspace-feedback-actions">
          <Link className="workspace-primary-button" href="/workspace">
            返回工作台
          </Link>
          <Link className="workspace-ghost-button" href="/login">
            重新登录
          </Link>
        </div>
      </section>
    </main>
  );
}
