import { describe, expect, it } from "vitest";

import {
  buildOperatorInlineActionFeedbackModel,
  hasStructuredOperatorInlineActionResult
} from "@/lib/operator-inline-action-feedback";

describe("operator inline action feedback", () => {
  it("builds a structured model from canonical explanations and snapshot evidence", () => {
    const model = buildOperatorInlineActionFeedbackModel({
      message: "审批已通过。",
      outcomeExplanation: {
        primary_signal: "审批已通过。",
        follow_up: "后端已把 waiting blocker 交回 runtime。"
      },
      runFollowUpExplanation: {
        primary_signal: "本次影响 1 个 run；整体状态分布：running 1。已回读 1 个样本。",
        follow_up: "run run-1：当前 run 状态：running。 当前节点：review。 重点信号：runtime 已继续推进。"
      },
      blockerDeltaSummary: "阻塞变化：已解除 approval pending。",
      runSnapshot: {
        status: "running",
        currentNodeId: "review",
        executionFocusNodeName: "Review",
        executionFocusArtifactCount: 1,
        executionFocusArtifactRefCount: 2,
        executionFocusToolCallCount: 3,
        executionFocusRawRefCount: 1,
        executionFocusExplanation: {
          primary_signal: "runtime 已继续推进。",
          follow_up: "继续观察后续节点。"
        }
      }
    });

    expect(model.hasStructuredContent).toBe(true);
    expect(model.headline).toBe("审批已通过。");
    expect(model.outcomeFollowUp).toBe("后端已把 waiting blocker 交回 runtime。");
    expect(model.runFollowUpPrimarySignal).toContain("本次影响 1 个 run");
    expect(model.runFollowUpFollowUp).toContain("run run-1");
    expect(model.blockerDeltaSummary).toBe("阻塞变化：已解除 approval pending。");
    expect(model.runStatus).toBe("running");
    expect(model.currentNodeId).toBe("review");
    expect(model.focusNodeLabel).toBe("Review");
    expect(model.artifactCount).toBe(1);
    expect(model.artifactRefCount).toBe(2);
    expect(model.toolCallCount).toBe(3);
    expect(model.rawRefCount).toBe(1);
  });

  it("detects when only plain text exists without structured follow-up", () => {
    expect(
      hasStructuredOperatorInlineActionResult({
        outcomeExplanation: null,
        runFollowUpExplanation: null,
        blockerDeltaSummary: null,
        runSnapshot: null
      })
    ).toBe(false);
  });

  it("把 compact run snapshot 的 tool execution evidence 转成可复用卡片模型", () => {
    const model = buildOperatorInlineActionFeedbackModel({
      outcomeExplanation: {
        primary_signal: "审批已通过，对应 waiting 链路已交回 runtime 恢复。"
      },
      runSnapshot: {
        status: "waiting",
        currentNodeId: "sandbox_tool",
        executionFocusNodeName: "Sandbox Tool",
        executionFocusNodeRunId: "node-run-1",
        executionFocusArtifactCount: 1,
        executionFocusArtifactRefCount: 1,
        executionFocusToolCallCount: 1,
        executionFocusRawRefCount: 1,
        executionFocusArtifactRefs: ["artifact://focus-1"],
        executionFocusArtifacts: [
          {
            artifact_kind: "tool_result",
            content_type: "application/json",
            summary: "聚焦节点已产出结构化 tool result。",
            uri: "artifact://focus-1"
          }
        ],
        executionFocusToolCalls: [
          {
            id: "tool-call-1",
            tool_id: "sandbox.search",
            tool_name: "Sandbox Search",
            phase: "execute",
            status: "completed",
            effective_execution_class: "sandbox",
            execution_sandbox_backend_id: "sandbox-default",
            execution_sandbox_runner_kind: "tool",
            response_summary: "搜索结果已回写 artifact。",
            response_content_type: "application/json",
            raw_ref: "artifact://tool-call-raw"
          }
        ]
      }
    });

    expect(model.focusArtifactSummary).toBe(
      "聚焦节点已沉淀 1 个 artifact（tool_result 1）。 run artifact refs 1 条。 至少 1 条 tool call 已把原始结果落到 raw_ref，可直接回看 sandbox / tool 输出。"
    );
    expect(model.focusToolCallSummaries).toEqual([
      {
        id: "tool-call-1",
        title: "Sandbox Search · completed",
        detail: "搜索结果已回写 artifact。",
        badges: [
          "phase execute",
          "effective sandbox",
          "backend sandbox-default",
          "runner tool",
          "content application/json",
          "raw payload"
        ],
        rawRef: "artifact://tool-call-raw"
      }
    ]);
    expect(model.focusArtifacts).toEqual([
      {
        key: "artifact://focus-1",
        artifactKind: "tool_result",
        contentType: "application/json",
        summary: "聚焦节点已产出结构化 tool result。",
        uri: "artifact://focus-1"
      }
    ]);
  });

  it("把 compact run snapshot 的 focused skill trace 转成可复用结果模型", () => {
    const model = buildOperatorInlineActionFeedbackModel({
      runSnapshot: {
        status: "waiting",
        executionFocusNodeName: "Agent Review",
        executionFocusSkillTrace: {
          reference_count: 2,
          phase_counts: { main_plan: 2 },
          source_counts: { retrieval_query_match: 1, skill_binding: 1 },
          loads: [
            {
              phase: "main_plan",
              references: [
                {
                  skill_id: "skill-research-brief",
                  skill_name: "Research Brief",
                  reference_id: "ref-handoff",
                  reference_name: "Operator Handoff",
                  load_source: "skill_binding",
                  fetch_reason: null,
                  fetch_request_index: null,
                  fetch_request_total: null,
                  retrieval_http_path:
                    "/api/skills/skill-research-brief/references/ref-handoff?workspace_id=default",
                  retrieval_mcp_method: "skills.get_reference",
                  retrieval_mcp_params: {
                    skill_id: "skill-research-brief",
                    reference_id: "ref-handoff",
                    workspace_id: "default"
                  }
                },
                {
                  skill_id: "skill-research-brief",
                  skill_name: "Research Brief",
                  reference_id: "ref-budget",
                  reference_name: "Budget Control",
                  load_source: "retrieval_query_match",
                  fetch_reason: "Matched query terms: budget, guardrails",
                  fetch_request_index: null,
                  fetch_request_total: null,
                  retrieval_http_path:
                    "/api/skills/skill-research-brief/references/ref-budget?workspace_id=default",
                  retrieval_mcp_method: "skills.get_reference",
                  retrieval_mcp_params: {
                    skill_id: "skill-research-brief",
                    reference_id: "ref-budget",
                    workspace_id: "default"
                  }
                }
              ]
            }
          ]
        }
      }
    });

    expect(model.hasStructuredContent).toBe(true);
    expect(model.skillReferenceCount).toBe(2);
    expect(model.skillReferencePhaseSummary).toBe("main_plan 2");
    expect(model.skillReferenceSourceSummary).toBe(
      "retrieval_query_match 1, skill_binding 1"
    );
    expect(model.focusSkillReferenceLoads).toHaveLength(1);
    expect(model.focusSkillReferenceLoads[0]?.references).toHaveLength(2);
  });
});
