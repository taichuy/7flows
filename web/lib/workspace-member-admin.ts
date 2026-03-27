import type { WorkspaceMemberItem } from "@/lib/workspace-access";

export type WorkspaceMemberCreatePayload = {
  email: string;
  display_name: string;
  password: string;
  role: string;
};

export type WorkspaceMemberCreateResult =
  | {
      status: "success";
      member: WorkspaceMemberItem;
    }
  | {
      status: "error";
      message: string;
    };

function isWorkspaceMemberItem(value: unknown): value is WorkspaceMemberItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "id" in value && "user" in value;
}

export async function submitWorkspaceMemberCreate(
  payload: WorkspaceMemberCreatePayload,
  fetchImpl: typeof fetch = fetch
): Promise<WorkspaceMemberCreateResult> {
  try {
    const response = await fetchImpl("/api/workspace/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as
      | WorkspaceMemberItem
      | { detail?: string }
      | null;

    if (!response.ok || !isWorkspaceMemberItem(body)) {
      return {
        status: "error",
        message:
          body && "detail" in body ? body.detail ?? "创建成员失败。" : "创建成员失败。"
      };
    }

    return {
      status: "success",
      member: body
    };
  } catch {
    return {
      status: "error",
      message: "创建成员失败，请确认工作空间代理接口已连接。"
    };
  }
}
