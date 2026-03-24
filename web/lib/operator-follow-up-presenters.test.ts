import { describe, expect, it } from "vitest";

import {
  buildOperatorExecutionTimelineLinkSurface,
  buildOperatorRecommendedActionCandidate,
  buildOperatorNavigationCandidate,
  buildOperatorInboxSliceLinkSurface,
  buildOperatorInboxSliceCandidate,
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRecommendedNextStep,
  buildRequiredOperatorRunDetailLinkSurface,
  buildOperatorRunDetailLinkSurface,
  buildOperatorRunDetailCandidate,
  buildOperatorTraceSliceLinkSurface,
  buildSharedOrLocalOperatorCandidate,
  buildOperatorRunSnapshotMetaRows,
  formatOperatorOpenRunLinkLabel
} from "./operator-follow-up-presenters";

describe("operator follow-up presenters", () => {
  it("提供共享 operator follow-up surface copy", () => {
    expect(buildOperatorFollowUpSurfaceCopy()).toEqual({
      operatorFollowUpTitle: "Operator follow-up",
      canonicalOperatorFollowUpTitle: "Canonical operator follow-up",
      operatorFollowUpLabel: "operator follow-up",
      executionFocusTitle: "Execution focus",
      recommendedNextStepTitle: "Recommended next step",
      openInboxSliceLabel: "open inbox slice",
      runTitlePrefix: "Run",
      openRunLabel: "open run",
      runStatusLabel: "Run status",
      currentNodeLabel: "Current node",
      focusNodeLabel: "Focus node",
      waitingReasonLabel: "Waiting reason",
      unavailableValueLabel: "n/a",
      focusedSkillTraceTitle: "Focused skill trace",
      injectedReferencesTitle: "Injected references",
      executionTimelineLinkLabel: "jump to execution timeline",
      focusedTraceSliceLinkLabel: "jump to focused trace slice"
    });
  });

  it("把 operator run snapshot meta 统一映射成稳定 rows", () => {
    expect(
      buildOperatorRunSnapshotMetaRows({
        runStatus: "waiting",
        currentNodeId: null,
        focusNodeLabel: "callback_node",
        waitingReason: null
      })
    ).toEqual([
      {
        key: "run_status",
        label: "Run status",
        value: "waiting"
      },
      {
        key: "current_node",
        label: "Current node",
        value: "n/a"
      },
      {
        key: "focus_node",
        label: "Focus node",
        value: "callback_node"
      },
      {
        key: "waiting_reason",
        label: "Waiting reason",
        value: "n/a"
      }
    ]);
  });

  it("没有 meta 时不返回 rows", () => {
    expect(buildOperatorRunSnapshotMetaRows({})).toEqual([]);
  });

  it("为 run detail CTA 复用统一 href 与 open run 标签", () => {
    expect(
      buildOperatorRunDetailCandidate({
        runId: "run-123456789",
        detail: "优先检查当前 run 的 waiting。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "run detail",
      detail: "优先检查当前 run 的 waiting。",
      href: "/runs/run-123456789",
      href_label: "open run",
      fallback_detail: "fallback"
    });
  });

  it("为 inbox slice CTA 复用统一 open inbox slice 标签", () => {
    expect(
      buildOperatorInboxSliceCandidate({
        href: "/sensitive-access?run_id=run-1",
        detail: "优先处理当前 blocker。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "approval blocker",
      detail: "优先处理当前 blocker。",
      href: "/sensitive-access?run_id=run-1",
      href_label: "open inbox slice",
      fallback_detail: "fallback"
    });
  });

  it("为 compact evidence 复用 execution timeline 深链", () => {
    expect(
      buildOperatorExecutionTimelineLinkSurface({
        runId: "run-123456789"
      })
    ).toEqual({
      href: "/runs/run-123456789#run-diagnostics-execution-timeline",
      label: "jump to execution timeline"
    });
  });

  it("在 execution timeline 已是当前锚点时移除重复深链", () => {
    expect(
      buildOperatorExecutionTimelineLinkSurface({
        runId: "run-123456789",
        currentHref: "/runs/run-123456789#run-diagnostics-execution-timeline"
      })
    ).toBeNull();
  });

  it("为 focused evidence 构建带 node_run_id 的 trace slice 深链", () => {
    expect(
      buildOperatorTraceSliceLinkSurface({
        runId: "run-123456789",
        runHref: "/runs/run-123456789?needs_follow_up=true",
        nodeRunId: "node-run-1"
      })
    ).toEqual({
      href: "/runs/run-123456789?needs_follow_up=true&node_run_id=node-run-1#run-diagnostics-execution-timeline",
      label: "jump to focused trace slice"
    });
  });

  it("在 focused trace slice 已是当前页时移除重复深链", () => {
    expect(
      buildOperatorTraceSliceLinkSurface({
        runId: "run-123456789",
        nodeRunId: "node-run-1",
        currentHref:
          "/runs/run-123456789?node_run_id=node-run-1#run-diagnostics-execution-timeline"
      })
    ).toBeNull();
  });

  it("在存在 inbox href 时优先构建 inbox slice candidate", () => {
    expect(
      buildOperatorNavigationCandidate({
        href: "/sensitive-access?run_id=run-1",
        runId: "run-123456789",
        label: "execution focus",
        detail: "优先处理当前 blocker。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "execution focus",
      detail: "优先处理当前 blocker。",
      href: "/sensitive-access?run_id=run-1",
      href_label: "open inbox slice",
      fallback_detail: "fallback"
    });
  });

  it("在缺少 inbox href 时回退到 run detail candidate", () => {
    expect(
      buildOperatorNavigationCandidate({
        runId: "run-123456789",
        label: "execution focus",
        detail: "优先打开 run。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "execution focus",
      detail: "优先打开 run。",
      href: "/runs/run-123456789",
      href_label: "open run",
      fallback_detail: "fallback"
    });
  });

  it("在 shared candidate 存在时优先复用 shared contract", () => {
    expect(
      buildSharedOrLocalOperatorCandidate({
        sharedCandidate: {
          active: true,
          label: "sandbox readiness",
          detail: "优先回到 workflow library 检查强隔离能力。",
          href: "/workflows?execution=sandbox",
          href_label: "Open workflow library",
          fallback_detail: "fallback"
        },
        runId: "run-123456789",
        detail: "优先打开 run。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "sandbox readiness",
      detail: "优先回到 workflow library 检查强隔离能力。",
      href: "/workflows?execution=sandbox",
      href_label: "Open workflow library",
      fallback_detail: "fallback"
    });
  });

  it("shared candidate 指回当前页时会回退到更具体的本地锚点", () => {
    expect(
      buildSharedOrLocalOperatorCandidate({
        sharedCandidate: {
          active: true,
          label: "execution focus",
          detail: "优先继续检查 execution focus。",
          href: "/runs/run-123456789",
          href_label: "open run",
          fallback_detail: "fallback"
        },
        currentHref: "/runs/run-123456789",
        href: "/runs/run-123456789#run-diagnostics-execution-timeline",
        hrefLabel: "jump to execution timeline",
        label: "execution focus",
        detail: "优先继续检查 execution focus。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "execution focus",
      detail: "优先继续检查 execution focus。",
      href: "/runs/run-123456789#run-diagnostics-execution-timeline",
      href_label: "jump to execution timeline",
      fallback_detail: "fallback"
    });
  });

  it("本地 candidate 仍指向当前页时会保留文案但移除死链接", () => {
    expect(
      buildSharedOrLocalOperatorCandidate({
        currentHref: "/runs/run-123456789",
        runId: "run-123456789",
        label: "execution focus",
        detail: "优先继续检查 execution focus。",
        fallbackDetail: "fallback"
      })
    ).toEqual({
      active: true,
      label: "execution focus",
      detail: "优先继续检查 execution focus。",
      href: null,
      href_label: null,
      fallback_detail: "fallback"
    });
  });

  it("把后端 canonical callback action 映射成 inbox candidate", () => {
    expect(
      buildOperatorRecommendedActionCandidate({
        action: {
          kind: "approval blocker",
          entry_key: "operatorInbox",
          href: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
          label: "open approval inbox slice"
        },
        detail: "先处理审批票据。",
        fallbackDetail: "fallback",
        scope: "callback"
      })
    ).toEqual({
      active: true,
      label: "approval blocker",
      detail: "先处理审批票据。",
      href: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
      href_label: "open approval inbox slice",
      fallback_detail: "fallback"
    });
  });

  it("不会把 canonical callback action 误当成 execution candidate", () => {
    expect(
      buildOperatorRecommendedActionCandidate({
        action: {
          kind: "approval blocker",
          entry_key: "operatorInbox",
          href: "/sensitive-access?run_id=run-1&node_run_id=node-run-1",
          label: "open approval inbox slice"
        },
        detail: "先处理审批票据。",
        fallbackDetail: "fallback",
        scope: "execution"
      })
    ).toBeNull();
  });

  it("会在最终 next step 上移除指回当前页的 canonical 链接", () => {
    expect(
      buildOperatorRecommendedNextStep({
        callback: {
          active: true,
          label: "approval blocker",
          detail: "先处理当前审批票据。",
          href: "/sensitive-access?approval_ticket_id=ticket-1&run_id=run-1",
          href_label: "open approval inbox slice",
          fallback_detail: "fallback"
        },
        currentHref: "/sensitive-access?run_id=run-1&approval_ticket_id=ticket-1"
      })
    ).toEqual({
      label: "approval blocker",
      detail: "先处理当前审批票据。",
      href: null,
      href_label: null
    });
  });

  it("保留指向其他页面的 canonical next step 链接", () => {
    expect(
      buildOperatorRecommendedNextStep({
        execution: {
          active: true,
          label: "run detail",
          detail: "优先打开另一条 run。",
          href: "/runs/run-2",
          href_label: "open run",
          fallback_detail: "fallback"
        },
        currentHref: "/runs/run-1"
      })
    ).toEqual({
      label: "run detail",
      detail: "优先打开另一条 run。",
      href: "/runs/run-2",
      href_label: "open run"
    });
  });

  it("为直达 run 链接复用统一 href 与标签 surface", () => {
    expect(
      buildOperatorRunDetailLinkSurface({
        runId: "run-123456789"
      })
    ).toEqual({
      href: "/runs/run-123456789",
      label: "open run"
    });
  });

  it("为短 id run pill 复用 open run {id} 标签 helper", () => {
    expect(formatOperatorOpenRunLinkLabel("run-123456789")).toBe("open run run-1234");
    expect(
      buildOperatorRunDetailLinkSurface({
        runId: "run-123456789",
        hrefLabel: formatOperatorOpenRunLinkLabel("run-123456789")
      })
    ).toEqual({
      href: "/runs/run-123456789",
      label: "open run run-1234"
    });
  });

  it("允许 run detail 直达链接覆写展示文案，同时继续复用统一 href", () => {
    expect(
      buildOperatorRunDetailLinkSurface({
        runId: "run-123456789",
        hrefLabel: "打开 run"
      })
    ).toEqual({
      href: "/runs/run-123456789",
      label: "打开 run"
    });
  });

  it("为必需 run detail surface 提供稳定 href 与标签", () => {
    expect(
      buildRequiredOperatorRunDetailLinkSurface({
        runId: "run-123456789"
      })
    ).toEqual({
      href: "/runs/run-123456789",
      label: "open run"
    });
  });

  it("在缺少 run id 时为必需 run detail surface 报错", () => {
    expect(() =>
      buildRequiredOperatorRunDetailLinkSurface({
        runId: "   "
      })
    ).toThrow("Cannot build run detail link surface without a run id.");
  });

  it("为直达 inbox slice 链接复用统一 href 与标签 surface", () => {
    expect(
      buildOperatorInboxSliceLinkSurface({
        href: "/sensitive-access?run_id=run-1"
      })
    ).toEqual({
      href: "/sensitive-access?run_id=run-1",
      label: "open inbox slice"
    });
  });

  it("允许 inbox slice 直达链接覆写展示文案，同时继续复用统一 href", () => {
    expect(
      buildOperatorInboxSliceLinkSurface({
        href: "/sensitive-access?run_id=run-1",
        hrefLabel: "open blocker inbox slice"
      })
    ).toEqual({
      href: "/sensitive-access?run_id=run-1",
      label: "open blocker inbox slice"
    });
  });
});
