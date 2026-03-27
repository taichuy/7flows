import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorInspector } from "@/components/workflow-editor-inspector";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
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
    supports_filesystem_policy: false,
    affected_run_count: 4,
    affected_workflow_count: 1,
    primary_blocker_kind: "execution_class_blocked",
    recommended_action: {
      kind: "workflow library",
      entry_key: "workflowLibrary",
      href: "/workflows?execution=sandbox",
      label: "Open workflow library"
    }
  };
}

describe("WorkflowEditorInspector", () => {
  it("shows the shared save gate remediation summary inside inspector", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        selectedNode: null,
        selectedEdge: null,
        nodes: [],
        edges: [],
        tools: [],
        adapters: [],
        nodeConfigText: "{}",
        onNodeConfigTextChange: () => undefined,
        onApplyNodeConfigJson: () => undefined,
        onNodeNameChange: () => undefined,
        onNodeConfigChange: () => undefined,
        onNodeInputSchemaChange: () => undefined,
        onNodeOutputSchemaChange: () => undefined,
        onNodeRuntimePolicyUpdate: () => undefined,
        onNodeRuntimePolicyChange: () => undefined,
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        workflowVariables: [],
        workflowPublish: [],
        onWorkflowVariablesChange: () => undefined,
        onWorkflowPublishChange: () => undefined,
        onDeleteSelectedNode: () => undefined,
        onUpdateSelectedEdge: () => undefined,
        onDeleteSelectedEdge: () => undefined,
        persistBlockedMessage: "blocked",
        persistBlockerSummary:
          "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockers: [
          {
            id: "tool_execution",
            label: "Execution capability",
            detail: "当前 workflow definition 还有 execution capability 待修正问题。",
            nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ],
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Save gate");
    expect(html).toContain("Inspector remediation");
    expect(html).toContain("当前保存会被 2 类问题阻断");
    expect(html).toContain("Execution capability");
    expect(html).toContain("Publish draft");
    expect(html).toContain("adapter 绑定、execution class 与 sandbox readiness");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("Open workflow library");
  });

  it("hides duplicate save gate CTA inside inspector when hero already renders it", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        selectedNode: null,
        selectedEdge: null,
        nodes: [],
        edges: [],
        tools: [],
        adapters: [],
        nodeConfigText: "{}",
        onNodeConfigTextChange: () => undefined,
        onApplyNodeConfigJson: () => undefined,
        onNodeNameChange: () => undefined,
        onNodeConfigChange: () => undefined,
        onNodeInputSchemaChange: () => undefined,
        onNodeOutputSchemaChange: () => undefined,
        onNodeRuntimePolicyUpdate: () => undefined,
        onNodeRuntimePolicyChange: () => undefined,
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        workflowVariables: [],
        workflowPublish: [],
        onWorkflowVariablesChange: () => undefined,
        onWorkflowPublishChange: () => undefined,
        onDeleteSelectedNode: () => undefined,
        onUpdateSelectedEdge: () => undefined,
        onDeleteSelectedEdge: () => undefined,
        persistBlockedMessage: "blocked",
        persistBlockerSummary:
          "当前保存会被 2 类问题阻断：Execution capability / Publish draft。",
        persistBlockers: [
          {
            id: "tool_execution",
            label: "Execution capability",
            detail: "当前 workflow definition 还有 execution capability 待修正问题。",
            nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
          },
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ],
        persistBlockerRecommendedNextStep: {
          label: "sandbox readiness",
          detail:
            "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
          href: "/workflows?execution=sandbox",
          href_label: "Open workflow library"
        },
        sandboxReadiness: buildSandboxReadiness()
      })
    );

    expect(html).toContain("Save gate");
    expect(html).toContain("Inspector remediation");
    expect(html).toContain("当前保存会被 2 类问题阻断");
    expect(html.match(/Recommended next step/g)).toHaveLength(1);
    expect(html.match(/Open workflow library/g)).toHaveLength(1);
  });

  it("keeps node remediation handoff scoped to the current editor href", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorInspector, {
        currentHref: "/workflows/workflow-1?pane=editor&starter=starter-1",
        selectedNode: {
          id: "search",
          position: { x: 0, y: 0 },
          data: {
            label: "Search",
            nodeType: "tool",
            config: {
              tool: {
                toolId: "missing-tool",
                ecosystem: "native"
              }
            },
            inputSchema: {},
            outputSchema: {}
          }
        },
        selectedEdge: null,
        nodes: [
          {
            id: "search",
            position: { x: 0, y: 0 },
            data: {
              label: "Search",
              nodeType: "tool",
              config: {
                tool: {
                  toolId: "missing-tool",
                  ecosystem: "native"
                }
              },
              inputSchema: {},
              outputSchema: {}
            }
          }
        ],
        edges: [],
        tools: [],
        adapters: [],
        nodeConfigText: "{}",
        onNodeConfigTextChange: () => undefined,
        onApplyNodeConfigJson: () => undefined,
        onNodeNameChange: () => undefined,
        onNodeConfigChange: () => undefined,
        onNodeInputSchemaChange: () => undefined,
        onNodeOutputSchemaChange: () => undefined,
        onNodeRuntimePolicyUpdate: () => undefined,
        onNodeRuntimePolicyChange: () => undefined,
        workflowVersion: "1.0.0",
        availableWorkflowVersions: ["1.0.0"],
        workflowVariables: [],
        workflowPublish: [],
        onWorkflowVariablesChange: () => undefined,
        onWorkflowPublishChange: () => undefined,
        onDeleteSelectedNode: () => undefined,
        onUpdateSelectedEdge: () => undefined,
        onDeleteSelectedEdge: () => undefined,
        highlightedNodeSection: "config",
        highlightedNodeFieldPath: "config.tool.toolId",
        focusedValidationItem: {
          key: "tool-reference",
          category: "tool_reference",
          message: "Tool 节点 Search 引用了当前目录中不存在的工具 native.catalog-gap。",
          catalogGapToolIds: ["native.catalog-gap"],
          target: {
            scope: "node",
            nodeId: "search",
            section: "config",
            fieldPath: "config.tool.toolId",
            label: "Node · Search"
          }
        },
        persistBlockers: []
      })
    );

    expect(html).toContain("Node · Search · Tool id");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("pane=editor");
    expect(html).toContain("starter=starter-1");
    expect(html).toContain("definition_issue=missing_tool");
  });
});
