import {
  describeWorkspaceMemberActivity,
  formatWorkspaceRole,
  type WorkspaceMemberItem,
  type WorkspaceMemberRole
} from "@/lib/workspace-access";

import { ROLE_SUMMARIES } from "./shared";

type WorkspaceMemberRosterProps = {
  availableRoles: WorkspaceMemberRole[];
  canManageMembers: boolean;
  draftRoles: Record<string, WorkspaceMemberRole>;
  members: WorkspaceMemberItem[];
  onDraftRoleChange: (memberId: string, role: WorkspaceMemberRole) => void;
  onUpdateRole: (memberId: string) => void;
};

export function WorkspaceMemberRoster({
  availableRoles,
  canManageMembers,
  draftRoles,
  members,
  onDraftRoleChange,
  onUpdateRole
}: WorkspaceMemberRosterProps) {
  return (
    <section
      className="workspace-panel member-table-panel workspace-member-list-card"
      data-component="workspace-member-roster"
    >
      <div className="member-table-head member-table-heading">
        <div>
          <strong>成员列表</strong>
          <p className="workspace-muted member-section-copy">
            先看成员，再决定是否调整角色。
          </p>
        </div>
        <div className="member-role-badges">
          {availableRoles.map((role) => (
            <span className="workspace-tag" key={role} title={ROLE_SUMMARIES[role]}>
              {formatWorkspaceRole(role)}
            </span>
          ))}
        </div>
      </div>

      <div className="member-table-list">
        <div className="member-table-grid member-table-grid-head">
          <span>成员</span>
          <span>邮箱</span>
          <span>最近活动</span>
          <span>角色</span>
          <span>操作</span>
        </div>

        {members.map((member) => {
          const isRoleDirty = (draftRoles[member.id] ?? member.role) !== member.role;

          return (
            <div className="member-table-grid" key={member.id}>
              <span className="workspace-member-identity">
                <strong>{member.user.display_name}</strong>
                <span>{member.user.status === "active" ? "已启用" : member.user.status}</span>
              </span>
              <span className="workspace-muted">{member.user.email}</span>
              <span className="workspace-muted">{describeWorkspaceMemberActivity(member)}</span>
              <span>
                {canManageMembers ? (
                  <select
                    className="workspace-select"
                    onChange={(event) =>
                      onDraftRoleChange(member.id, event.target.value as WorkspaceMemberRole)
                    }
                    value={draftRoles[member.id] ?? member.role}
                  >
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {formatWorkspaceRole(role)}
                      </option>
                    ))}
                  </select>
                ) : (
                  formatWorkspaceRole(member.role)
                )}
              </span>
              <span>
                {canManageMembers ? (
                  <button
                    className="workspace-ghost-button compact"
                    disabled={!isRoleDirty}
                    onClick={() => onUpdateRole(member.id)}
                    type="button"
                  >
                    {isRoleDirty ? "保存角色" : "已保存"}
                  </button>
                ) : (
                  <span className="workspace-muted">仅查看</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
