"use client";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { RunDetail } from "@/lib/get-run-detail";
import type { RunTrace } from "@/lib/get-run-trace";

export async function fetchRunDetail(runId: string) {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/runs/${encodeURIComponent(runId)}/detail?include_events=false`,
      {
        cache: "no-store"
      }
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RunDetail;
  } catch {
    return null;
  }
}

export async function fetchRunTrace(runId: string): Promise<{
  trace: RunTrace | null;
  errorMessage: string | null;
}> {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/runs/${encodeURIComponent(runId)}/trace?limit=100&order=asc`,
      {
        cache: "no-store"
      }
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { detail?: string }
        | null;
      return {
        trace: null,
        errorMessage:
          body?.detail ?? `无法读取 run trace，API 返回 ${response.status}。`
      };
    }
    return {
      trace: (await response.json()) as RunTrace,
      errorMessage: null
    };
  } catch {
    return {
      trace: null,
      errorMessage: "无法连接后端读取 run trace，请确认 API 已启动。"
    };
  }
}
