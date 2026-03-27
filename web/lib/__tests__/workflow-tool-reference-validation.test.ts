import { describe, expect, it } from "vitest";

import { buildWorkflowToolReferenceValidationIssues } from "@/lib/workflow-tool-reference-validation";

describe("workflow tool reference validation", () => {
  it("captures missing tool ids for tool nodes", () => {
    const issues = buildWorkflowToolReferenceValidationIssues(
      {
        nodes: [
          {
            id: "tool-node-1",
            type: "tool",
            name: "Search tool",
            config: {
              tool: {
                toolId: "native.catalog-gap"
              }
            }
          }
        ]
      },
      [
        {
          id: "native.available",
          name: "Available tool",
          ecosystem: "native",
          description: "Available tool",
          input_schema: {},
          source: "registry",
          callable: true,
          supported_execution_classes: ["host"]
        }
      ]
    );

    expect(issues).toEqual([
      expect.objectContaining({
        nodeId: "tool-node-1",
        toolIds: ["native.catalog-gap"],
        field: "toolId"
      })
    ]);
  });

  it("deduplicates and sorts missing tool ids for llm agent allow lists", () => {
    const issues = buildWorkflowToolReferenceValidationIssues(
      {
        nodes: [
          {
            id: "agent-node-1",
            type: "llm_agent",
            name: "Planner",
            config: {
              toolPolicy: {
                allowedToolIds: [
                  "native.second-gap",
                  "native.catalog-gap",
                  "native.catalog-gap",
                  "native.available"
                ]
              }
            }
          }
        ]
      },
      [
        {
          id: "native.available",
          name: "Available tool",
          ecosystem: "native",
          description: "Available tool",
          input_schema: {},
          source: "registry",
          callable: true,
          supported_execution_classes: ["host"]
        }
      ]
    );

    expect(issues).toEqual([
      expect.objectContaining({
        nodeId: "agent-node-1",
        toolIds: ["native.catalog-gap", "native.second-gap"],
        field: "allowedToolIds"
      })
    ]);
  });
});
