import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { SESSION_COOKIE_NAME } from "@/lib/workspace-access";

function buildAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  };
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ detail: "未登录。" }, { status: 401 });
  }

  const response = await fetch(`${getApiBaseUrl()}/api/workspace/members`, {
    cache: "no-store",
    headers: buildAuthHeaders(token)
  });
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ detail: "未登录。" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const response = await fetch(`${getApiBaseUrl()}/api/workspace/members`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload ?? {})
  });
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
