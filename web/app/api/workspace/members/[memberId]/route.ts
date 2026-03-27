import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { SESSION_COOKIE_NAME } from "@/lib/workspace-access";

type RouteContext = {
  params: Promise<{ memberId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return NextResponse.json({ detail: "未登录。" }, { status: 401 });
  }

  const { memberId } = await context.params;
  const payload = await request.json().catch(() => null);
  const response = await fetch(
    `${getApiBaseUrl()}/api/workspace/members/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload ?? {})
    }
  );
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
