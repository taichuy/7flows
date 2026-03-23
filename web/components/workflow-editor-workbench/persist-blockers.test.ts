import { describe, expect, it } from "vitest";

import {
  buildWorkflowPersistBlockerRecommendedNextStep,
  buildWorkflowPersistBlockers,
  formatWorkflowPersistBlockedMessage,
  summarizeWorkflowPersistBlockers
} from "@/components/workflow-editor-workbench/persist-blockers";

describe("workflow persist blockers", () => {
  it("builds a canonical save gate summary and blocked message", () => {
    const blockers = buildWorkflowPersistBlockers({
      unsupportedNodeCount: 1,
      unsupportedNodeSummary: "Loop x1",
      toolExecutionValidationSummary:
        "Tool 节点请求 sandbox execution，但当前 capability 还没有暴露 dependencyRef 支持",
      sandboxReadinessPreflightHint:
        "当前 sandbox readiness：当前没有启用 sandbox backend；sandbox / microvm 等强隔离 execution class 会 fail-closed。",
      publishDraftValidationSummary: "publish.0.path 重复"
    });

    expect(blockers.map((blocker) => blocker.label)).toEqual([
      "Unsupported nodes",
      "Execution capability",
      "Publish draft"
    ]);
    expect(summarizeWorkflowPersistBlockers(blockers)).toBe(
      "当前保存会被 3 类问题阻断：Unsupported nodes / Execution capability / Publish draft。"
    );
    expect(formatWorkflowPersistBlockedMessage(blockers)).toContain("Loop x1");
    expect(formatWorkflowPersistBlockedMessage(blockers)).toContain("sandbox backend");
    expect(formatWorkflowPersistBlockedMessage(blockers)).toContain("publish.0.path 重复");
  });

  it("reuses shared sandbox readiness CTA for execution-related save gates", () => {
    const recommendedNextStep = buildWorkflowPersistBlockerRecommendedNextStep(
      [
        {
          id: "tool_execution",
          label: "Execution capability",
          detail:
            "当前 workflow definition 还有 execution capability 待修正问题：Tool 节点请求 sandbox execution，但当前 capability 还没有暴露 dependencyRef 支持。",
          nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
        }
      ],
      {
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "workflow library",
          entry_key: "workflowLibrary",
          href: "/workflows?execution=sandbox",
          label: "Open workflow library"
        }
      }
    );

    expect(recommendedNextStep).toEqual({
      label: "sandbox readiness",
      detail:
        "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library"
    });
  });

  it("drops shared sandbox CTA links when the current page already matches it", () => {
    const recommendedNextStep = buildWorkflowPersistBlockerRecommendedNextStep(
      [
        {
          id: "tool_execution",
          label: "Execution capability",
          detail:
            "当前 workflow definition 还有 execution capability 待修正问题：Tool 节点请求 sandbox execution，但当前 capability 还没有暴露 dependencyRef 支持。",
          nextStep: "请先对齐 adapter 绑定、execution class 与 sandbox readiness，再继续保存。"
        }
      ],
      {
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "workflow library",
          entry_key: "workflowLibrary",
          href: "/workflows?execution=sandbox",
          label: "Open workflow library"
        }
      },
      "/workflows?execution=sandbox"
    );

    expect(recommendedNextStep).toEqual({
      label: "sandbox readiness",
      detail:
        "当前 live sandbox readiness 仍影响 4 个 run / 1 个 workflow；优先回到 workflow library 处理强隔离 execution class 与隔离需求。",
      href: null,
      href_label: null
    });
  });
});
