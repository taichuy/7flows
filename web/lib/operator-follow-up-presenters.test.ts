import { describe, expect, it } from "vitest";

import {
  buildOperatorFollowUpSurfaceCopy,
  buildOperatorRunSnapshotMetaRows
} from "./operator-follow-up-presenters";

describe("operator follow-up presenters", () => {
  it("提供共享 operator follow-up surface copy", () => {
    expect(buildOperatorFollowUpSurfaceCopy()).toEqual({
      recommendedNextStepTitle: "Recommended next step",
      runTitlePrefix: "Run",
      openRunLabel: "open run",
      runStatusLabel: "Run status",
      currentNodeLabel: "Current node",
      focusNodeLabel: "Focus node",
      waitingReasonLabel: "Waiting reason",
      unavailableValueLabel: "n/a",
      focusedSkillTraceTitle: "Focused skill trace"
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
});
