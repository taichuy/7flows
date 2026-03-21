import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorPublishForm } from "@/components/workflow-editor-publish-form";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

vi.mock("@/components/workflow-editor-publish-endpoint-card", () => ({
  WorkflowEditorPublishEndpointCard: ({ endpointIndex }: { endpointIndex: number }) =>
    createElement("div", null, `endpoint-card:${endpointIndex}`)
}));

function buildSandboxReadiness(): SandboxReadinessCheck {
  return {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
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
    ],
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false
  };
}

describe("WorkflowEditorPublishForm", () => {
  it("shows live sandbox readiness alongside publish drafts", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishForm, {
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        publishEndpoints: [],
        sandboxReadiness: buildSandboxReadiness(),
        onChange: () => undefined
      })
    );

    expect(html).toContain("Published endpoints");
    expect(html).toContain("strong-isolation / capability");
    expect(html).toContain("当前 sandbox readiness：");
    expect(html).toContain("fail-closed");
  });

  it("shows field-level remediation when a publish validation issue is focused", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "publish-version",
      category: "publish_version",
      message: "Public Search 绑定了不存在的 workflow version。",
      target: {
        scope: "publish",
        endpointIndex: 0,
        fieldPath: "workflowVersion",
        label: "Publish · Public Search"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishForm, {
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        publishEndpoints: [],
        sandboxReadiness: buildSandboxReadiness(),
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Publish · Public Search · Workflow version");
    expect(html).toContain("如果这个 endpoint 要跟随本次保存生成的新版本");
  });

  it("shows the shared save gate summary for publish blockers", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishForm, {
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        publishEndpoints: [],
        persistBlockers: [
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题：版本绑定无效。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ],
        onChange: () => undefined
      })
    );

    expect(html).toContain("Publish save gate");
    expect(html).toContain("当前保存会被 1 类问题阻断：Publish draft。");
    expect(html).toContain("请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置");
  });
});
