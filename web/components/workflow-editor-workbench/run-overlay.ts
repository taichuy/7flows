"use client";

import { getRunDetail } from "@/lib/get-run-detail";
import {
  getRunTrace,
  type RunTraceLoadResult
} from "@/lib/get-run-trace";

export async function fetchRunDetail(runId: string) {
  return getRunDetail(runId);
}

export async function fetchRunTrace(runId: string): Promise<RunTraceLoadResult> {
  return getRunTrace(runId, {
    limit: 100,
    order: "asc"
  });
}
