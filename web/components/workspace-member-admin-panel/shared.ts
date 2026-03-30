import type { WorkspaceMemberRole } from "@/lib/workspace-access";

export type WorkspaceMemberAdminMessageTone = "idle" | "success" | "error";

export const ROLE_SUMMARIES: Record<WorkspaceMemberRole, string> = {
  owner: "负责工作空间边界与最高权限。",
  admin: "管理成员、模板和工作台入口。",
  editor: "维护应用与编排。",
  viewer: "只读查看工作台与运行状态。"
};
