import { describe, expect, it } from "vitest";

import type { SandboxReadinessCheck } from "./get-system-overview";
import type { RunExecutionNodeItem } from "./get-run-views";
import {
  buildSandboxExecutionReadinessInsight,
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  formatSandboxReadinessPreflightHint,
  listSandboxAvailableClasses,
  listSandboxBlockedClasses,
  listSandboxReadinessCapabilityChips
} from "./sandbox-readiness-presenters";

function createReadiness(
  overrides: Partial<SandboxReadinessCheck> = {}
): SandboxReadinessCheck {
  return {
    enabled_backend_count: 1,
    healthy_backend_count: 1,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: [
      {
        execution_class: "sandbox",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: false,
        reason: null
      },
      {
        execution_class: "microvm",
        available: true,
        backend_ids: ["sandbox-default"],
        supported_languages: ["python"],
        supported_profiles: ["default"],
        supported_dependency_modes: ["builtin"],
        supports_tool_execution: true,
        supports_builtin_package_sets: true,
        supports_backend_extensions: false,
        supports_network_policy: true,
        supports_filesystem_policy: false,
        reason: null
      }
    ],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["builtin"],
    supports_tool_execution: true,
    supports_builtin_package_sets: true,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: false,
    ...overrides
  };
}

function createExecutionNode(
  overrides: Partial<RunExecutionNodeItem> = {}
): RunExecutionNodeItem {
  return {
    node_run_id: "node-run-1",
    node_id: "node-1",
    node_name: "Sandbox tool",
    node_type: "tool",
    status: "blocked",
    phase: "execute",
    execution_class: "sandbox",
    execution_source: "tool_policy",
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
    execution_blocked_count: 1,
    execution_unavailable_count: 0,
    requested_execution_class: "sandbox",
    requested_execution_source: "tool_policy",
    requested_execution_profile: null,
    requested_execution_timeout_ms: null,
    requested_execution_network_policy: null,
    requested_execution_filesystem_policy: null,
    requested_execution_dependency_mode: null,
    requested_execution_builtin_package_set: null,
    requested_execution_dependency_ref: null,
    requested_execution_backend_extensions: null,
    effective_execution_class: "inline",
    execution_executor_ref: null,
    execution_sandbox_backend_id: "sandbox-default",
    execution_sandbox_backend_executor_ref: null,
    execution_sandbox_runner_kind: null,
    execution_blocking_reason: "No compatible sandbox backend is available.",
    execution_fallback_reason: null,
    retry_count: 0,
    waiting_reason: null,
    error_message: null,
    started_at: null,
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
    execution_focus_explanation: null,
    callback_waiting_explanation: null,
    scheduled_resume_delay_seconds: null,
    scheduled_resume_reason: null,
    scheduled_resume_source: null,
    scheduled_waiting_status: null,
    scheduled_resume_scheduled_at: null,
    scheduled_resume_due_at: null,
    scheduled_resume_requeued_at: null,
    scheduled_resume_requeue_source: null,
    ...overrides
  };
}

