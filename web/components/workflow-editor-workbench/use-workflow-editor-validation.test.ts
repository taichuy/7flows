import { describe, expect, it } from "vitest";

import type { WorkflowDetail } from "@/lib/get-workflows";
import { buildWorkflowValidationNavigatorItems } from "@/lib/workflow-validation-navigation";

import {
  buildWorkflowEditorPublishDraftIssues,
  summarizeWorkspaceStarterValidationIssues,
  summarizePreflightIssues
} from "./use-workflow-editor-validation";

function createDefinition(): WorkflowDetail["definition"] {
  return {
    nodes: [],
    edges: [],
    variables: [],
    publish: [
      {
        id: "search",
        name: "Public Search",
        alias: "Search.Main",
        path: "/Search/Main",
        protocol: "native",
        authMode: "api_key",
        streaming: true,
        workflowVersion: "9.9.9",
        inputSchema: {
          type: "funky"
        },
        outputSchema: {
          type: "object"
        },
        cache: {
          enabled: true,
          ttl: 60,
          maxEntries: 128,
          varyBy: ["tenant", "tenant"]
        }
      },
      {
        id: "result",
        name: "Public Search",
        alias: "search.main",
        path: "/search/main",
        protocol: "openai",
        authMode: "token",
        streaming: false,
        inputSchema: {
          type: "object"
        }
      }
    ]
  };
}

describe("buildWorkflowEditorPublishDraftIssues", () => {
  it("maps publish draft validation into shared preflight issues", () => {
    const issues = buildWorkflowEditorPublishDraftIssues(createDefinition(), ["1.0.0", "1.0.1"]);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "publish_version",
          path: "publish.0.workflowVersion",
          field: "workflowVersion"
        }),
        expect.objectContaining({
          category: "publish_draft",
          path: "publish.0.inputSchema",
          field: "inputSchema"
        }),
        expect.objectContaining({
          category: "publish_draft",
          path: "publish.0.cache.varyBy",
          field: "cache.varyBy"
        }),
        expect.objectContaining({
          category: "publish_draft",
          path: "publish.0.name",
          field: "name"
        }),
        expect.objectContaining({
          category: "publish_draft",
          path: "publish.0.alias",
          field: "alias"
        }),
        expect.objectContaining({
          category: "publish_draft",
          path: "publish.0.path",
          field: "path"
        }),
        expect.objectContaining({
          category: "publish_draft",
          path: "publish.1.authMode",
          field: "authMode"
        })
      ])
    );
    expect(
      issues.find((issue) => issue.path === "publish.1.authMode")?.message
    ).toContain("Publish auth contract");
    expect(
      issues.find((issue) => issue.path === "publish.1.authMode")?.message
    ).toContain("supported api_key / internal");
  });

  it("keeps publish draft issues navigable by the shared validation navigator", () => {
    const definition = createDefinition();
    const issues = buildWorkflowEditorPublishDraftIssues(definition, ["1.0.0", "1.0.1"]);

    const navigatorItems = buildWorkflowValidationNavigatorItems(definition, issues);

    expect(navigatorItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "publish_version",
          target: expect.objectContaining({
            scope: "publish",
            endpointIndex: 0,
            fieldPath: "workflowVersion",
            label: "Publish · Public Search"
          })
        }),
        expect.objectContaining({
          category: "publish_draft",
          target: expect.objectContaining({
            scope: "publish",
            endpointIndex: 1,
            fieldPath: "authMode",
            label: "Publish · Public Search"
          })
        })
      ])
    );
  });

  it("keeps catalog-gap metadata on shared validation navigator items", () => {
    const navigatorItems = buildWorkflowValidationNavigatorItems(
      {
        nodes: [
          {
            id: "search",
            name: "Search"
          }
        ],
        publish: [],
        variables: []
      },
      [
        {
          category: "tool_reference",
          message: "Tool 节点 Search (search) 引用了当前目录中不存在的工具 native.catalog-gap。",
          path: "nodes.0.config.tool.toolId",
          field: "toolId",
          catalogGapToolIds: ["native.catalog-gap", "native.catalog-gap"]
        }
      ]
    );

    expect(navigatorItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "tool_reference",
          catalogGapToolIds: ["native.catalog-gap"],
          target: expect.objectContaining({
            scope: "node",
            nodeId: "search",
            fieldPath: "config.tool.toolId",
            label: "Node · Search"
          })
        })
      ])
    );
  });

  it("summarizes legacy publish auth preflight issues with the shared auth contract", () => {
    const summary = summarizePreflightIssues([
      {
        category: "publish_draft",
        message: "Public Search 当前不能使用 authMode = token。",
        path: "publish.1.authMode",
        field: "authMode"
      }
    ]);

    expect(summary).toContain("publish draft");
    expect(summary).toContain("Publish auth contract");
    expect(summary).toContain("legacy token");
    expect(summary).not.toContain("publish.1.authMode");
  });

  it("summarizes missing tool reference preflight issues as catalog gaps", () => {
    const summary = summarizePreflightIssues([
      {
        category: "tool_reference",
        message: "Tool node 'search:Search' references missing catalog tool 'native.catalog-gap'.",
        path: "nodes.0.config.tool.toolId",
        field: "toolId"
      },
      {
        category: "tool_reference",
        message:
          "LLM agent node 'agent:Planner' toolPolicy.allowedToolIds references missing catalog tools: native.catalog-gap, native.second-gap.",
        path: "nodes.1.config.toolPolicy.allowedToolIds",
        field: "allowedToolIds"
      }
    ]);

    expect(summary).toBe("catalog gap · native.catalog-gap、native.second-gap");
    expect(summary).not.toContain("tool reference");
    expect(summary).not.toContain("allowedToolIds");
  });

  it("summarizes workspace starter missing tool issues as catalog gaps", () => {
    const summary = summarizeWorkspaceStarterValidationIssues([
      {
        category: "tool_reference",
        message:
          "LLM agent node 'agent:Planner' toolPolicy.allowedToolIds references missing catalog tools: native.catalog-gap, native.second-gap.",
        path: "nodes.1.config.toolPolicy.allowedToolIds",
        field: "allowedToolIds"
      }
    ]);

    expect(summary).toBe("catalog gap · native.catalog-gap、native.second-gap");
    expect(summary).not.toContain("tool reference");
  });
});
