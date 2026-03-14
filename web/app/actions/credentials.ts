"use server";

import { revalidatePath } from "next/cache";

import { getApiBaseUrl } from "@/lib/api-base-url";

export type CreateCredentialState = {
  status: "idle" | "success" | "error";
  message: string;
  credentialId: string;
};

export type RevokeCredentialState = {
  status: "idle" | "success" | "error";
  message: string;
  credentialId: string;
};

export async function createCredential(
  _: CreateCredentialState,
  formData: FormData
): Promise<CreateCredentialState> {
  const name = String(formData.get("name") ?? "").trim();
  const credentialType = String(
    formData.get("credentialType") ?? ""
  ).trim();
  const description = String(formData.get("description") ?? "").trim();
  const dataJson = String(formData.get("data") ?? "").trim();

  if (!name || !credentialType || !dataJson) {
    return {
      status: "error",
      message: "名称、类型和数据字段不能为空。",
      credentialId: "",
    };
  }

  let data: Record<string, string>;
  try {
    data = JSON.parse(dataJson);
    if (typeof data !== "object" || Array.isArray(data)) throw new Error();
  } catch {
    return {
      status: "error",
      message: "数据字段必须是有效的 JSON 对象 (key-value 字符串)。",
      credentialId: "",
    };
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        credential_type: credentialType,
        description,
        data,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return {
        status: "error",
        message: `创建失败 (${res.status}): ${detail}`,
        credentialId: "",
      };
    }

    const result = await res.json();
    revalidatePath("/");
    return {
      status: "success",
      message: `凭证 "${result.name}" 已创建。引用格式: credential://${result.id}`,
      credentialId: result.id,
    };
  } catch (err) {
    return {
      status: "error",
      message: `创建凭证失败: ${String(err)}`,
      credentialId: "",
    };
  }
}

export async function revokeCredential(
  _: RevokeCredentialState,
  formData: FormData
): Promise<RevokeCredentialState> {
  const credentialId = String(formData.get("credentialId") ?? "").trim();

  if (!credentialId) {
    return { status: "error", message: "缺少凭证 ID。", credentialId: "" };
  }

  try {
    const res = await fetch(
      `${getApiBaseUrl()}/api/credentials/${credentialId}`,
      { method: "DELETE" }
    );

    if (!res.ok) {
      const detail = await res.text();
      return {
        status: "error",
        message: `吊销失败 (${res.status}): ${detail}`,
        credentialId,
      };
    }

    revalidatePath("/");
    return {
      status: "success",
      message: "凭证已吊销。",
      credentialId,
    };
  } catch (err) {
    return {
      status: "error",
      message: `吊销凭证失败: ${String(err)}`,
      credentialId,
    };
  }
}
