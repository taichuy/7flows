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
    <main className="login-shell">
      <section className="login-stage">
        <header className="login-stage-header">
          <Link className="login-brand" href="/">
            <span className="workspace-brand-mark">7</span>
            <span>Flows</span>
          </Link>
          <span className="login-stage-chip">Local-first workspace</span>
        </header>

        <div className="login-stage-body">
          <div className="login-stage-copy">
            <p className="workspace-eyebrow">7Flows Workspace</p>
            <h1>登录后进入应用工作台</h1>
            <p className="workspace-muted workspace-copy-wide">
              本轮先补齐参考 Dify 的 workspace 基座：管理员登录、成员权限、应用列表和新建入口。
              登录之后仍然进入 7Flows 自己的 xyflow 编排主链，而不是复制 Dify 的内部执行模型。
            </p>
            <div className="login-stage-pills">
              <span className="login-stage-pill">默认管理员已落库</span>
              <span className="login-stage-pill">成员权限可直接配置</span>
              <span className="login-stage-pill">新建应用直达 ChatFlow</span>
            </div>
          </div>

          <section className="login-card">
            <div className="login-copy">
              <p className="workspace-eyebrow">Workspace sign in</p>
              <h2>使用管理员或成员账号登录</h2>
              <p className="workspace-muted">
                当前默认管理员账号已经可用；后续新成员由管理员在工作空间里直接开通。
              </p>
            </div>
            <WorkspaceLoginForm />
          </section>
        </div>
      </section>
    </main>
  );
}
