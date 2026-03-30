import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildWorkflowPublishActivityHref,
  buildWorkflowPublishActivitySearchParams,
  readWorkflowPublishActivityQueryScope,
  resolveWorkflowPublishActivityFilters
} from "@/lib/workflow-publish-activity-query";

afterEach(() => {
  vi.useRealTimers();
});

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

  it("projects query scope into governance fetch and panel filters when binding exists", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-22T05:03:00.000Z"));

    expect(
      resolveWorkflowPublishActivityFilters(
        {
          bindingId: "binding-7",
          status: "failed",
          requestSource: "path",
          requestSurface: "openai.responses",
          cacheStatus: "hit",
          runStatus: "waiting_callback",
          apiKeyId: "key-7",
          reasonCode: "rate_limit_exceeded",
          timeWindow: "24h",
          invocationId: "invocation-7"
        },
        [{ id: "binding-7" }, { id: "binding-8" }]
      )
    ).toEqual({
      governanceFetchFilter: {
        bindingId: "binding-7",
        invocationId: "invocation-7",
        status: "failed",
        requestSource: "path",
        requestSurface: "openai.responses",
        cacheStatus: "hit",
        runStatus: "waiting_callback",
        apiKeyId: "key-7",
        reasonCode: "rate_limit_exceeded",
        createdFrom: "2026-03-21T05:03:00.000Z",
        createdTo: "2026-03-22T05:03:00.000Z"
      },
      panelActiveFilter: {
        bindingId: "binding-7",
        status: "failed",
        requestSource: "path",
        requestSurface: "openai.responses",
        cacheStatus: "hit",
        runStatus: "waiting_callback",
        apiKeyId: "key-7",
        reasonCode: "rate_limit_exceeded",
        timeWindow: "24h"
      },
      selectedInvocationId: "invocation-7"
    });
  });

  it("drops binding-scoped projections when the requested binding is no longer present", () => {
    expect(
      resolveWorkflowPublishActivityFilters(
        {
          bindingId: "binding-missing",
          status: "failed",
          requestSource: "path",
          requestSurface: "openai.responses",
          cacheStatus: "hit",
          runStatus: "waiting_callback",
          apiKeyId: "key-7",
          reasonCode: "rate_limit_exceeded",
          timeWindow: "7d",
          invocationId: "invocation-7"
        },
        [{ id: "binding-8" }]
      )
    ).toEqual({
      governanceFetchFilter: null,
      panelActiveFilter: {
        bindingId: null,
        status: null,
        requestSource: null,
        requestSurface: "openai.responses",
        cacheStatus: "hit",
        runStatus: "waiting_callback",
        apiKeyId: null,
        reasonCode: null,
        timeWindow: "7d"
      },
      selectedInvocationId: null
    });
  });

  it("merges workspace starter scope into publish activity hrefs without dropping publish filters", () => {
    expect(
      buildWorkflowPublishActivityHref({
        workflowId: "workflow-1",
        bindingId: "binding-1",
        activeInvocationFilter: {
          bindingId: "binding-1",
          status: "failed",
          requestSource: "path",
          requestSurface: "openai.responses",
          cacheStatus: "hit",
          runStatus: "waiting_callback",
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "24h"
        },
        invocationId: "invocation-1",
        workspaceStarterGovernanceQueryScope: {
          activeTrack: "应用新建编排",
          sourceGovernanceKind: "drifted",
          needsFollowUp: true,
          searchQuery: "drift",
          selectedTemplateId: "starter-1"
        }
      })
    ).toBe(
      "/workflows/workflow-1/publish?needs_follow_up=true&q=drift&source_governance_kind=drifted&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&publish_binding=binding-1&publish_status=failed&publish_request_source=path&publish_request_surface=openai.responses&publish_cache_status=hit&publish_run_status=waiting_callback&publish_window=24h&publish_invocation=invocation-1"
    );
  });

  it("keeps publish activity hrefs inside the missing-tool workflow scope", () => {
    expect(
      buildWorkflowPublishActivityHref({
        workflowId: "workflow-1",
        workflow: {
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0
          }
        },
        bindingId: "binding-1",
        activeInvocationFilter: {
          bindingId: "binding-1",
          status: "failed",
          requestSource: "path",
          requestSurface: "openai.responses",
          cacheStatus: "hit",
          runStatus: "waiting_callback",
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "24h"
        },
        invocationId: "invocation-1"
      })
    ).toBe(
      "/workflows/workflow-1/publish?definition_issue=missing_tool&publish_binding=binding-1&publish_status=failed&publish_request_source=path&publish_request_surface=openai.responses&publish_cache_status=hit&publish_run_status=waiting_callback&publish_window=24h&publish_invocation=invocation-1"
    );
  });

  it("prefers legacy auth scope when publish activity facts include both legacy auth and catalog gap", () => {
    expect(
      buildWorkflowPublishActivityHref({
        workflowId: "workflow-1",
        workflow: {
          tool_governance: {
            referenced_tool_ids: ["native.catalog-gap"],
            missing_tool_ids: ["native.catalog-gap"],
            governed_tool_count: 0,
            strong_isolation_tool_count: 0,
          },
          legacy_auth_governance: {
            binding_count: 2,
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 1,
          },
        },
        bindingId: "binding-1",
        activeInvocationFilter: {
          bindingId: "binding-1",
          status: "failed",
          requestSource: "path",
          requestSurface: "openai.responses",
          cacheStatus: "hit",
          runStatus: "waiting_callback",
          apiKeyId: null,
          reasonCode: null,
          timeWindow: "24h",
        },
        invocationId: "invocation-1",
      })
    ).toBe(
      "/workflows/workflow-1/publish?definition_issue=legacy_publish_auth&publish_binding=binding-1&publish_status=failed&publish_request_source=path&publish_request_surface=openai.responses&publish_cache_status=hit&publish_run_status=waiting_callback&publish_window=24h&publish_invocation=invocation-1"
    );
  });
});
