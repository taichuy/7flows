import { describe, expect, it } from "vitest";

import type { PublishedEndpointInvocationDetailResponse } from "@/lib/get-workflow-publish";
import type { SensitiveAccessTimelineEntry } from "@/lib/get-sensitive-access";
import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";
import type { WorkflowPublishInvocationActiveFilter } from "@/lib/workflow-publish-governance";

import {
  buildWorkflowPublishActivityHref,
  resolveWorkflowPublishActivityDetailLinks,
  resolveWorkflowPublishSelectedInvocationDetailSurface
} from "@/components/workflow-publish-activity-panel-helpers";

function buildSelectedInvocationDetail(): PublishedEndpointInvocationDetailResponse {
  return {
    invocation: {
      id: "invocation-1",
      workflow_id: "workflow-1",
      binding_id: "binding-1",
      endpoint_id: "endpoint-1",
      endpoint_alias: "alias-1",
      route_path: "/published/test",
      protocol: "openai",
      auth_mode: "api_key",
      request_source: "workflow",
      request_surface: "native.workflow",
      status: "failed",
      cache_status: "miss",
      request_preview: { key_count: 1, keys: ["query"] },
      response_preview: { ok: false },
      created_at: "2026-03-21T00:10:00Z",
      finished_at: "2026-03-21T00:10:01Z",
      duration_ms: 1000,
      error_message: "sandbox backend offline during invocation",
      reason_code: "runtime_failed",
      api_key_name: null,
      api_key_prefix: null,
      run_id: "run-selected-1",
      run_status: "waiting",
      run_current_node_id: "tool_wait",
      run_waiting_reason: "callback pending",
      run_waiting_lifecycle: null,
      run_follow_up: {
        affected_run_count: 1,
        sampled_run_count: 1,
        waiting_run_count: 1,
        running_run_count: 0,
        succeeded_run_count: 0,
        failed_run_count: 0,
        unknown_run_count: 0,
        explanation: {
          primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
          follow_up: "run run-selected-1：继续观察 callback waiting。"
        },
        sampled_runs: [
          {
            run_id: "run-selected-1",
            snapshot: {
              status: "waiting",
              current_node_id: "tool_wait",
              waiting_reason: "callback pending",
              callback_waiting_explanation: {
                primary_signal: "当前 waiting 节点仍在等待 callback。",
                follow_up: "优先观察定时恢复是否已重新排队。"
              }
            }
          }
        ]
      }
    },
    run: {
      id: "run-selected-1",
      status: "waiting",
      current_node_id: "tool_wait",
      started_at: "2026-03-21T00:10:00Z",
      finished_at: null
    } as never,
    run_snapshot: null,
    run_follow_up: {
      affected_run_count: 1,
      sampled_run_count: 1,
      waiting_run_count: 1,
      running_run_count: 0,
      succeeded_run_count: 0,
      failed_run_count: 0,
      unknown_run_count: 0,
      explanation: {
        primary_signal: "本次影响 1 个 run；已回读 1 个样本。",
        follow_up: "run run-selected-1：继续观察 callback waiting。"
      },
      sampled_runs: [
        {
          run_id: "run-selected-1",
          snapshot: {
            status: "waiting",
            current_node_id: "tool_wait",
            waiting_reason: "callback pending",
            callback_waiting_explanation: {
              primary_signal: "当前 waiting 节点仍在等待 callback。",
              follow_up: "优先观察定时恢复是否已重新排队。"
            }
          }
        }
      ]
    },
    callback_tickets: [],
    blocking_node_run_id: "node-run-wait",
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    callback_waiting_explanation: {
      primary_signal: "当前 waiting 节点仍在等待 callback。",
      follow_up: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。"
    },
    skill_trace: null,
    blocking_sensitive_access_entries: [],
    sensitive_access_entries: [],
    cache: {
      cache_status: "miss",
      cache_key: null,
      cache_entry_id: null,
      inventory_entry: null
    }
  };
}

