import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowNodeRuntimePolicyForm } from "@/components/workflow-node-config-form/runtime-policy-form";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("WorkflowNodeRuntimePolicyForm", () => {
  it("shows field-level remediation for focused retry issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "runtime-retry-max-attempts",
      category: "schema",
      message: "runtimePolicy.retry.maxAttempts 必须大于等于 1。",
      target: {
        scope: "node",
        nodeId: "formatter",
        section: "runtime",
        fieldPath: "runtimePolicy.retry.maxAttempts",
        label: "Node · Formatter"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowNodeRuntimePolicyForm, {
        node: {
          id: "formatter",
          data: {
            nodeType: "transform",
            runtimePolicy: {
              retry: {
                maxAttempts: 0
              }
            }
          }
        } as never,
        nodes: [],
        edges: [],
        highlightedFieldPath: "runtimePolicy.retry.maxAttempts",
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node · Formatter · Max attempts");
    expect(html).toContain("把重试次数改回");
    expect(html).toContain('data-validation-field="retry.maxAttempts"');
    expect(html).toContain("validation-focus-ring");
  });

  it("shows field-level remediation for focused join issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "runtime-join-required-node-ids",
      category: "schema",
      message: "runtimePolicy.join.requiredNodeIds 引用了当前非入边来源。",
      target: {
        scope: "node",
        nodeId: "joiner",
        section: "runtime",
        fieldPath: "runtimePolicy.join.requiredNodeIds",
        label: "Node · Joiner"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowNodeRuntimePolicyForm, {
        node: {
          id: "joiner",
          data: {
            label: "Joiner",
            nodeType: "transform",
            runtimePolicy: {
              join: {
                mode: "all",
                requiredNodeIds: ["planner", "ghost"]
              }
            }
          }
        } as never,
        nodes: [
          {
            id: "planner",
            data: {
              label: "Planner",
              nodeType: "llm_agent"
            }
          },
          {
            id: "fetcher",
            data: {
              label: "Fetcher",
              nodeType: "tool"
            }
          }
        ] as never,
        edges: [
          {
            id: "edge-1",
            source: "planner",
            target: "joiner",
            data: {}
          },
          {
            id: "edge-2",
            source: "fetcher",
            target: "joiner",
            data: {}
          }
        ] as never,
        highlightedFieldPath: "runtimePolicy.join.requiredNodeIds",
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node · Joiner · Required upstream nodes");
    expect(html).toContain("把 required upstream nodes 收口到当前真实入边来源");
    expect(html).toContain('data-validation-field="join.requiredNodeIds"');
    expect(html).toContain("validation-focus-ring");
  });
});
