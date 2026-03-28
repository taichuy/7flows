import { describe, expect, it } from "vitest";

import {
  buildWorkflowEditorAssistantContext,
  buildWorkflowEditorAssistantReply,
  createWorkflowEditorAssistantGreeting
} from "@/lib/workflow-editor-assistant";
import type { WorkflowCanvasEdgeData, WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import type { Edge, Node } from "@xyflow/react";

function buildNode(
  id: string,
  label: string,
  nodeType: string,
  options?: Partial<WorkflowCanvasNodeData>
): Node<WorkflowCanvasNodeData> {
  return {
    id,
    type: "workflowNode",
    position: { x: 0, y: 0 },
    data: {
      label,
      nodeType,
      config: {},
      runtimePolicy: {},
      inputSchema: {},
      outputSchema: {},
      ...options
    }
  } as Node<WorkflowCanvasNodeData>;
}

describe("workflow-editor-assistant", () => {
  it("builds selected node context from adjacent edges", () => {
    const trigger = buildNode("trigger-1", "Trigger", "trigger");
    const agent = buildNode("agent-1", "Agent", "llm_agent", {
      runtimePolicy: {
        execution: {
          class: "sandbox"
        }
      }
    });
    const output = buildNode("output-1", "Output", "output");
    const edges = [
      {
        id: "edge-1",
        source: trigger.id,
        target: agent.id,
        data: { channel: "control" }
      },
      {
        id: "edge-2",
        source: agent.id,
        target: output.id,
        data: { channel: "control" }
      }
    ] as Array<Edge<WorkflowCanvasEdgeData>>;

    const context = buildWorkflowEditorAssistantContext({
      selectedNode: agent,
      nodes: [trigger, agent, output],
      edges,
      sandboxReadiness: {
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
            reason: "sandbox unavailable"
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
      }
    });

    expect(context.upstreamLabels).toEqual(["Trigger"]);
    expect(context.downstreamLabels).toEqual(["Output"]);
    expect(context.executionClass).toBe("sandbox");
    expect(context.runtimeHint).toContain("fail-closed");
    expect(context.promptSuggestions[0]).toContain("怎么配");
  });

  it("returns targeted replies for config, next-node and risk prompts", () => {
    const selectedNode = buildNode("tool-1", "Search", "tool", {
      inputSchema: null,
      outputSchema: null
    });
    const context = buildWorkflowEditorAssistantContext({
      selectedNode,
      nodes: [selectedNode],
      edges: []
    });

    expect(createWorkflowEditorAssistantGreeting(context)).toContain("已载入 Search 节点上下文");
    expect(buildWorkflowEditorAssistantReply(context, "帮我检查这个节点怎么配")).toContain(
      "补一个最小 input schema"
    );
    expect(buildWorkflowEditorAssistantReply(context, "下一步应该接什么节点")).toContain(
      "接一个 AI / Agent 节点"
    );
    expect(buildWorkflowEditorAssistantReply(context, "这个节点有什么运行风险")).toContain(
      "当前节点的运行关注点"
    );
  });
});
