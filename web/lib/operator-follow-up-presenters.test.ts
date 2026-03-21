import { describe, expect, it } from "vitest";

import {
  buildOperatorInboxSliceCandidate,
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRunDetailCandidate,
  buildOperatorRunSnapshotMetaRows
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
});
