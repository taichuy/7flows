import { formatTimestamp } from "@/lib/runtime-presenters";

export const SESSION_COOKIE_NAME = "sevenflows_session";

export type WorkspaceMemberRole = "owner" | "admin" | "editor" | "viewer";

export type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
};

export type UserAccountItem = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  last_login_at?: string | null;
};

export type WorkspaceMemberItem = {
  id: string;
  role: WorkspaceMemberRole;
  user: UserAccountItem;
  invited_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthSessionResponse = {
  token: string;
  workspace: WorkspaceItem;
  current_user: UserAccountItem;
  current_member: WorkspaceMemberItem;
  available_roles: WorkspaceMemberRole[];
  expires_at: string;
};

export type WorkspaceContextResponse = {
  workspace: WorkspaceItem;
  current_user: UserAccountItem;
  current_member: WorkspaceMemberItem;
  available_roles: WorkspaceMemberRole[];
  can_manage_members: boolean;
};

export function formatWorkspaceRole(role: WorkspaceMemberRole) {
  switch (role) {
    case "owner":
      return "所有者";
    case "admin":
      return "管理员";
    case "editor":
      return "编辑者";
    case "viewer":
      return "观察者";
    default:
      return role;
  }
}

export function canManageWorkspaceMembers(role: WorkspaceMemberRole) {
  return role === "owner" || role === "admin";
}

export function describeWorkspaceMemberActivity(member: WorkspaceMemberItem) {
  if (!member.user.last_login_at) {
    return "尚未登录";
  }

  return `最近登录 ${formatTimestamp(member.user.last_login_at)}`;
}

export function readSessionCookieFromDocument() {
  if (typeof document === "undefined") {
    return null;
  }

  const targetPrefix = `${SESSION_COOKIE_NAME}=`;
  const rawCookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(targetPrefix));

  if (!rawCookie) {
    return null;
  }

  return decodeURIComponent(rawCookie.slice(targetPrefix.length));
}
