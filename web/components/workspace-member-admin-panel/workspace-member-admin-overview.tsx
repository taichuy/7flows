import { type WorkspaceMemberAdminMessageTone } from "./shared";

type WorkspaceMemberAdminOverviewProps = {
  adminCount: number;
  canManageMembers: boolean;
  message: string | null;
  messageTone: WorkspaceMemberAdminMessageTone;
  totalMembers: number;
  workspaceBadgeLabel: string;
  workspaceName: string;
};

export function WorkspaceMemberAdminOverview({
  adminCount,
  canManageMembers,
  message,
  messageTone,
  totalMembers,
  workspaceBadgeLabel,
  workspaceName
}: WorkspaceMemberAdminOverviewProps) {
  return (
    <section
      className="workspace-panel workspace-settings-header-card workspace-settings-header-card-dify"
      data-component="workspace-member-admin-overview"
    >
      <div className="workspace-settings-header">
        <div className="workspace-settings-header-copy">
          <div aria-hidden="true" className="workspace-settings-avatar">
            {workspaceBadgeLabel}
          </div>
          <div>
            <p className="workspace-eyebrow">成员</p>
            <h2>{workspaceName}</h2>
            <p className="workspace-muted workspace-copy-wide">
              管理员先确认当前 roster，再完成角色调整或新增成员，然后回工作台继续编排。
            </p>
          </div>
        </div>

        <div className="workspace-settings-summary-row">
          <article className="workspace-settings-summary-stat">
            <span>成员数</span>
            <strong>{totalMembers}</strong>
          </article>
          <article className="workspace-settings-summary-stat">
            <span>管理员</span>
            <strong>{adminCount}</strong>
          </article>
          <div className="workspace-settings-summary-actions">
            {canManageMembers ? (
              <a className="workspace-primary-button compact" href="#workspace-member-create">
                添加成员
              </a>
            ) : null}
            <a className="workspace-ghost-button compact" href="/workspace">
              返回工作台
            </a>
          </div>
        </div>
      </div>

      {message ? (
        <p className={`workspace-inline-message workspace-inline-message-card ${messageTone}`}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
