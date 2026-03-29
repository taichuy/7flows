import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceLoginForm } from "@/components/workspace-login-form";
import { getServerAuthSession } from "@/lib/server-workspace-access";

export default async function LoginPage() {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/workspace");
  }

  return (
    <main className="login-shell login-shell-dify">
      <section className="login-stage login-stage-dify login-stage-workspace">
        <header className="login-stage-header">
          <Link className="login-brand" href="/">
            <span className="workspace-brand-mark">7</span>
            <span>Flows</span>
          </Link>
          <div className="login-stage-header-actions">
            <span className="login-stage-chip">Local-first</span>
            <span className="login-stage-chip subtle">Workspace</span>
          </div>
        </header>

        <div className="login-stage-body login-stage-body-compact login-stage-body-dify">
          <div className="login-stage-copy login-stage-copy-compact">
            <p className="workspace-eyebrow">Local access</p>
            <h1>进入 7Flows Workspace</h1>
            <p className="workspace-muted workspace-copy-wide">
              先登录，再进入应用工作台；管理员随后可继续管理成员，并把新建应用送进 xyflow Studio。
            </p>
            <div className="login-stage-fact-list" aria-label="Workspace 登录能力">
              <article className="login-stage-fact-card">
                <strong>本地账号入口</strong>
                <p className="workspace-muted">直接使用管理员或现有成员账号进入工作台，不需要再翻文档找入口。</p>
              </article>
              <article className="login-stage-fact-card">
                <strong>登录后先看工作台</strong>
                <p className="workspace-muted">应用目录、新建应用和最近入口保持在同一条作者主链里。</p>
              </article>
              <article className="login-stage-fact-card">
                <strong>管理员继续收口团队</strong>
                <p className="workspace-muted">进入后可去成员管理页新增成员，并按角色控制访问边界。</p>
              </article>
            </div>
          </div>

          <section className="login-card login-card-dify">
            <div className="login-copy">
              <p className="workspace-eyebrow">Sign in</p>
              <h2>登录工作台</h2>
              <p className="workspace-muted">管理员和成员共用同一入口。</p>
            </div>
            <WorkspaceLoginForm />
          </section>
        </div>
      </section>
    </main>
  );
}
