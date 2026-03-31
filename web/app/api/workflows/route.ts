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

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}/api/workflows${request.nextUrl.search}`, {
    cache: "no-store",
    headers
  });
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const payload = await request.json().catch(() => null);
  const response = await fetch(`${getApiBaseUrl()}/api/workflows`, {
    method: "POST",
    headers: buildAuthHeaders(token),
    body: JSON.stringify(payload ?? {})
  });
  const body = await response.json().catch(() => null);
  return NextResponse.json(body, { status: response.status });
}
