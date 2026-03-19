import { describe, expect, it } from "vitest";

import type { SandboxReadinessCheck } from "./get-system-overview";
import {
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
});