describe("sandbox readiness presenters", () => {
  it("在没有启用 backend 时明确提示所有强隔离路径 fail-closed", () => {
    const readiness = createReadiness({
      enabled_backend_count: 0,
      healthy_backend_count: 0,
      execution_classes: [
        {
          execution_class: "sandbox",
          available: false,
          backend_ids: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          reason:
            "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
        },
        {
          execution_class: "microvm",
          available: false,
          backend_ids: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          reason:
            "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
        }
      ],
      supported_languages: [],
      supported_profiles: [],
      supported_dependency_modes: [],
      supports_tool_execution: false,
      supports_builtin_package_sets: false,
      supports_network_policy: false
    });

    expect(formatSandboxReadinessHeadline(readiness)).toBe(
      "当前没有启用 sandbox backend；sandbox / microvm 等强隔离 execution class 会 fail-closed。"
    );
    expect(formatSandboxReadinessDetail(readiness)).toContain("Strong-isolation execution");
    expect(formatSandboxReadinessPreflightHint(readiness)).toContain(
      "当前 sandbox readiness：当前没有启用 sandbox backend；sandbox / microvm 等强隔离 execution class 会 fail-closed。"
    );
    expect(listSandboxAvailableClasses(readiness)).toEqual([]);
    expect(listSandboxBlockedClasses(readiness).map((entry) => entry.execution_class)).toEqual([
      "sandbox",
      "microvm"
    ]);
  });

  it("在部分 execution class blocked 时保留可用类与 offline 提示", () => {
    const readiness = createReadiness({
      offline_backend_count: 1,
      execution_classes: [
        {
          execution_class: "sandbox",
          available: true,
          backend_ids: ["sandbox-default"],
          supported_languages: ["python"],
          supported_profiles: ["default"],
          supported_dependency_modes: ["builtin"],
          supports_tool_execution: true,
          supports_builtin_package_sets: true,
          supports_backend_extensions: false,
          supports_network_policy: true,
          supports_filesystem_policy: false,
          reason: null
        },
        {
          execution_class: "microvm",
          available: false,
          backend_ids: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          reason:
            "Healthy sandbox backends do not currently advertise execution class 'microvm': sandbox-default."
        }
      ]
    });

    expect(formatSandboxReadinessHeadline(readiness)).toBe(
      "强隔离路径会按 execution class fail-closed：microvm 当前 blocked。"
    );
    expect(formatSandboxReadinessDetail(readiness)).toContain(
      "当前仍可复用的 execution class：sandbox。"
    );
    expect(formatSandboxReadinessPreflightHint(readiness)).toContain(
      "当前 sandbox readiness：强隔离路径会按 execution class fail-closed：microvm 当前 blocked。"
    );
    expect(formatSandboxReadinessDetail(readiness)).toContain("另有 1 个已启用 backend 处于 offline");
  });

  it("在链路可用时汇总 capability chips 与降级提醒", () => {
    const readiness = createReadiness({
      degraded_backend_count: 1,
      supports_tool_execution: true,
      supports_backend_extensions: true,
      supports_filesystem_policy: true
    });

    expect(formatSandboxReadinessHeadline(readiness)).toBe(
      "强隔离执行链路当前可用，但仍有 1 个已启用 backend 处于 degraded。"
    );
    expect(formatSandboxReadinessDetail(readiness)).toContain(
      "当前有 1 个已启用 backend 处于 degraded"
    );
    expect(listSandboxReadinessCapabilityChips(readiness)).toEqual([
      "tool execution",
      "builtin package sets",
      "backend extensions",
      "network policy",
      "filesystem policy"
    ]);
  });

  it("在 sandbox readiness 完全健康时不额外追加预检提示", () => {
    const readiness = createReadiness();

    expect(formatSandboxReadinessPreflightHint(readiness)).toBeNull();
  });

  it("对仍 blocked 的强隔离节点返回 live readiness 提示", () => {
    const readiness = createReadiness({
      execution_classes: [
        {
          execution_class: "sandbox",
          available: false,
          backend_ids: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          reason:
            "No sandbox backend is currently enabled. Strong-isolation execution must fail closed until a compatible backend is configured."
        }
      ]
    });

    const insight = buildSandboxExecutionReadinessInsight(readiness, createExecutionNode());

    expect(insight?.status).toBe("blocked");
    expect(insight?.headline).toBe(
      "当前 live sandbox readiness 显示 sandbox 仍 blocked。"
    );
    expect(insight?.detail).toContain("Strong-isolation execution must fail closed");
    expect(insight?.detail).toContain("同类强隔离路径重试仍会继续 fail-closed");
  });

  it("对 tool capability 尚未兑现的 ready backend 返回能力缺口提示", () => {
    const readiness = createReadiness({
      execution_classes: [
        {
          execution_class: "sandbox",
          available: true,
          backend_ids: ["sandbox-live"],
          supported_languages: ["python"],
          supported_profiles: ["default"],
          supported_dependency_modes: ["builtin"],
          supports_tool_execution: false,
          supports_builtin_package_sets: true,
          supports_backend_extensions: false,
          supports_network_policy: true,
          supports_filesystem_policy: false,
          reason: null
        }
      ]
    });

    const insight = buildSandboxExecutionReadinessInsight(readiness, createExecutionNode());

    expect(insight?.status).toBe("tool_capability_missing");
    expect(insight?.headline).toContain("还没有 sandbox-backed tool execution capability");
    expect(insight?.detail).toContain("sandbox ready via sandbox-live");
    expect(insight?.detail).toContain("tool 路径继续请求强隔离时仍应保持 fail-closed");
  });
});
