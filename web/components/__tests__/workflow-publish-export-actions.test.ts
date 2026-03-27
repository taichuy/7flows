import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowPublishExportActions } from "@/components/workflow-publish-export-actions";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

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

describe("WorkflowPublishExportActions", () => {
  it("shows live readiness guidance next to export actions", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishExportActions, {
        workflowId: "workflow-1",
        bindingId: "binding-1",
        activeInvocationFilter: null,
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("导出 activity JSON");
    expect(html).toContain("导出 activity JSONL");
    expect(html).toContain("历史 invocation 事实");
    expect(html).toContain("当前 sandbox readiness：");
    expect(html).toContain("fail-closed");
  });
});
