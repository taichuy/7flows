import { formatWorkspaceRole, type WorkspaceMemberRole } from "@/lib/workspace-access";

import { ROLE_SUMMARIES } from "./shared";

type WorkspaceMemberRoleGuideProps = {
  roles: WorkspaceMemberRole[];
};

export function WorkspaceMemberRoleGuide({ roles }: WorkspaceMemberRoleGuideProps) {
  return (
    <section
      className="workspace-panel workspace-member-role-guide-card"
      data-component="workspace-member-role-guide"
    >
      <div className="member-table-head member-table-heading">
        <div>
          <strong>角色说明</strong>
          <p className="workspace-muted member-section-copy">
            先确认职责，再决定成员默认角色，避免把权限判断留到工作台里处理。
          </p>
        </div>
      </div>

      <div className="workspace-member-role-guide-list">
        {roles.map((role) => (
          <article className="workspace-member-role-guide-item" key={role}>
            <strong>{formatWorkspaceRole(role)}</strong>
            <span className="workspace-muted">{ROLE_SUMMARIES[role]}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
