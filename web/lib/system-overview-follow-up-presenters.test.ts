import { describe, expect, it } from "vitest";

import {
  buildCallbackWaitingAutomationSystemFollowUp,
  resolvePreferredSystemOverviewFollowUpSurface,
  shouldPreferSharedSandboxReadinessFollowUp
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
      entryKey: "runLibrary",
      traceLink: null,
      traceEventType: null
    });
  });

  it("adds a sampled callback trace link from runtime activity when recent events are available", () => {
    expect(
      buildCallbackWaitingAutomationSystemFollowUp(
        {
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
        {
          recentEvents: [
            {
              id: 11,
              run_id: "run-callback-issued",
              node_run_id: "node-callback-issued",
              event_type: "run.callback.ticket.issued",
              payload_keys: ["ticket"],
              payload_preview: "issued",
              payload_size: 12,
              created_at: "2026-03-24T13:00:00Z"
            },
            {
              id: 12,
              run_id: "run-callback-requeued",
              node_run_id: "node-callback-requeued",
              event_type: "run.resume.requeued",
              payload_keys: ["reason"],
              payload_preview: "requeued",
              payload_size: 24,
              created_at: "2026-03-24T13:05:00Z"
            }
          ]
        }
      )
    ).toMatchObject({
      source: "callback_waiting_automation",
      traceEventType: "run.resume.requeued",
      traceLink: {
        href: "/runs/run-callback-requeued?event_type=run.resume.requeued&node_run_id=node-callback-requeued#run-diagnostics-execution-timeline",
        label: "open sampled callback trace"
      }
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

  it("prioritizes shared sandbox readiness when blocked execution is explicit", () => {
    expect(
      shouldPreferSharedSandboxReadinessFollowUp({
        blockedExecution: true,
        signals: ["当前 follow-up 没有出现 sandbox 关键字"]
      })
    ).toBe(true);
  });

  it("prioritizes shared sandbox readiness when execution signals mention strong isolation", () => {
    expect(
      shouldPreferSharedSandboxReadinessFollowUp({
        signals: [
          "继续检查 callback backlog。",
          "No compatible sandbox backend is available.",
          "agent_plan"
        ]
      })
    ).toBe(true);

    expect(
      shouldPreferSharedSandboxReadinessFollowUp({
        signals: ["继续检查 callback backlog。", "agent_plan"]
      })
    ).toBe(false);
  });
});
