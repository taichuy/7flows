import { describe, expect, it } from "vitest";

import {
  buildOperatorInboxSliceLinkSurface,
  buildOperatorInboxSliceCandidate,
  buildOperatorFollowUpSurfaceCopy,
  buildRequiredOperatorRunDetailLinkSurface,
  buildOperatorRunDetailLinkSurface,
  buildOperatorRunDetailCandidate,
  buildOperatorRunSnapshotMetaRows,
  formatOperatorOpenRunLinkLabel
} from "./operator-follow-up-presenters";

describe("operator follow-up presenters", () => {
  it("提供共享 operator follow-up surface copy", () => {
    expect(buildOperatorFollowUpSurfaceCopy()).toEqual({
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
      injectedReferencesTitle: "Injected references"
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
