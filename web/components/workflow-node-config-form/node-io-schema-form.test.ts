import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowNodeIoSchemaForm } from "@/components/workflow-node-config-form/node-io-schema-form";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("WorkflowNodeIoSchemaForm", () => {
  it("shows field-level remediation for focused contract issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "node-input-schema",
      category: "schema",
      message: "节点 input schema 不是合法 contract object。",
      target: {
        scope: "node",
        nodeId: "node-1",
        section: "contract",
        fieldPath: "inputSchema.properties.query",
        label: "Node 路 Agent"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowNodeIoSchemaForm, {
        node: {
          id: "node-1",
          data: {
            nodeType: "llm_agent",
            inputSchema: { type: "object", properties: {} },
            outputSchema: { type: "object", properties: {} }
          }
        } as never,
        highlighted: true,
        highlightedFieldPath: "inputSchema.properties.query",
        focusedValidationItem,
        onInputSchemaChange: () => undefined,
        onOutputSchemaChange: () => undefined
      })
    );

    expect(html).toContain("Node 路 Agent · Input schema");
    expect(html).toContain("节点 input schema 不是合法 contract object");
    expect(html).toContain("validation-focus-ring");
  });
});
