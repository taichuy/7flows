import { describe, expect, it } from "vitest";

import type { SkillReferenceLoadItem } from "@/lib/get-run-views";

import {
  buildCallbackWaitingFocusSkillTraceModel,
  pickCallbackWaitingSkillTraceForNode
} from "../callback-waiting-focus-skill-trace";

function createLoads(): SkillReferenceLoadItem[] {
  return [
    {
      phase: "planning",
      references: [
        {
          skill_id: "skill.search",
          skill_name: "Search Skill",
          reference_id: "ref-1",
          reference_name: "search-guideline",
          load_source: "explicit_request",
          fetch_reason: "operator asked for trace",
          fetch_request_index: 1,
          fetch_request_total: 1,
          retrieval_http_path: "/skills/search/ref-1",
          retrieval_mcp_method: null,
          retrieval_mcp_params: {}
        },
        {
          skill_id: "skill.search",
          skill_name: "Search Skill",
          reference_id: "ref-2",
          reference_name: "search-fallback",
          load_source: "binding",
          fetch_reason: null,
          fetch_request_index: null,
          fetch_request_total: null,
          retrieval_http_path: null,
          retrieval_mcp_method: "skills.read",
          retrieval_mcp_params: { skill_id: "skill.search" }
        }
      ]
    }
  ];
}

describe("buildCallbackWaitingFocusSkillTraceModel", () => {
  it("优先消费 execution focus skill trace", () => {
    const model = buildCallbackWaitingFocusSkillTraceModel({
      skillTrace: {
        scope: "execution_focus_node",
        reference_count: 3,
        phase_counts: { planning: 2, execution: 1 },
        source_counts: { explicit_request: 2, binding: 1 },
        nodes: [
          {
            node_run_id: "node-run-1",
            node_id: "agent_node",
            node_name: "Agent Node",
            reference_count: 3,
            loads: createLoads()
          }
        ]
      },
      fallbackNodeRunId: "node-run-fallback",
      fallbackLoads: createLoads(),
      fallbackReferenceCount: 2
    });

    expect(model).not.toBeNull();
    expect(model?.source).toBe("execution_focus_node");
    expect(model?.referenceCount).toBe(3);
    expect(model?.phaseSummary).toBe("planning 2 · execution 1");
    expect(model?.sourceSummary).toBe("explicit_request 2 · binding 1");
    expect(model?.nodes).toEqual([
      {
        key: "node-run-1:Agent Node",
        nodeRunId: "node-run-1",
        label: "Agent Node",
        loads: createLoads()
      }
    ]);
  });

  it("在没有共享 skill trace 时回退到 waiting 节点本地 loads", () => {
    const model = buildCallbackWaitingFocusSkillTraceModel({
      fallbackNodeRunId: "node-run-2",
      fallbackNodeId: "tool_wait",
      fallbackNodeName: "Tool Wait",
      fallbackLoads: createLoads(),
      fallbackReferenceCount: 2
    });

    expect(model).not.toBeNull();
    expect(model?.source).toBe("node_loads");
    expect(model?.referenceCount).toBe(2);
    expect(model?.phaseSummary).toBe("planning 2");
    expect(model?.sourceSummary).toBe("explicit_request 1 · binding 1");
    expect(model?.nodes).toEqual([
      {
        key: "node-run-2:Tool Wait",
        nodeRunId: "node-run-2",
        label: "Tool Wait",
        loads: createLoads()
      }
    ]);
  });

  it("在没有任何可展示引用时返回 null", () => {
    expect(
      buildCallbackWaitingFocusSkillTraceModel({
        fallbackNodeRunId: "node-run-3",
        fallbackLoads: [],
        fallbackReferenceCount: 0
      })
    ).toBeNull();
  });

  it("会把 run 级 skill trace 收敛成当前 waiting 节点范围", () => {
    const skillTrace = pickCallbackWaitingSkillTraceForNode(
      {
        scope: "run",
        reference_count: 4,
        phase_counts: { planning: 3, execution: 1 },
        source_counts: { explicit_request: 3, binding: 1 },
        nodes: [
          {
            node_run_id: "node-run-target",
            node_id: "tool_wait",
            node_name: "Tool Wait",
            reference_count: 2,
            loads: createLoads()
          },
          {
            node_run_id: "node-run-other",
            node_id: "agent_node",
            node_name: "Agent Node",
            reference_count: 2,
            loads: [
              {
                phase: "execution",
                references: [
                  {
                    skill_id: "skill.other",
                    skill_name: "Other Skill",
                    reference_id: "ref-3",
                    reference_name: "other-guideline",
                    load_source: "explicit_request",
                    fetch_reason: null,
                    fetch_request_index: null,
                    fetch_request_total: null,
                    retrieval_http_path: null,
                    retrieval_mcp_method: null,
                    retrieval_mcp_params: {}
                  },
                  {
                    skill_id: "skill.other",
                    skill_name: "Other Skill",
                    reference_id: "ref-4",
                    reference_name: "other-fallback",
                    load_source: "binding",
                    fetch_reason: null,
                    fetch_request_index: null,
                    fetch_request_total: null,
                    retrieval_http_path: null,
                    retrieval_mcp_method: null,
                    retrieval_mcp_params: {}
                  }
                ]
              }
            ]
          }
        ]
      },
      "node-run-target"
    );

    expect(skillTrace).toEqual({
      scope: "run",
      reference_count: 2,
      phase_counts: { planning: 2 },
      source_counts: { explicit_request: 1, binding: 1 },
      nodes: [
        {
          node_run_id: "node-run-target",
          node_id: "tool_wait",
          node_name: "Tool Wait",
          reference_count: 2,
          loads: createLoads()
        }
      ]
    });
  });
});
