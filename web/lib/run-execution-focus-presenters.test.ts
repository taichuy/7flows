import { describe, expect, it } from "vitest";

import type { RunExecutionNodeItem } from "@/lib/get-run-views";

import {
  formatExecutionFocusArtifactSummary,
  formatExecutionFocusFollowUp,
  formatExecutionFocusPrimarySignal,
  listExecutionFocusArtifactPreviews,
  listExecutionFocusRuntimeFactBadges,
  listExecutionFocusToolCallSummaries
} from "./run-execution-focus-presenters";

function createExecutionNode(
  overrides: Partial<RunExecutionNodeItem> = {}
): RunExecutionNodeItem {
  return {
    node_run_id: "node-run-1",
    node_id: "tool_wait",
    node_name: "Tool Wait",
    node_type: "tool",
    status: "waiting_callback",
    phase: "waiting_callback",
    execution_class: "inline",
    execution_source: "workflow_default",
    execution_profile: null,
    execution_timeout_ms: null,
    execution_network_policy: null,
    execution_filesystem_policy: null,
    execution_dependency_mode: null,
    execution_builtin_package_set: null,
    execution_dependency_ref: null,
    execution_backend_extensions: null,
    execution_dispatched_count: 0,
    execution_fallback_count: 0,
    execution_blocked_count: 0,
    execution_unavailable_count: 0,
    effective_execution_class: null,
    execution_executor_ref: null,
    execution_sandbox_backend_id: null,
    execution_sandbox_backend_executor_ref: null,
    execution_blocking_reason: null,
    execution_fallback_reason: null,
    retry_count: 0,
    waiting_reason: null,
    error_message: null,
    started_at: "2026-03-18T10:00:00Z",
    finished_at: null,
    event_count: 0,
    event_type_counts: {},
    last_event_type: null,
    artifact_refs: [],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    callback_tickets: [],
    skill_reference_load_count: 0,
    skill_reference_loads: [],
    sensitive_access_entries: [],
    callback_waiting_lifecycle: null,
    scheduled_resume_delay_seconds: null,
    scheduled_resume_reason: null,
    scheduled_resume_source: null,
    scheduled_waiting_status: null,
    scheduled_resume_scheduled_at: null,
    scheduled_resume_due_at: null,
    ...overrides
  };
}

