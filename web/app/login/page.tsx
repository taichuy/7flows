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
            <h1>像 Dify 一样先进工作空间，再进入 7Flows 的 xyflow 编排</h1>
            <p className="workspace-muted workspace-copy-wide">
              当前这层只负责本地管理员登录、成员账号进入和应用工作台入口。
              交互借鉴 Dify 的 workspace 心智，但编排、调试、发布和追溯仍然回到
              7Flows 自己的 xyflow + workflow detail 主链，不复制 Dify 的内部执行模型。
            </p>
            <div className="login-stage-pills">
              <span className="login-stage-pill">默认管理员已落库</span>
              <span className="login-stage-pill">成员权限可直接配置</span>
              <span className="login-stage-pill">新建应用直达 ChatFlow</span>
            </div>
            <div className="login-feature-grid" aria-label="Workspace 登录能力">
              <article className="login-feature-item">
                <strong>管理员账号</strong>
                <p className="workspace-muted">
                  默认管理员已经可用，首次进入就能完成成员开通与权限配置。
                </p>
              </article>
              <article className="login-feature-item">
                <strong>应用工作台</strong>
                <p className="workspace-muted">
                  登录后进入更接近 Dify 的应用工作台，再从空白或 starter 创建 ChatFlow。
                </p>
              </article>
              <article className="login-feature-item">
                <strong>xyflow 事实源</strong>
                <p className="workspace-muted">
                  工作台只负责入口与协作，真正编排仍然进入 xyflow 编辑器继续推进。
                </p>
              </article>
            </div>
          </div>

          <section className="login-card">
            <div className="login-copy">
              <p className="workspace-eyebrow">Workspace sign in</p>
              <h2>登录 7Flows Workspace</h2>
              <p className="workspace-muted">
                使用管理员或成员账号登录；管理员可在工作空间内继续新增成员并配置角色。
              </p>
            </div>
            <WorkspaceLoginForm />
          </section>
        </div>
      </section>
    </main>
  );
}
