import type { FormEvent } from "react";

import { formatWorkspaceRole, type WorkspaceMemberRole } from "@/lib/workspace-access";

type WorkspaceMemberCreateSectionProps = {
  canManageMembers: boolean;
  isSubmitting: boolean;
  manageableRoles: WorkspaceMemberRole[];
  onCreateMember: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function WorkspaceMemberCreateSection({
  canManageMembers,
  isSubmitting,
  manageableRoles,
  onCreateMember
}: WorkspaceMemberCreateSectionProps) {
  return (
    <section
      className="workspace-panel member-form-panel workspace-member-create-card"
      data-component="workspace-member-create-section"
      id="workspace-member-create"
    >
      <div className="member-table-head member-table-heading">
        <div>
          <strong>新增成员</strong>
          <p className="workspace-muted member-section-copy">
            邮箱、初始密码和角色三项即可完成本地开通。
          </p>
        </div>
      </div>

      {canManageMembers ? (
        <form className="member-create-form" onSubmit={onCreateMember}>
          <div className="member-create-grid member-create-grid-stacked">
            <input className="workspace-input" name="display_name" placeholder="姓名" required />
            <input className="workspace-input" name="email" placeholder="邮箱" required />
            <input
              className="workspace-input"
              name="password"
              placeholder="初始密码"
              required
              type="password"
            />
            <select className="workspace-select" defaultValue="viewer" name="role">
              {manageableRoles.map((role) => (
                <option key={role} value={role}>
                  {formatWorkspaceRole(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="workspace-action-row">
            <button className="workspace-primary-button compact" disabled={isSubmitting} type="submit">
              {isSubmitting ? "提交中..." : "添加成员"}
            </button>
          </div>
        </form>
      ) : (
        <p className="workspace-muted">当前账号只有查看权限，无法新增成员。</p>
      )}
    </section>
  );
}
