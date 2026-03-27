import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api-base-url";
import { SESSION_COOKIE_NAME, type AuthSessionResponse } from "@/lib/workspace-access";

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload ?? {})
  });
  const body = (await response.json().catch(() => null)) as
    | AuthSessionResponse
    | { detail?: string }
    | null;

  const nextResponse = NextResponse.json(body, {
    status: response.status
  });

  if (response.ok && body && "token" in body && typeof body.token === "string") {
    nextResponse.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: body.token,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7
    });
  }

  return nextResponse;
}