function buildBlockedPayload(): SensitiveAccessBlockingPayload {
  return {
    detail: "Invocation detail is guarded by sensitive access control.",
    resource: {
      id: "resource-1",
      label: "Invocation detail",
      description: "Protected invocation detail payload",
      sensitivity_level: "L3",
      source: "workspace_resource",
      metadata: {}
    },
    access_request: {
      id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      requester_type: "human",
      requester_id: "ops-reviewer",
      resource_id: "resource-1",
      action_type: "read",
      decision: "require_approval",
      reason_code: "approval_required_high_sensitive_access",
      policy_summary: null
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      status: "pending",
      waiting_status: "waiting",
      approved_by: null
    },
    notifications: [],
    outcome_explanation: {
      primary_signal: "审批票据仍在等待处理。",
      follow_up: "先处理审批票据，再申请查看 invocation detail。"
    },
    run_snapshot: null,
    run_follow_up: null
  };
}

function buildSampleApprovalEntry(): SensitiveAccessTimelineEntry {
  return {
    request: {
      id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      requester_type: "human",
      requester_id: "ops-reviewer",
      resource_id: "resource-1",
      action_type: "read",
      decision: "require_approval",
      decision_label: "Require approval",
      reason_code: "approval_required_high_risk",
      reason_label: "Approval required",
      policy_summary: "High risk resource requires approval",
      created_at: "2026-03-21T00:00:00Z",
      decided_at: null,
      purpose_text: null
    },
    resource: {
      id: "resource-1",
      label: "Sensitive approval",
      description: "Approval required resource",
      sensitivity_level: "L3",
      source: "workspace_resource",
      metadata: {},
      created_at: "2026-03-21T00:00:00Z",
      updated_at: "2026-03-21T00:05:00Z"
    },
    approval_ticket: {
      id: "ticket-1",
      access_request_id: "request-1",
      run_id: "run-selected-1",
      node_run_id: "node-run-wait",
      status: "pending",
      waiting_status: "waiting",
      created_at: "2026-03-21T00:00:00Z",
      decided_at: null,
      expires_at: null,
      approved_by: null
    },
    notifications: []
  };
}

