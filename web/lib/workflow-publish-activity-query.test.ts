import { describe, expect, it } from "vitest";

import {
  buildWorkflowPublishActivitySearchParams,
  readWorkflowPublishActivityQueryScope
} from "@/lib/workflow-publish-activity-query";

describe("workflow publish activity query", () => {
  it("reads and normalizes publish query scope from record search params", () => {
    expect(
      readWorkflowPublishActivityQueryScope({
        publish_binding: " binding-1 ",
        publish_status: "failed",
        publish_request_source: "path",
        publish_request_surface: "openai.responses",
        publish_cache_status: "hit",
        publish_run_status: " waiting_callback ",
        publish_api_key_id: " api-key-1 ",
        publish_reason_code: "rate_limit_exceeded",
        publish_window: "24h",
        publish_invocation: [" invocation-1 ", "ignored"]
      })
    ).toEqual({
      bindingId: "binding-1",
      status: "failed",
      requestSource: "path",
      requestSurface: "openai.responses",
      cacheStatus: "hit",
      runStatus: "waiting_callback",
      apiKeyId: "api-key-1",
      reasonCode: "rate_limit_exceeded",
      timeWindow: "24h",
      invocationId: "invocation-1"
    });
  });

  it("drops invalid publish query values and falls back to defaults", () => {
    expect(
      readWorkflowPublishActivityQueryScope(
        new URLSearchParams({
          publish_binding: "   ",
          publish_status: "unknown",
          publish_request_source: "manual",
          publish_request_surface: "openai.images",
          publish_cache_status: "warm",
          publish_run_status: "   ",
          publish_api_key_id: " ",
          publish_reason_code: "not_real",
          publish_window: "90d",
          publish_invocation: "   "
        })
      )
    ).toEqual({
      bindingId: null,
      status: null,
      requestSource: null,
      requestSurface: null,
      cacheStatus: null,
      runStatus: null,
      apiKeyId: null,
      reasonCode: null,
      timeWindow: "all",
      invocationId: null
    });
  });

  it("round-trips normalized query scope through canonical search params", () => {
    const originalScope = {
      bindingId: "binding-7",
      status: "succeeded",
      requestSource: "workflow",
      requestSurface: "native.workflow.async",
      cacheStatus: "miss",
      runStatus: "running",
      apiKeyId: "key-7",
      reasonCode: "unknown",
      timeWindow: "7d",
      invocationId: "invocation-7"
    } as const;

    expect(
      readWorkflowPublishActivityQueryScope(
        buildWorkflowPublishActivitySearchParams(originalScope)
      )
    ).toEqual(originalScope);
  });
});

