import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToolNodeConfigForm } from "@/components/workflow-node-config-form/tool-node-config-form";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

function buildTool(): PluginToolRegistryItem {
  return {
    id: "tool-1",
    name: "Search Tool",
    description: "Native search tool",
    ecosystem: "native",
    source: "catalog",
    callable: true,
    supported_execution_classes: ["inline"],
    default_execution_class: "inline",
    sensitivity_level: "L1",
    input_schema: { type: "object", properties: {} },
    output_schema: { type: "object", properties: {} }
  };
}

describe("ToolNodeConfigForm", () => {
  it("shows field-level remediation for focused tool binding issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "tool-binding-tool-id",
      category: "tool_reference",
      message: "tool binding 指向了当前 catalog 中不存在的 tool id。",
      target: {
        scope: "node",
        nodeId: "node-1",
        section: "config",
        fieldPath: "config.tool.toolId",
        label: "Node 路 Search"
      }
    };

    const html = renderToStaticMarkup(
      createElement(ToolNodeConfigForm, {
        node: {
          id: "node-1",
          data: {
            config: {
              tool: {
                toolId: "missing-tool",
                ecosystem: "native"
              }
            }
          }
        } as never,
        tools: [buildTool()],
        highlightedFieldPath: "config.tool.toolId",
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node 路 Search · Tool id");
    expect(html).toContain("tool binding 指向了当前 catalog 中不存在的 tool id");
    expect(html).toContain("validation-focus-ring");
  });
});