describe("run execution focus presenters", () => {
  it("优先展示 execution blocking reason", () => {
    const signal = formatExecutionFocusPrimarySignal(
      createExecutionNode({
        execution_blocking_reason: "sandbox backend unavailable",
        waiting_reason: "waiting for callback"
      })
    );

    expect(signal).toBe("执行阻断：sandbox backend unavailable");
  });

  it("在无 execution blocking 时回退到 waiting reason", () => {
    const signal = formatExecutionFocusPrimarySignal(
      createExecutionNode({
        waiting_reason: "Waiting for callback approval"
      })
    );

    expect(signal).toBe("等待原因：Waiting for callback approval");
  });

  it("follow-up 优先提示 pending sensitive access approvals", () => {
    const followUp = formatExecutionFocusFollowUp(
      createExecutionNode({
        sensitive_access_entries: [
          {
            request: {
              id: "request-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              requester_type: "tool",
              requester_id: "native.search",
              resource_id: "resource-1",
              action_type: "invoke",
              created_at: "2026-03-18T10:00:00Z"
            },
            resource: {
              id: "resource-1",
              label: "Callback capability",
              description: "External callback channel",
              sensitivity_level: "L2",
              source: "local_capability",
              metadata: {},
              created_at: "2026-03-18T09:00:00Z",
              updated_at: "2026-03-18T09:00:00Z"
            },
            approval_ticket: {
              id: "ticket-1",
              access_request_id: "request-1",
              run_id: "run-1",
              node_run_id: "node-run-1",
              status: "pending",
              waiting_status: "waiting",
              approved_by: null,
              decided_at: null,
              expires_at: "2026-03-18T10:05:00Z",
              created_at: "2026-03-18T10:00:00Z"
            },
            notifications: []
          }
        ],
        callback_tickets: [
          {
            ticket: "callback-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_call_id: null,
            tool_id: null,
            tool_call_index: 0,
            waiting_status: "waiting",
            status: "pending",
            reason: null,
            callback_payload: null,
            created_at: "2026-03-18T10:00:00Z",
            expires_at: null,
            consumed_at: null,
            canceled_at: null,
            expired_at: null
          }
        ]
      })
    );

    expect(followUp).toContain("sensitive access 审批票据");
  });

  it("在没有审批和 pending ticket 时提示 scheduled resume", () => {
    const followUp = formatExecutionFocusFollowUp(
      createExecutionNode({
        scheduled_resume_delay_seconds: 30,
        scheduled_resume_due_at: "2026-03-18T10:00:30Z"
      })
    );

    expect(followUp).toContain("已安排自动 resume（30s）");
    expect(followUp).toContain("2026-03-18T10:00:30Z");
  });

  it("把 inline 强隔离错配解释成明确的 execution class 阻断", () => {
    const node = createExecutionNode({
      execution_blocking_reason:
        "sandbox_code cannot run with execution class 'inline'. Use explicit 'subprocess' for the current host-controlled MVP path, or register a sandbox backend for 'sandbox' / 'microvm'."
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行阻断：当前节点要求受控执行，但 execution class 仍是 inline。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("调整为 subprocess");
  });

  it("把节点未实现的强隔离执行解释成 node-type 阻断", () => {
    const node = createExecutionNode({
      node_type: "condition",
      execution_blocking_reason:
        "Node type 'condition' does not implement requested strong-isolation execution class 'microvm'. Strong-isolation paths must fail closed until a compatible execution adapter is available."
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行阻断：当前 condition 节点尚未实现请求的强隔离 execution class。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("补齐对应 execution adapter");
  });

  it("把节点未实现的 subprocess 执行解释成显式 execution-class 阻断", () => {
    const node = createExecutionNode({
      node_type: "trigger",
      execution_blocking_reason:
        "Node type 'trigger' does not implement requested execution class 'subprocess'. Explicit execution-class requests must stay blocked until a compatible execution adapter is available."
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行阻断：当前 trigger 节点尚未实现请求的 subprocess execution class。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("调回 inline");
  });

  it("把 tool runner 强隔离缺口解释成 tool path 阻断", () => {
    const node = createExecutionNode({
      execution_blocking_reason:
        "Tool nodes do not yet implement sandbox-backed tool execution for requested execution class 'microvm'. Current native / compat invokers still run from the host / adapter boundary, so strong-isolation tool paths must fail closed until a sandbox tool runner is available."
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行阻断：当前 tool 路径还不能真实兑现请求的强隔离 execution class。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("sandbox tool runner");
  });

  it("把缺失 sandbox backend 解释成 fail-closed 阻断", () => {
    const node = createExecutionNode({
      execution_blocking_reason:
        "sandbox_code requested execution class 'sandbox', but no compatible sandbox backend is registered. Strong-isolation paths must fail closed until a sandbox backend is available."
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行阻断：当前节点要求强隔离执行，但没有兼容的 sandbox backend 可用。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("fail-closed");
  });

  it("把 sandbox capability 不兼容解释成配置与 backend 能力不匹配", () => {
    const node = createExecutionNode({
      execution_blocking_reason:
        "兼容 backend 细节：backend-a: does not support networkPolicy = egress；backend-b: does not support filesystemPolicy = workspace-write"
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行阻断：sandbox backend 能力与当前节点配置不兼容（2 项）。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("backend capability");
  });

  it("把 execution fallback code 映射成后端一致的人类可读说明", () => {
    const node = createExecutionNode({
      execution_fallback_reason: "compat_adapter_execution_class_not_supported"
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行降级：当前 compat adapter 不支持请求的 execution class，已回退到 adapter 支持范围。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("capability 声明");
  });

  it("在未知 execution fallback reason 上保留次数与治理指引", () => {
    const node = createExecutionNode({
      execution_fallback_reason: " custom_backend_temporarily_degraded ",
      execution_fallback_count: 2
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行降级：当前节点因 custom_backend_temporarily_degraded 发生 execution fallback，累计记录 2 次。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("execution policy");
  });

  it("在只有 execution fallback count 时展示通用降级说明", () => {
    const node = createExecutionNode({
      execution_fallback_count: 1
    });

    expect(formatExecutionFocusPrimarySignal(node)).toBe(
      "执行降级：当前节点记录了 1 次 execution fallback。"
    );
    expect(formatExecutionFocusFollowUp(node)).toContain("fallback 是否仍可接受");
  });

  it("把 focus node 的 tool runner 关键事实压成 operator 可读摘要", () => {
    const node = createExecutionNode({
      tool_calls: [
        {
          id: "tool-call-1",
          run_id: "run-1",
          node_run_id: "node-run-1",
          tool_id: "native.search",
          tool_name: "Native Search",
          phase: "waiting_callback",
          status: "blocked",
          request_summary: "search knowledge base",
          execution_trace: null,
          requested_execution_class: "sandbox",
          requested_execution_source: "tool_policy",
          requested_execution_profile: "risk-reviewed",
          requested_execution_timeout_ms: 3000,
          requested_execution_network_policy: "isolated",
          requested_execution_filesystem_policy: "ephemeral",
          requested_execution_dependency_mode: "builtin",
          requested_execution_builtin_package_set: "research-default",
          requested_execution_dependency_ref: null,
          requested_execution_backend_extensions: {
            image: "python:3.12",
            mount: "workspace"
          },
          effective_execution_class: "sandbox",
          execution_executor_ref: "tool:compat-adapter:dify-default",
          execution_sandbox_backend_id: "docker",
          execution_sandbox_backend_executor_ref: "sandbox-backend:docker",
          execution_sandbox_runner_kind: "container",
          execution_blocking_reason: "sandbox backend unavailable",
          execution_fallback_reason: null,
          response_summary: null,
          response_content_type: "json",
          response_meta: { sandbox_runner_trace: { runner: "container" } },
          raw_ref: "artifact://tool-call-1/raw",
          latency_ms: 120,
          retry_count: 0,
          error_message: null,
          created_at: "2026-03-18T10:00:00Z",
          finished_at: null
        }
      ]
    });

    expect(listExecutionFocusToolCallSummaries(node)).toEqual([
      {
        id: "tool-call-1",
        title: "Native Search · blocked",
        detail: "执行阻断：sandbox backend unavailable",
        badges: [
          "phase waiting_callback",
          "requested sandbox",
          "effective sandbox",
          "profile risk-reviewed",
          "deps builtin",
          "backend docker",
          "runner container",
          "content json",
          "blocked",
          "raw payload"
        ],
        rawRef: "artifact://tool-call-1/raw",
        traceSummary:
          "执行链：source tool_policy · timeout 3000ms · network isolated · filesystem ephemeral · deps builtin · builtin research-default · extensions image, mount · executor tool:compat-adapter:dify-default · backend ref sandbox-backend:docker。"
      }
    ]);
  });

  it("把 artifact refs 和 tool raw refs 汇总成统一说明", () => {
    const summary = formatExecutionFocusArtifactSummary(
      createExecutionNode({
        artifact_refs: ["artifact://node-run-1/decision"],
        artifacts: [
          {
            id: "artifact-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            artifact_kind: "tool_result",
            content_type: "application/json",
            summary: "search result",
            uri: "artifact://tool-result-1",
            metadata_payload: {},
            created_at: "2026-03-18T10:00:00Z"
          }
        ],
        tool_calls: [
          {
            id: "tool-call-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_id: "native.search",
            tool_name: "Native Search",
            phase: "completed",
            status: "succeeded",
            request_summary: "search knowledge base",
            execution_trace: null,
            requested_execution_class: null,
            requested_execution_source: null,
            requested_execution_profile: null,
            requested_execution_timeout_ms: null,
            requested_execution_network_policy: null,
            requested_execution_filesystem_policy: null,
            effective_execution_class: null,
            execution_executor_ref: null,
            execution_sandbox_backend_id: null,
            execution_sandbox_backend_executor_ref: null,
            execution_sandbox_runner_kind: null,
            execution_blocking_reason: null,
            execution_fallback_reason: null,
            response_summary: "found 2 docs",
            response_content_type: "json",
            response_meta: {},
            raw_ref: "artifact://tool-call-1/raw",
            latency_ms: 120,
            retry_count: 0,
            error_message: null,
            created_at: "2026-03-18T10:00:00Z",
            finished_at: "2026-03-18T10:00:01Z"
          }
        ]
      })
    );

    expect(summary).toContain("聚焦节点已沉淀 1 个 artifact（tool_result 1）。");
    expect(summary).toContain("run artifact refs 1 条。");
    expect(summary).toContain("至少 1 条 tool call 已把原始结果落到 raw_ref");
  });

  it("把 focus tool calls 的实际 execution facts 压成 compact badges", () => {
    const badges = listExecutionFocusRuntimeFactBadges(
      createExecutionNode({
        tool_calls: [
          {
            id: "tool-call-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_id: "native.search",
            tool_name: "Native Search",
            phase: "execute",
            status: "succeeded",
            request_summary: "search knowledge base",
            execution_trace: null,
            requested_execution_class: null,
            requested_execution_source: null,
            requested_execution_profile: null,
            requested_execution_timeout_ms: null,
            requested_execution_network_policy: null,
            requested_execution_filesystem_policy: null,
            requested_execution_dependency_mode: null,
            requested_execution_builtin_package_set: null,
            requested_execution_dependency_ref: null,
            requested_execution_backend_extensions: null,
            effective_execution_class: "sandbox",
            execution_executor_ref: "tool:compat-adapter:dify-default",
            execution_sandbox_backend_id: "sandbox-default",
            execution_sandbox_backend_executor_ref: null,
            execution_sandbox_runner_kind: "container",
            execution_blocking_reason: null,
            execution_fallback_reason: null,
            response_summary: "found 2 docs",
            response_content_type: "json",
            response_meta: {},
            raw_ref: "artifact://tool-call-1/raw",
            latency_ms: 120,
            retry_count: 0,
            error_message: null,
            created_at: "2026-03-18T10:00:00Z",
            finished_at: "2026-03-18T10:00:01Z"
          },
          {
            id: "tool-call-2",
            run_id: "run-1",
            node_run_id: "node-run-1",
            tool_id: "native.search",
            tool_name: "Native Search",
            phase: "execute",
            status: "succeeded",
            request_summary: "search docs again",
            execution_trace: null,
            requested_execution_class: null,
            requested_execution_source: null,
            requested_execution_profile: null,
            requested_execution_timeout_ms: null,
            requested_execution_network_policy: null,
            requested_execution_filesystem_policy: null,
            requested_execution_dependency_mode: null,
            requested_execution_builtin_package_set: null,
            requested_execution_dependency_ref: null,
            requested_execution_backend_extensions: null,
            effective_execution_class: "sandbox",
            execution_executor_ref: "tool:compat-adapter:dify-default",
            execution_sandbox_backend_id: "sandbox-default",
            execution_sandbox_backend_executor_ref: null,
            execution_sandbox_runner_kind: "container",
            execution_blocking_reason: null,
            execution_fallback_reason: null,
            response_summary: "found 1 doc",
            response_content_type: "json",
            response_meta: {},
            raw_ref: null,
            latency_ms: 150,
            retry_count: 0,
            error_message: null,
            created_at: "2026-03-18T10:00:02Z",
            finished_at: "2026-03-18T10:00:03Z"
          }
        ]
      })
    );

    expect(badges).toEqual([
      "effective sandbox×2",
      "executor tool:compat-adapter:dify-default×2",
      "backend sandbox-default×2",
      "runner container×2"
    ]);
  });

  it("把 execution focus artifact 预览压成 callback/operator 可复用的结构", () => {
    const previews = listExecutionFocusArtifactPreviews(
      createExecutionNode({
        artifacts: [
          {
            id: "artifact-1",
            run_id: "run-1",
            node_run_id: "node-run-1",
            artifact_kind: "tool_result",
            content_type: "application/json",
            summary: "search result",
            uri: "artifact://tool-result-1",
            metadata_payload: {},
            created_at: "2026-03-18T10:00:00Z"
          },
          {
            id: "artifact-2",
            run_id: "run-1",
            node_run_id: "node-run-1",
            artifact_kind: "sandbox_result",
            content_type: "text/plain",
            summary: "sandbox stdout",
            uri: "artifact://sandbox-result-1",
            metadata_payload: {},
            created_at: "2026-03-18T10:00:01Z"
          },
          {
            id: "artifact-3",
            run_id: "run-1",
            node_run_id: "node-run-1",
            artifact_kind: "trace",
            content_type: "application/json",
            summary: "detailed trace",
            uri: "artifact://trace-1",
            metadata_payload: {},
            created_at: "2026-03-18T10:00:02Z"
          }
        ]
      })
    );

    expect(previews).toEqual([
      {
        key: "artifact://tool-result-1",
        artifactKind: "tool_result",
        contentType: "application/json",
        summary: "search result",
        uri: "artifact://tool-result-1"
      },
      {
        key: "artifact://sandbox-result-1",
        artifactKind: "sandbox_result",
        contentType: "text/plain",
        summary: "sandbox stdout",
        uri: "artifact://sandbox-result-1"
      }
    ]);
  });
});