describe("workflow publish activity panel helpers", () => {
  it("keeps publish activity self-links on the shared workflow editor contract", () => {
    const activeInvocationFilter = {
      bindingId: "binding-1",
      status: "failed",
      requestSource: "path",
      requestSurface: "openai.responses",
      cacheStatus: "hit",
      runStatus: " waiting_callback ",
      apiKeyId: " api key/1 ",
      reasonCode: "rate_limit_exceeded",
      timeWindow: "24h"
    } satisfies WorkflowPublishInvocationActiveFilter;

    expect(
      buildWorkflowPublishActivityHref({
        workflowId: " workflow alpha/beta ",
        bindingId: " binding alpha/beta ",
        activeInvocationFilter,
        invocationId: " invocation alpha/beta "
      })
    ).toBe(
      "/workflows/workflow%20alpha%2Fbeta/publish?publish_binding=binding+alpha%2Fbeta&publish_status=failed&publish_request_source=path&publish_request_surface=openai.responses&publish_cache_status=hit&publish_run_status=waiting_callback&publish_api_key_id=api+key%2F1&publish_reason_code=rate_limit_exceeded&publish_window=24h&publish_invocation=invocation+alpha%2Fbeta"
    );
  });

  it("drops empty publish scope values and falls back to the canonical workflow href", () => {
    expect(
      buildWorkflowPublishActivityHref({
        workflowId: " workflow-1 ",
        bindingId: "   ",
        activeInvocationFilter: {
          bindingId: null,
          status: null,
          requestSource: null,
          requestSurface: null,
          cacheStatus: null,
          runStatus: "   ",
          apiKeyId: "",
          reasonCode: " ",
          timeWindow: "all"
        },
        invocationId: "   "
      })
    ).toBe("/workflows/workflow-1/publish");
  });

  it("projects clear and detail links from the same publish activity contract", () => {
    const activeInvocationFilter = {
      bindingId: "binding-1",
      status: "failed",
      requestSource: "path",
      requestSurface: "openai.responses",
      cacheStatus: "hit",
      runStatus: " waiting_callback ",
      apiKeyId: " api key/1 ",
      reasonCode: "rate_limit_exceeded",
      timeWindow: "24h"
    } satisfies WorkflowPublishInvocationActiveFilter;

    const detailLinks = resolveWorkflowPublishActivityDetailLinks({
      workflowId: " workflow alpha/beta ",
      bindingId: " binding alpha/beta ",
      activeInvocationFilter
    });

    expect(detailLinks.clearInvocationDetailHref).toBe(
      "/workflows/workflow%20alpha%2Fbeta/publish?publish_binding=binding+alpha%2Fbeta&publish_status=failed&publish_request_source=path&publish_request_surface=openai.responses&publish_cache_status=hit&publish_run_status=waiting_callback&publish_api_key_id=api+key%2F1&publish_reason_code=rate_limit_exceeded&publish_window=24h"
    );
    expect(detailLinks.buildInvocationDetailHref(" invocation alpha/beta ")).toBe(
      "/workflows/workflow%20alpha%2Fbeta/publish?publish_binding=binding+alpha%2Fbeta&publish_status=failed&publish_request_source=path&publish_request_surface=openai.responses&publish_cache_status=hit&publish_run_status=waiting_callback&publish_api_key_id=api+key%2F1&publish_reason_code=rate_limit_exceeded&publish_window=24h&publish_invocation=invocation+alpha%2Fbeta"
    );
  });

  it("projects selected invocation next-step surface from shared publish facts", () => {
    const detail = buildSelectedInvocationDetail();
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      tool_governance: {
        missing_tool_ids: ["native.catalog-gap"],
        unresolved_node_count: 1,
        missing_binding_count: 1,
        affected_version_count: 1,
        missing_toolkit_count: 1,
        latest_version: "v3"
      }
    } as never;
    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: {
        kind: "ok",
        data: detail
      }
    });

    expect(detailSurface.kind).toBe("ok");
    expect(detailSurface.nextStepSurface).toMatchObject({
      title: "Selected invocation next step",
      invocationId: "invocation-1",
      label: "approval blocker",
      hrefLabel: "open blocker inbox slice",
      detail: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。"
    });
    expect(detailSurface.nextStepSurface?.workflowGovernanceHandoff).toMatchObject({
      workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
      workflowCatalogGapDetail:
        "当前 sampled run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 publish sampled snapshot。"
    });
  });

  it("prefers shared callback recovery CTA for selected invocation next step when only local callback prose remains", () => {
    const detail = buildSelectedInvocationDetail();
    detail.invocation.run_waiting_lifecycle = { node_run_id: "node-run-wait" } as never;

    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: {
        kind: "ok",
        data: detail
      },
      callbackWaitingAutomation: {
        status: "partial",
        scheduler_required: true,
        detail: "callback automation degraded",
        scheduler_health_status: "degraded",
        scheduler_health_detail: "waiting resume monitor degraded",
        affected_run_count: 3,
        affected_workflow_count: 2,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "open_run_library",
          label: "Open run library",
          href: "/runs?focus=callback-waiting",
          entry_key: "runLibrary"
        },
        steps: []
      }
    });

    expect(detailSurface.kind).toBe("ok");
    expect(detailSurface.nextStepSurface).toMatchObject({
      title: "Selected invocation next step",
      invocationId: "invocation-1",
      label: "callback recovery",
      href: "/runs?focus=callback-waiting",
      hrefLabel: "Open run library",
      detail: "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。"
    });
  });

  it("restores selected invocation approval CTA from sampled blocker context when top-level inbox facts are missing", () => {
    const detail = buildSelectedInvocationDetail();
    detail.invocation.run_waiting_lifecycle = null;
    detail.blocking_node_run_id = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.callback_waiting_explanation = {
      primary_signal: "当前 waiting 节点仍在等待 callback。",
      follow_up: "优先处理审批票据，再观察 waiting 节点是否恢复。"
    };
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      sensitive_access_entries: [buildSampleApprovalEntry()]
    };

    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: {
        kind: "ok",
        data: detail
      }
    });

    expect(detailSurface.kind).toBe("ok");
    expect(detailSurface.nextStepSurface).toMatchObject({
      title: "Selected invocation next step",
      invocationId: "invocation-1",
      label: "callback waiting",
      hrefLabel: "open approval inbox slice",
      detail: "优先处理审批票据，再观察 waiting 节点是否恢复。"
    });
    expect(detailSurface.nextStepSurface?.href).toContain("approval_ticket_id=ticket-1");
  });

  it("prefers sampled approval blocker href for selected invocation next step when top-level blocker scope is generic", () => {
    const detail = buildSelectedInvocationDetail();
    detail.run_follow_up!.sampled_runs[0] = {
      ...detail.run_follow_up!.sampled_runs[0],
      sensitive_access_entries: [buildSampleApprovalEntry()]
    };

    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: {
        kind: "ok",
        data: detail
      }
    });

    expect(detailSurface.kind).toBe("ok");
    expect(detailSurface.nextStepSurface).toMatchObject({
      title: "Selected invocation next step",
      invocationId: "invocation-1",
      label: "approval blocker",
      hrefLabel: "open blocker inbox slice",
      detail: "优先处理 blocker inbox，再观察 waiting 节点是否恢复。"
    });
    expect(detailSurface.nextStepSurface?.href).toContain("approval_ticket_id=ticket-1");
  });

  it("projects selected invocation execution next step to a focused trace slice when blocker backlog is cleared", () => {
    const detail = buildSelectedInvocationDetail();
    detail.invocation.run_waiting_lifecycle = null;
    detail.run_follow_up = null;
    detail.callback_waiting_explanation = null;
    detail.callback_tickets = [];
    detail.sensitive_access_entries = [];
    detail.blocking_sensitive_access_entries = [];
    detail.blocking_node_run_id = null;
    detail.execution_focus_explanation = {
      primary_signal: "execution focus 仍需要排障。",
      follow_up: "优先打开 run 继续检查 focus node。"
    };
    detail.run_snapshot = {
      status: "failed",
      current_node_id: "tool_wait",
      execution_focus_node_id: "tool_wait",
      execution_focus_node_run_id: "node-run-focus",
      execution_focus_node_name: "Tool wait",
      execution_focus_explanation: {
        primary_signal: "execution focus 仍需要排障。",
        follow_up: "优先打开 run 继续检查 focus node。"
      }
    } as never;

    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: {
        kind: "ok",
        data: detail
      }
    });

    expect(detailSurface.kind).toBe("ok");
    expect(detailSurface.nextStepSurface).toMatchObject({
      title: "Selected invocation next step",
      invocationId: "invocation-1",
      label: "execution focus",
      href:
        "/runs/run-selected-1?node_run_id=node-run-focus#run-diagnostics-execution-timeline",
      hrefLabel: "jump to focused trace slice",
      detail: "优先打开 run 继续检查 focus node。"
    });
  });

  it("projects blocked invocation detail copy from shared guarded surface", () => {
    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: {
        kind: "blocked",
        statusCode: 403,
        payload: buildBlockedPayload()
      }
    });

    expect(detailSurface.kind).toBe("blocked");
    if (detailSurface.kind !== "blocked") {
      throw new Error("expected blocked detail surface");
    }

    expect(detailSurface.blockedSurfaceCopy.title).toBe("Invocation detail waiting on approval");
    expect(detailSurface.blockedSurfaceCopy.summary).toContain("详情查看不会绕过审批、通知与 run follow-up 事实链");
  });

  it("falls back to shared unavailable copy when selected detail is missing", () => {
    const detailSurface = resolveWorkflowPublishSelectedInvocationDetailSurface({
      selectedInvocationId: "invocation-1",
      selectedInvocationDetail: null
    });

    expect(detailSurface.kind).toBe("unavailable");
    if (detailSurface.kind !== "unavailable") {
      throw new Error("expected unavailable detail surface");
    }

    expect(detailSurface.unavailableSurfaceCopy).toMatchObject({
      title: "Invocation detail unavailable",
      summary: "当前未能拉取该 invocation 的详情 payload。",
      detail: "审计列表仍可继续使用；如果问题可复现，优先回到 run detail 或稍后重试该详情入口。"
    });
  });
});
