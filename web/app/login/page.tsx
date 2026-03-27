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
      <section className="login-stage login-stage-dify">
        <header className="login-stage-header">
          <Link className="login-brand" href="/">
            <span className="workspace-brand-mark">7</span>
            <span>Flows</span>
          </Link>
          <div className="login-stage-header-actions">
            <span className="login-stage-chip">Local-first</span>
            <span className="login-stage-chip subtle">xyflow orchestration</span>
          </div>
        </header>

        <div className="login-stage-body login-stage-body-compact">
          <div className="login-stage-copy login-stage-copy-compact">
            <p className="workspace-eyebrow">Workspace access</p>
            <h1>先进入 7Flows Workspace，再回到 xyflow 继续编排</h1>
            <p className="workspace-muted workspace-copy-wide">
              借鉴 Dify 的 workspace 登录与应用工作台心智，但真正的编排、运行诊断、发布治理与追溯仍然回到
              7Flows 自己的 xyflow 主链，不复制 Dify 的内部执行模型。
            </p>
            <div className="login-stage-notes" aria-label="Workspace 登录能力">
              <article className="login-stage-note">
                <strong>默认管理员已落库</strong>
                <p className="workspace-muted">首次进入即可完成成员开通、角色配置与工作台初始化。</p>
              </article>
              <article className="login-stage-note">
                <strong>应用工作台优先</strong>
                <p className="workspace-muted">先像 Dify 一样在工作台管理应用入口，再进入 7Flows 的编排主链。</p>
              </article>
              <article className="login-stage-note">
                <strong>xyflow 是事实源</strong>
                <p className="workspace-muted">工作台只负责入口与协作，不分叉执行语义、运行事实与发布口径。</p>
              </article>
            </div>
          </div>

          <section className="login-card login-card-dify">
            <div className="login-copy">
              <p className="workspace-eyebrow">Workspace sign in</p>
              <h2>登录 7Flows Workspace</h2>
              <p className="workspace-muted">
                使用管理员或成员账号登录；管理员可在工作空间内继续新增成员、配置角色并新建应用。
              </p>
            </div>
            <WorkspaceLoginForm />
          </section>
        </div>
      </section>
    </main>
  );
}
