import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { SESSION_COOKIE_NAME } from "@/lib/workspace-access";

function buildAuthHeaders(token: string) {
  const headers = new Headers({
    "Content-Type": "application/json"
  });
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

type WorkflowRouteProps = {
  params: Promise<{
    workflowId: string;
  }>;
};

export async function PUT(request: NextRequest, { params }: WorkflowRouteProps) {
  const { workflowId } = await params;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const payload = await request.json().catch(() => null);
  const response = await fetch(
    `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflowId)}`,
    {
      method: "PUT",
      headers: buildAuthHeaders(token),
      body: JSON.stringify(payload ?? {})
    }
  );
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
