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
            <p className="workspace-eyebrow">Author access</p>
            <h1>进入 7Flows Workspace</h1>
            <p className="workspace-muted workspace-copy-wide">
              登录后先到应用工作台；管理员可继续管理成员，并把新建应用送进 xyflow Studio。
            </p>
            <div className="login-stage-inline-points" aria-label="Workspace 登录能力">
              <span className="login-stage-inline-point">本地账号</span>
              <span className="login-stage-inline-point">成员权限</span>
              <span className="login-stage-inline-point">Studio 编排</span>
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
