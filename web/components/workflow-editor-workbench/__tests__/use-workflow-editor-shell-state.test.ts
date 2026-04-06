import { describe, expect, it } from "vitest";

import {
  areWorkflowDefinitionPreflightIssuesEqual,
  resolveWorkflowEditorInspectorFocusState,
  resolveWorkflowEditorPanelCollapsedPreference
} from "@/components/workflow-editor-workbench/use-workflow-editor-shell-state";

describe("resolveWorkflowEditorPanelCollapsedPreference", () => {
  it("defaults editor rails to expanded until a preference explicitly closes them", () => {
    expect(resolveWorkflowEditorPanelCollapsedPreference(null)).toBe(false);
    expect(resolveWorkflowEditorPanelCollapsedPreference("true")).toBe(true);
    expect(resolveWorkflowEditorPanelCollapsedPreference("false")).toBe(false);
  });

  it("resets legacy panel preferences back to the fixed-rails default", () => {
    expect(resolveWorkflowEditorPanelCollapsedPreference("true", null)).toBe(false);
    expect(resolveWorkflowEditorPanelCollapsedPreference("true", "legacy-editor-layout")).toBe(
      false
    );
  });
});

describe("resolveWorkflowEditorInspectorFocusState", () => {
  it("only keeps node highlights when the focused issue matches the selected node", () => {
    const focused = resolveWorkflowEditorInspectorFocusState(
      {
        key: "node:config.model",
        category: "missing_field",
        message: "LLM 节点缺少 model",
        target: {
          scope: "node",
          nodeId: "node-2",
          section: "config",
          fieldPath: "config.model",
          label: "LLM 节点 config"
        }
      },
      "node-1"
    );

    expect(focused.highlightedNodeSection).toBeNull();
    expect(focused.highlightedNodeFieldPath).toBeNull();
    expect(focused.highlightedPublishEndpointIndex).toBeNull();
  });

  it("keeps workflow-level publish focus even when no node is selected", () => {
    const focused = resolveWorkflowEditorInspectorFocusState(
      {
        key: "publish:workflowVersion",
        category: "publish_version",
        message: "发布版本不合法",
        target: {
          scope: "publish",
          endpointIndex: 1,
          fieldPath: "workflowVersion",
          label: "发布端点版本"
        }
      },
      null
    );

    expect(focused.highlightedPublishEndpointIndex).toBe(1);
    expect(focused.highlightedPublishEndpointFieldPath).toBe("workflowVersion");
    expect(focused.highlightedNodeSection).toBeNull();
    expect(focused.highlightedVariableIndex).toBeNull();
  });
});

describe("areWorkflowDefinitionPreflightIssuesEqual", () => {
  it("treats missing and empty issue collections as equivalent", () => {
    expect(areWorkflowDefinitionPreflightIssuesEqual(undefined, [])).toBe(true);
    expect(areWorkflowDefinitionPreflightIssuesEqual(null, [])).toBe(true);
  });

  it("matches issue arrays by value instead of array identity", () => {
    expect(
      areWorkflowDefinitionPreflightIssuesEqual(
        [
          {
            category: "schema",
            message: "缺少节点配置",
            path: "nodes[0].config",
            field: "config"
          }
        ],
        [
          {
            category: "schema",
            message: "缺少节点配置",
            path: "nodes[0].config",
            field: "config"
          }
        ]
      )
    ).toBe(true);

    expect(
      areWorkflowDefinitionPreflightIssuesEqual(
        [
          {
            category: "schema",
            message: "缺少节点配置"
          }
        ],
        [
          {
            category: "schema",
            message: "节点配置无效"
          }
        ]
      )
    ).toBe(false);
  });
});
