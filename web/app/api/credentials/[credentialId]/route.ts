import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { SESSION_COOKIE_NAME } from "@/lib/workspace-access";

type CredentialRouteContext = {
  params: Promise<{ credentialId: string }>;
};

function buildAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  };
}

export async function PUT(request: NextRequest, context: CredentialRouteContext) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ detail: "未登录。" }, { status: 401 });
  }

  const { credentialId } = await context.params;
  const payload = await request.json().catch(() => null);
  const response = await fetch(
    `${getApiBaseUrl()}/api/credentials/${encodeURIComponent(credentialId)}`,
    {
      method: "PUT",
      headers: {
        ...buildAuthHeaders(token),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload ?? {})
    }
  );
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}

export async function DELETE(request: NextRequest, context: CredentialRouteContext) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ detail: "未登录。" }, { status: 401 });
  }

  const { credentialId } = await context.params;
  const response = await fetch(
    `${getApiBaseUrl()}/api/credentials/${encodeURIComponent(credentialId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(token)
    }
  );
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
