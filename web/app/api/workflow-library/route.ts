import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { SESSION_COOKIE_NAME } from "@/lib/workspace-access";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(
    `${getApiBaseUrl()}/api/workflow-library${request.nextUrl.search}`,
    {
      cache: "no-store",
      headers
    }
  );
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
