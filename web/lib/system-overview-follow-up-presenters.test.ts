import { describe, expect, it } from "vitest";

import {
  buildCallbackWaitingAutomationSystemFollowUp,
  resolvePreferredSystemOverviewFollowUpSurface
} from "./system-overview-follow-up-presenters";

describe("system overview follow-up presenters", () => {
  it("uses canonical entry keys for callback recovery follow-up surfaces", () => {
    expect(
      buildCallbackWaitingAutomationSystemFollowUp({
        affected_run_count: 3,
        affected_workflow_count: 2,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "open_run_library",
          label: "Open run library",
          href: "/runs?focus=callback-waiting",
          entry_key: "runLibrary"
        }
      })
    ).toEqual({
      source: "callback_waiting_automation",
      kind: "scheduler_unhealthy",
      detail:
        "当前 callback recovery 仍影响 3 个 run / 2 个 workflow；scheduler 仍不健康，优先回到 run library 核对 waiting callback runs 与自动 resume 状态。",
      href: "/runs?focus=callback-waiting",
      hrefLabel: "Open run library",
      impactedScope: "3 个 run / 2 个 workflow",
      entryKey: "runLibrary"
    });
  });

  it("prefers callback follow-up when callback and sandbox signals are both active", () => {
    const surface = resolvePreferredSystemOverviewFollowUpSurface({
      callbackActive: true,
      callbackWaitingAutomation: {
        affected_run_count: 3,
        affected_workflow_count: 2,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "open_run_library",
          label: "Open run library",
          href: "/runs?focus=callback-waiting",
          entry_key: "runLibrary"
        }
      },
      sandboxActive: true,
      sandboxReadiness: {
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "open_workflow_library",
          label: "Open workflow library",
          href: "/workflows?execution=sandbox",
          entry_key: "workflowLibrary"
        }
      }
    });

    expect(surface).toMatchObject({
      source: "callback_waiting_automation",
      entryKey: "runLibrary",
      href: "/runs?focus=callback-waiting"
    });
  });

  it("falls back to sandbox follow-up when callback recovery lacks a shared CTA", () => {
    const surface = resolvePreferredSystemOverviewFollowUpSurface({
      callbackActive: true,
      callbackWaitingAutomation: {
        affected_run_count: 3,
        affected_workflow_count: 2,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: null
      },
      sandboxActive: true,
      sandboxReadiness: {
        affected_run_count: 4,
        affected_workflow_count: 1,
        primary_blocker_kind: "execution_class_blocked",
        recommended_action: {
          kind: "open_workflow_library",
          label: "Open workflow library",
          href: "/workflows?execution=sandbox",
          entry_key: "workflowLibrary"
        }
      }
    });

    expect(surface).toMatchObject({
      source: "sandbox_readiness",
      entryKey: "workflowLibrary",
      href: "/workflows?execution=sandbox"
    });
  });
});
