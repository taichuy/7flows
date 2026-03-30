"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import {
  type WorkspaceMemberItem,
  type WorkspaceMemberRole
} from "@/lib/workspace-access";
import { submitWorkspaceMemberCreate } from "@/lib/workspace-member-admin";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

import { WorkspaceMemberAdminOverview } from "./workspace-member-admin-panel/workspace-member-admin-overview";
import { WorkspaceMemberAdminSidebar } from "./workspace-member-admin-panel/workspace-member-admin-sidebar";
import { type WorkspaceMemberAdminMessageTone } from "./workspace-member-admin-panel/shared";
import { WorkspaceMemberCreateSection } from "./workspace-member-admin-panel/workspace-member-create-section";
import { WorkspaceMemberRoleGuide } from "./workspace-member-admin-panel/workspace-member-role-guide";
import { WorkspaceMemberRoster } from "./workspace-member-admin-panel/workspace-member-roster";

type WorkspaceMemberAdminPanelProps = {
  availableRoles: WorkspaceMemberRole[];
  canManageMembers: boolean;
  initialMembers: WorkspaceMemberItem[];
  workspaceName: string;
};

export function WorkspaceMemberAdminPanel({
  availableRoles,
  canManageMembers,
  initialMembers,
  workspaceName
}: WorkspaceMemberAdminPanelProps) {
  const [members, setMembers] = useState(initialMembers);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkspaceMemberAdminMessageTone>("idle");
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

  const handleCreateMember = async (event: FormEvent<HTMLFormElement>) => {
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

  const handleDraftRoleChange = (memberId: string, role: WorkspaceMemberRole) => {
    setDraftRoles((current) => ({
      ...current,
      [memberId]: role
    }));
  };

  return (
    <section className="settings-layout settings-layout-dify" data-component="workspace-member-admin-panel">
      <WorkspaceMemberAdminSidebar />
      <div className="settings-main-panel settings-main-panel-dify">
        <WorkspaceMemberAdminOverview
          adminCount={adminCount}
          canManageMembers={canManageMembers}
          message={message}
          messageTone={messageTone}
          totalMembers={totalMembers}
          workspaceBadgeLabel={workspaceBadgeLabel}
          workspaceName={workspaceName}
        />

        <div className="workspace-settings-content-grid">
          <WorkspaceMemberRoster
            availableRoles={availableRoles}
            canManageMembers={canManageMembers}
            draftRoles={draftRoles}
            members={members}
            onDraftRoleChange={handleDraftRoleChange}
            onUpdateRole={handleUpdateRole}
          />

          <div className="workspace-settings-side-stack" data-component="workspace-member-admin-side-stack">
            <WorkspaceMemberCreateSection
              canManageMembers={canManageMembers}
              isSubmitting={isSubmitting}
              manageableRoles={manageableRoles}
              onCreateMember={handleCreateMember}
            />
            <WorkspaceMemberRoleGuide roles={manageableRoles} />
          </div>
        </div>
      </div>
    </section>
  );
}
