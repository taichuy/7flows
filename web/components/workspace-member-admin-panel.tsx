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
  admin: "可管理成员、Starter 与工作空间入口。",
  editor: "可维护应用与编排，但不处理成员权限。",
  viewer: "只读查看工作空间现状与运行信号。"
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
    <section className="settings-layout">
      <aside className="settings-sidebar-panel">
        <p className="workspace-eyebrow">设置</p>
        <h1>团队设置</h1>
        <p className="workspace-muted workspace-copy-wide">
          参考 Dify 的 settings / members 入口，把成员、角色和工作空间边界收口在一处；
          这里只管协作与权限，不复制应用运行事实。
        </p>
        <nav className="settings-nav" aria-label="Settings">
          <span className="settings-nav-group">工作空间</span>
          <span className="settings-nav-item">工作空间</span>
          <span className="settings-nav-item">模型供应商</span>
          <span className="settings-nav-item active">成员</span>
          <span className="settings-nav-item">数据来源</span>
          <span className="settings-nav-item">API 扩展</span>
          <span className="settings-nav-group">通用</span>
          <span className="settings-nav-item">语言</span>
        </nav>
      </aside>

      <div className="settings-main-panel">
        <section className="workspace-panel workspace-settings-header-card">
          <div className="workspace-settings-header">
            <div className="workspace-settings-header-copy">
              <div aria-hidden="true" className="workspace-settings-avatar">
                {workspaceBadgeLabel}
              </div>
              <div>
                <p className="workspace-eyebrow">成员</p>
                <h2>{workspaceName}</h2>
                <p className="workspace-muted workspace-copy-wide">
                  这里收口工作空间成员、角色与协作边界；真正的编排与运行事实仍然回到 xyflow / runs 主链。
                </p>
              </div>
            </div>

            <div className="workspace-settings-summary-row">
              <article className="workspace-settings-summary-stat">
                <span>成员</span>
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

        <div className="workspace-panel member-table-panel">
          <div className="member-table-head member-table-heading">
            <div>
              <strong>成员列表</strong>
              <p className="workspace-muted member-section-copy">
                owner / admin 可维护角色；editor / viewer 默认只读查看工作空间入口与运行信息。
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

        <div className="workspace-panel member-form-panel" id="workspace-member-create">
          <div className="member-table-head member-table-heading">
            <div>
              <strong>新增成员</strong>
              <p className="workspace-muted member-section-copy">
                默认通过邮箱 + 初始密码完成本地开通，后续再继续扩展邀请与更细粒度权限配置。
              </p>
            </div>
          </div>

          {canManageMembers ? (
            <div className="member-form-layout">
              <form className="member-create-form" onSubmit={handleCreateMember}>
                <div className="member-create-grid">
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
              <div className="member-create-note">
                {manageableRoles.map((role) => (
                  <article className="member-role-note" key={role}>
                    <strong>{formatWorkspaceRole(role)}</strong>
                    <p className="workspace-muted">{ROLE_SUMMARIES[role]}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="workspace-muted">当前账号只有查看权限，无法新增成员。</p>
          )}
        </div>
      </div>
    </section>
  );
}
