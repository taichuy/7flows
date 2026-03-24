import { describe, expect, it } from "vitest";

import {
  buildRunLibraryRecommendedNextStep,
  buildSensitiveAccessInboxRecommendedNextStep
} from "@/lib/operator-workbench-next-step";
import {
  buildCallbackWaitingAutomationFixture,
  buildRecentRunEventFixture,
  buildRecentRunFixture,
  buildRuntimeActivityFixture,
  buildSensitiveAccessInboxEntryFixture,
  buildSensitiveAccessRequestFixture,
  buildSensitiveAccessResourceFixture,
  buildSensitiveAccessSummaryFixture,
  buildSensitiveAccessTicketFixture
} from "@/lib/workbench-page-test-fixtures";

describe("operator workbench next step presenters", () => {
  it("prioritizes operator backlog on the run library page", () => {
    const recommendedNextStep = buildRunLibraryRecommendedNextStep({
      runtimeActivity: buildRuntimeActivityFixture({
        recent_runs: [
          buildRecentRunFixture({
            created_at: "2026-03-23T00:00:00Z"
          })
        ],
        recent_events: [
          buildRecentRunEventFixture({
            created_at: "2026-03-23T00:00:10Z"
          })
        ]
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture({
        affected_run_count: 1,
        affected_workflow_count: 1,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "scheduler_unhealthy",
          entry_key: "runLibrary",
          href: "/runs",
          label: "open run library"
        }
      }),
      sandboxReadiness: null,
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture({
        ticket_count: 2,
        pending_ticket_count: 2,
        affected_run_count: 2,
        affected_workflow_count: 1
      }),
      currentHref: "/runs"
    });

    expect(recommendedNextStep).toMatchObject({
      label: "pending approval ticket",
      href: "/sensitive-access?status=pending"
    });
  });

  it("re-homes callback recovery self-links to the latest waiting run", () => {
    const recommendedNextStep = buildRunLibraryRecommendedNextStep({
      runtimeActivity: buildRuntimeActivityFixture({
        recent_runs: [
          buildRecentRunFixture({
            id: "run-wait",
            created_at: "2026-03-23T00:00:00Z"
          }),
          buildRecentRunFixture({
            id: "run-done",
            workflow_id: "workflow-2",
            status: "completed",
            created_at: "2026-03-22T00:00:00Z",
            finished_at: "2026-03-22T00:05:00Z"
          })
        ],
        recent_events: [
          buildRecentRunEventFixture({
            run_id: "run-wait"
          }),
          buildRecentRunEventFixture({
            id: 2,
            run_id: "run-done",
            event_type: "node_completed",
            payload_preview: "node completed"
          })
        ]
      }),
      callbackWaitingAutomation: buildCallbackWaitingAutomationFixture({
        status: "degraded",
        detail: "scheduler unhealthy",
        scheduler_health_status: "failed",
        scheduler_health_detail: "scheduler unhealthy",
        affected_run_count: 1,
        affected_workflow_count: 1,
        primary_blocker_kind: "scheduler_unhealthy",
        recommended_action: {
          kind: "scheduler_unhealthy",
          entry_key: "runLibrary",
          href: "/runs",
          label: "open run library"
        }
      }),
      sandboxReadiness: null,
      sensitiveAccessSummary: buildSensitiveAccessSummaryFixture(),
      currentHref: "/runs"
    });

    expect(recommendedNextStep).toMatchObject({
      label: "callback recovery",
      href: "/runs/run-wait"
    });
  });

  it("projects the first actionable inbox entry into a ticket slice", () => {
    const recommendedNextStep = buildSensitiveAccessInboxRecommendedNextStep({
      entries: [
        buildSensitiveAccessInboxEntryFixture({
          ticket: buildSensitiveAccessTicketFixture({
            created_at: "2026-03-23T00:00:00Z"
          }),
          request: buildSensitiveAccessRequestFixture({
            created_at: "2026-03-23T00:00:00Z"
          }),
          resource: buildSensitiveAccessResourceFixture({
            created_at: "2026-03-23T00:00:00Z",
            updated_at: "2026-03-23T00:00:00Z"
          })
        })
      ],
      summary: buildSensitiveAccessSummaryFixture({
        ticket_count: 1,
        pending_ticket_count: 1,
        waiting_ticket_count: 1,
        affected_run_count: 1,
        affected_workflow_count: 1
      }),
      callbackWaitingAutomation: null,
      sandboxReadiness: null,
      currentHref: "/sensitive-access"
    });

    expect(recommendedNextStep).toMatchObject({
      label: "approval blocker",
      href: "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-1&node_run_id=node-run-1&access_request_id=request-1&approval_ticket_id=ticket-1"
    });
  });

  it("falls back to run detail when the current inbox page already matches the exact ticket slice", () => {
    const exactSliceHref =
      "/sensitive-access?status=pending&waiting_status=waiting&run_id=run-1&node_run_id=node-run-1&access_request_id=request-1&approval_ticket_id=ticket-1";
    const recommendedNextStep = buildSensitiveAccessInboxRecommendedNextStep({
      entries: [
        buildSensitiveAccessInboxEntryFixture({
          ticket: buildSensitiveAccessTicketFixture({
            created_at: "2026-03-23T00:00:00Z"
          }),
          request: buildSensitiveAccessRequestFixture({
            created_at: "2026-03-23T00:00:00Z"
          }),
          resource: buildSensitiveAccessResourceFixture({
            created_at: "2026-03-23T00:00:00Z",
            updated_at: "2026-03-23T00:00:00Z"
          })
        })
      ],
      summary: buildSensitiveAccessSummaryFixture({
        ticket_count: 1,
        pending_ticket_count: 1,
        waiting_ticket_count: 1,
        affected_run_count: 1,
        affected_workflow_count: 1
      }),
      callbackWaitingAutomation: null,
      sandboxReadiness: null,
      currentHref: exactSliceHref
    });

    expect(recommendedNextStep).toMatchObject({
      label: "approval blocker",
      href: "/runs/run-1?node_run_id=node-run-1#run-diagnostics-execution-timeline",
      href_label: "open focused trace slice"
    });
  });
});
