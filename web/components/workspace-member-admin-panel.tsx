"use client";

import { useMemo, useState } from "react";

import {
  describeWorkspaceMemberActivity,
  formatWorkspaceRole,
  type WorkspaceMemberItem,
  type WorkspaceMemberRole
} from "@/lib/workspace-access";
import { submitWorkspaceMemberCreate } from "@/lib/workspace-member-admin";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

type WorkspaceMemberAdminPanelProps = {
  availableRoles: WorkspaceMemberRole[];
  canManageMembers: boolean;
  initialMembers: WorkspaceMemberItem[];
  workspaceName: string;
};

const ROLE_SUMMARIES: Record<WorkspaceMemberRole, string> = {
  owner: "负责工作空间边界与最高权限。",
  admin: "管理成员、模板和工作台入口。",
  editor: "维护应用与编排。",
  viewer: "只读查看工作台与运行状态。"
};

export function WorkspaceMemberAdminPanel({
  availableRoles,
  canManageMembers,
  initialMembers,
  workspaceName
}: WorkspaceMemberAdminPanelProps) {
  const [members, setMembers] = useState(initialMembers);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftRoles, setDraftRoles] = useState<Record<string, WorkspaceMemberRole>>(() =>
    Object.fromEntries(initialMembers.map((member) => [member.id, member.role]))
  );

  const totalMembers = useMemo(() => members.length, [members]);
  const adminCount = useMemo(
    () => members.filter((member) => member.role === "owner" || member.role === "admin").length,
    [members]
  );
  const manageableRoles = useMemo(
    () => availableRoles.filter((role) => role !== "owner"),
    [availableRoles]
  );
  const workspaceBadgeLabel = getWorkspaceBadgeLabel(workspaceName);

  const handleCreateMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManageMembers || isSubmitting) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      email: String(formData.get("email") ?? "").trim(),
      display_name: String(formData.get("display_name") ?? "").trim(),
      password: String(formData.get("password") ?? "").trim(),
      role: String(formData.get("role") ?? "viewer").trim()
    };

    setIsSubmitting(true);
    setMessage("正在创建成员...");
    setMessageTone("idle");

    const result = await submitWorkspaceMemberCreate(payload);
    if (result.status === "error") {
      setMessage(result.message);
      setMessageTone("error");
      setIsSubmitting(false);
      return;
    }

    setMembers((current) => [...current, result.member]);
    setDraftRoles((current) => ({ ...current, [result.member.id]: result.member.role }));
    setMessage(`已添加成员 ${result.member.user.display_name}。`);
    setMessageTone("success");
    form.reset();
    setIsSubmitting(false);
  };

  const handleUpdateRole = async (memberId: string) => {
    const role = draftRoles[memberId];
    const currentMember = members.find((member) => member.id === memberId);
    if (!currentMember || currentMember.role === role) {
      return;
    }

    setMessage("正在更新权限...");
    setMessageTone("idle");

    try {
      const response = await fetch(`/api/workspace/members/${encodeURIComponent(memberId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ role })
      });
      const body = (await response.json().catch(() => null)) as
        | WorkspaceMemberItem
        | { detail?: string }
        | null;

      if (!response.ok || !body || !("id" in body)) {
        setMessage(body && "detail" in body ? body.detail ?? "权限更新失败。" : "权限更新失败。");
        setMessageTone("error");
        return;
      }

      setMembers((current) =>
        current.map((member) => (member.id === body.id ? body : member))
      );
      setDraftRoles((current) => ({ ...current, [body.id]: body.role }));
      setMessage(`已更新 ${body.user.display_name} 的角色。`);
      setMessageTone("success");
    } catch {
      setMessage("权限更新失败，请稍后重试。");
      setMessageTone("error");
    }
  };

  return (
    <section className="settings-layout settings-layout-dify">
      <aside className="settings-sidebar-panel settings-sidebar-panel-dify">
        <p className="workspace-eyebrow">Team</p>
        <h1>成员与角色</h1>
        <p className="workspace-muted workspace-copy-wide">
          只处理成员开通、角色调整和返回工作台前的最后一步。
        </p>
        <nav className="settings-nav" aria-label="Settings">
          <span className="settings-nav-group">工作台设置</span>
          <span className="settings-nav-item active">成员管理</span>
        </nav>
        <div className="settings-sidebar-focus-list" aria-label="成员管理重点">
          <span className="settings-sidebar-focus-item">开通账号</span>
          <span className="settings-sidebar-focus-item">调整角色</span>
          <span className="settings-sidebar-focus-item">回到工作台</span>
        </div>
      </aside>

      <div className="settings-main-panel settings-main-panel-dify">
        <section className="workspace-panel workspace-settings-header-card workspace-settings-header-card-dify">
          <div className="workspace-settings-header">
            <div className="workspace-settings-header-copy">
              <div aria-hidden="true" className="workspace-settings-avatar">
                {workspaceBadgeLabel}
              </div>
              <div>
                <p className="workspace-eyebrow">成员</p>
                <h2>{workspaceName}</h2>
                <p className="workspace-muted workspace-copy-wide">
                  在这里新增成员、调整角色，然后回工作台继续创建和编排应用。
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
              {canManageMembers ? (
                <a className="workspace-primary-button compact" href="#workspace-member-create">
                  添加成员
                </a>
              ) : null}
            </div>
          </div>
        </section>

        {message ? (
          <p className={`workspace-inline-message ${messageTone}`}>{message}</p>
        ) : null}

        <div className="workspace-settings-content-grid">
          <div className="workspace-panel member-table-panel workspace-member-list-card">
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
                            setDraftRoles((current) => ({
                              ...current,
                              [member.id]: event.target.value as WorkspaceMemberRole
                            }))
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
                          onClick={() => handleUpdateRole(member.id)}
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
          </div>

          <div className="workspace-panel member-form-panel workspace-member-create-card" id="workspace-member-create">
            <div className="member-table-head member-table-heading">
              <div>
                <strong>新增成员</strong>
                <p className="workspace-muted member-section-copy">
                  邮箱、初始密码和角色三项即可完成本地开通。
                </p>
              </div>
            </div>

            {canManageMembers ? (
              <div className="member-form-layout member-form-layout-stacked">
                <form className="member-create-form" onSubmit={handleCreateMember}>
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

                <div className="member-role-summary member-create-note-compact">
                  {manageableRoles.map((role) => (
                    <article className="member-role-summary-item" key={role}>
                      <strong>{formatWorkspaceRole(role)}</strong>
                      <span className="workspace-muted">{ROLE_SUMMARIES[role]}</span>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="workspace-muted">当前账号只有查看权限，无法新增成员。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
