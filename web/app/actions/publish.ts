"use server";

import { revalidatePath } from "next/cache";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  buildWorkflowPublishApiKeyMutationFallbackErrorMessage,
  buildWorkflowPublishApiKeyMutationNetworkErrorMessage,
  buildWorkflowPublishApiKeyMutationSuccessMessage,
  buildWorkflowPublishApiKeyMutationValidationMessage
} from "@/lib/workflow-publish-binding-presenters";
import { buildWorkflowDetailHref } from "@/lib/workbench-links";

export type UpdatePublishedEndpointLifecycleState = {
  status: "idle" | "success" | "error";
  message: string;
  workflowId: string;
  bindingId: string;
  nextStatus: "published" | "offline";
};

export type CreatePublishedEndpointApiKeyState = {
  status: "idle" | "success" | "error";
  message: string;
  workflowId: string;
  bindingId: string;
  name: string;
  secretKey: string | null;
  keyPrefix: string | null;
};

export type RevokePublishedEndpointApiKeyState = {
  status: "idle" | "success" | "error";
  message: string;
  workflowId: string;
  bindingId: string;
  keyId: string;
};

export async function updatePublishedEndpointLifecycle(
  _: UpdatePublishedEndpointLifecycleState,
  formData: FormData
): Promise<UpdatePublishedEndpointLifecycleState> {
  const workflowId = String(formData.get("workflowId") ?? "").trim();
  const bindingId = String(formData.get("bindingId") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "").trim();

  if (
    !workflowId ||
    !bindingId ||
    (nextStatus !== "published" && nextStatus !== "offline")
  ) {
    return {
      status: "error",
      message: "缺少发布 binding 信息，无法更新发布状态。",
      workflowId,
      bindingId,
      nextStatus: nextStatus === "offline" ? "offline" : "published"
    };
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/lifecycle`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: nextStatus
        }),
        cache: "no-store"
      }
    );

    const body = (await response.json().catch(() => null)) as
      | { detail?: string; endpoint_name?: string; lifecycle_status?: string }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? "更新发布状态失败。",
        workflowId,
        bindingId,
        nextStatus
      };
    }

    revalidatePath(buildWorkflowDetailHref(workflowId));
    return {
      status: "success",
      message: `${body?.endpoint_name ?? bindingId} 已切换为 ${body?.lifecycle_status ?? nextStatus}。`,
      workflowId,
      bindingId,
      nextStatus
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端更新发布状态。",
      workflowId,
      bindingId,
      nextStatus
    };
  }
}

export async function createPublishedEndpointApiKey(
  _: CreatePublishedEndpointApiKeyState,
  formData: FormData
): Promise<CreatePublishedEndpointApiKeyState> {
  const workflowId = String(formData.get("workflowId") ?? "").trim();
  const bindingId = String(formData.get("bindingId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!workflowId || !bindingId || !name) {
    return {
      status: "error",
      message: buildWorkflowPublishApiKeyMutationValidationMessage("create"),
      workflowId,
      bindingId,
      name,
      secretKey: null,
      keyPrefix: null
    };
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/api-keys`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name }),
        cache: "no-store"
      }
    );

    const body = (await response.json().catch(() => null)) as
      | { detail?: string; name?: string; key_prefix?: string; secret_key?: string }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? buildWorkflowPublishApiKeyMutationFallbackErrorMessage("create"),
        workflowId,
        bindingId,
        name,
        secretKey: null,
        keyPrefix: null
      };
    }

    revalidatePath(buildWorkflowDetailHref(workflowId));
    return {
      status: "success",
      message: buildWorkflowPublishApiKeyMutationSuccessMessage({
        action: "create",
        name: body?.name ?? name
      }),
      workflowId,
      bindingId,
      name: "",
      secretKey: body?.secret_key ?? null,
      keyPrefix: body?.key_prefix ?? null
    };
  } catch {
    return {
      status: "error",
      message: buildWorkflowPublishApiKeyMutationNetworkErrorMessage("create"),
      workflowId,
      bindingId,
      name,
      secretKey: null,
      keyPrefix: null
    };
  }
}

export async function revokePublishedEndpointApiKey(
  _: RevokePublishedEndpointApiKeyState,
  formData: FormData
): Promise<RevokePublishedEndpointApiKeyState> {
  const workflowId = String(formData.get("workflowId") ?? "").trim();
  const bindingId = String(formData.get("bindingId") ?? "").trim();
  const keyId = String(formData.get("keyId") ?? "").trim();
  const keyName = String(formData.get("keyName") ?? "").trim();

  if (!workflowId || !bindingId || !keyId) {
    return {
      status: "error",
      message: buildWorkflowPublishApiKeyMutationValidationMessage("revoke"),
      workflowId,
      bindingId,
      keyId
    };
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        workflowId
      )}/published-endpoints/${encodeURIComponent(bindingId)}/api-keys/${encodeURIComponent(
        keyId
      )}`,
      {
        method: "DELETE",
        cache: "no-store"
      }
    );

    const body = (await response.json().catch(() => null)) as
      | { detail?: string; name?: string }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? buildWorkflowPublishApiKeyMutationFallbackErrorMessage("revoke"),
        workflowId,
        bindingId,
        keyId
      };
    }

    revalidatePath(buildWorkflowDetailHref(workflowId));
    return {
      status: "success",
      message: buildWorkflowPublishApiKeyMutationSuccessMessage({
        action: "revoke",
        name: body?.name ?? keyName,
        keyId
      }),
      workflowId,
      bindingId,
      keyId
    };
  } catch {
    return {
      status: "error",
      message: buildWorkflowPublishApiKeyMutationNetworkErrorMessage("revoke"),
      workflowId,
      bindingId,
      keyId
    };
  }
}
