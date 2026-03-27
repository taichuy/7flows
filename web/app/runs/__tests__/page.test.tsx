import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import RunsPage from "@/app/runs/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import {
  buildSensitiveAccessExecutionContextFixture,
  buildSensitiveAccessExecutionFocusNodeFixture,
  buildSensitiveAccessInboxEntryFixture,
  buildSensitiveAccessInboxSnapshotFixture,
  buildSensitiveAccessRequestFixture,
  buildSensitiveAccessResourceFixture,
  buildSensitiveAccessTicketFixture,
  buildSystemOverviewFixture
} from "@/lib/workbench-page-test-fixtures";
import { buildRunLibrarySurfaceCopy } from "@/lib/workbench-entry-surfaces";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

describe("RunsPage", () => {
  it("renders recent run links and operator follow-up entry", async () => {
    const surfaceCopy = buildRunLibrarySurfaceCopy();

    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        runtime_activity: {
          summary: {
            recent_run_count: 2,
            recent_event_count: 5,
            run_statuses: {
              completed: 1,
              waiting_callback: 1
            },
            event_types: {
              node_completed: 2,
              callback_waiting: 1
            }
          },
          recent_runs: [
            {
              id: "run-1",
              workflow_id: "workflow-1",
              workflow_version: "1.0.0",
              status: "waiting_callback",
              created_at: "2026-03-22T08:00:00Z",
              finished_at: null,
              event_count: 3
            },
            {
              id: "run-2",
              workflow_id: "workflow-2",
              workflow_version: "2.0.0",
              status: "completed",
              created_at: "2026-03-22T07:00:00Z",
              finished_at: "2026-03-22T07:30:00Z",
              event_count: 2
            }
          ]
        }
      })
    );
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture({
        summary: {
          ticket_count: 1,
          pending_ticket_count: 1,
          waiting_ticket_count: 1,
          primary_resource: buildSensitiveAccessResourceFixture({
            id: "resource-run-secret",
            label: "Run secret",
            sensitivity_level: "L3",
            source: "credential",
            credential_governance: {
              credential_id: "credential-run-secret",
              credential_name: "Run secret",
              credential_type: "api_key",
              credential_status: "active",
              sensitivity_level: "L3",
              sensitive_resource_id: "resource-run-secret",
              sensitive_resource_label: "Run secret",
              credential_ref: "cred://run/secret",
              summary: "Run secret · L3 治理 · 生效中"
            },
            created_at: "2026-03-22T09:00:00Z",
            updated_at: "2026-03-22T09:30:00Z"
          })
        },
        entries: [
          buildSensitiveAccessInboxEntryFixture({
            ticket: buildSensitiveAccessTicketFixture({
              id: "ticket-run-1",
              access_request_id: "request-run-1",
              run_id: "run-library-entry",
              node_run_id: "node-library-entry",
              created_at: "2026-03-22T10:00:00Z"
            }),
            request: buildSensitiveAccessRequestFixture({
              id: "request-run-1",
              run_id: "run-library-entry",
              node_run_id: "node-library-entry",
              requester_type: "ai",
              requester_id: "agent-run",
              resource_id: "resource-run-secret",
              created_at: "2026-03-22T09:59:00Z"
            }),
            resource: buildSensitiveAccessResourceFixture({
              id: "resource-run-secret",
              label: "Run secret",
              sensitivity_level: "L3",
              source: "credential",
              credential_governance: {
                credential_id: "credential-run-secret",
                credential_name: "Run secret",
                credential_type: "api_key",
                credential_status: "active",
                sensitivity_level: "L3",
                sensitive_resource_id: "resource-run-secret",
                sensitive_resource_label: "Run secret",
                credential_ref: "cred://run/secret",
                summary: "Run secret · L3 治理 · 生效中"
              },
              created_at: "2026-03-22T09:00:00Z",
              updated_at: "2026-03-22T09:30:00Z"
            }),
            executionContext: buildSensitiveAccessExecutionContextFixture({
              runId: "run-library-focus",
              focusNode: buildSensitiveAccessExecutionFocusNodeFixture({
                node_run_id: "node-library-focus",
                node_id: "run-approval-node",
                node_name: "Run Approval"
              }),
              focusMatchesEntry: false,
              entryNodeRunId: "node-library-entry"
            })
          })
        ]
      })
    );

    const html = renderToStaticMarkup(await RunsPage({}));

    expect(html).toContain("运行诊断入口收口到独立列表");
    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain("jump to focused trace slice");
    expect(html).toContain(
      '/runs/run-library-focus?node_run_id=node-library-focus#run-diagnostics-execution-timeline'
    );
    expect(html).toContain('/runs/run-1');
    expect(html).toContain('/workflows/workflow-1');
    expect(html).toContain("回到 workflow 编辑器");
    expect(html).toContain('/sensitive-access');
    expect(html).toContain(
      surfaceCopy.operatorEntryLinks.overrides?.operatorInbox?.label ?? "打开 sensitive access inbox"
    );
    expect(html).toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("Run secret · L3 治理 · 生效中");
    expect(html).toContain("Primary governed resource: Run secret · L3 治理 · 生效中.");
    expect(html).toContain(
      '/sensitive-access?status=pending&amp;waiting_status=waiting&amp;run_id=run-library-entry&amp;node_run_id=node-library-entry&amp;access_request_id=request-run-1&amp;approval_ticket_id=ticket-run-1'
    );
    expect(html).toContain("open exact inbox slice");
    expect(html).toContain("callback_waiting · 1");
    expect(html).toContain("completed:1 / waiting_callback:1");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("当前还没有任何强隔离 execution class ready。");
  });

  it("shows a workflow fallback when there are no recent runs", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverviewFixture());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );

    const html = renderToStaticMarkup(await RunsPage({}));

    expect(html).toContain("当前还没有历史 run");
    expect(html).toContain('/workflows');
  });

  it("surfaces workflow catalog-gap handoff on recent run cards", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        runtime_activity: {
          summary: {
            recent_run_count: 1,
            recent_event_count: 0,
            run_statuses: {
              waiting_callback: 1
            },
            event_types: {}
          },
          recent_runs: [
            {
              id: "run-gap-1",
              workflow_id: "workflow-gap-1",
              workflow_name: "Catalog Gap Workflow",
              workflow_version: "1.0.0",
              status: "waiting_callback",
              created_at: "2026-03-22T08:00:00Z",
              finished_at: null,
              event_count: 2,
              tool_governance: {
                referenced_tool_ids: ["native.catalog-gap"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 0,
                strong_isolation_tool_count: 0
              }
            }
          ],
          recent_events: []
        }
      })
    );
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );

    const html = renderToStaticMarkup(await RunsPage({}));

    expect(html).toContain("Catalog Gap Workflow");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain(
      "当前 run 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续核对 run 事实。"
    );
    expect(html).toContain('/workflows/workflow-gap-1?definition_issue=missing_tool');
  });

  it("surfaces workflow legacy-auth handoff in recent runs", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        runtime_activity: {
          summary: {
            recent_run_count: 1,
            recent_event_count: 0,
            run_statuses: {
              failed: 1
            },
            event_types: {}
          },
          recent_runs: [
            {
              id: "run-legacy-auth-1",
              workflow_id: "workflow-legacy-auth-1",
              workflow_name: "Legacy Auth Run Workflow",
              workflow_version: "1.0.0",
              status: "failed",
              created_at: "2026-03-22T08:00:00Z",
              finished_at: null,
              event_count: 2,
              legacy_auth_governance:
                buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                  binding: {
                    workflow_id: "workflow-legacy-auth-1",
                    workflow_name: "Legacy Auth Run Workflow"
                  }
                })
            }
          ],
          recent_events: []
        }
      })
    );
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );

    const html = renderToStaticMarkup(await RunsPage({}));

    expect(html).toContain("Legacy Auth Run Workflow");
    expect(html).toContain("1 legacy bindings");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain(
      "当前 workflow 仍有 0 条 draft cleanup、1 条 published blocker、0 条 offline inventory。Publish auth contract：supported api_key / internal；legacy token。"
    );
    expect(html).toContain(
      'href="/workflows/workflow-legacy-auth-1?definition_issue=legacy_publish_auth"'
    );
  });

  it("preserves workspace starter scope across run and workflow links", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(
      buildSystemOverviewFixture({
        runtime_activity: {
          summary: {
            recent_run_count: 1,
            recent_event_count: 1,
            run_statuses: {
              waiting_callback: 1
            },
            event_types: {
              callback_waiting: 1
            }
          },
          recent_runs: [
            {
              id: "run-1",
              workflow_id: "workflow-1",
              workflow_version: "1.0.0",
              status: "waiting_callback",
              created_at: "2026-03-22T08:00:00Z",
              finished_at: null,
              event_count: 1
            }
          ],
          recent_events: [
            {
              id: 42,
              run_id: "run-1",
              node_run_id: "node-run-1",
              event_type: "callback_waiting",
              payload_keys: ["reason"],
              payload_preview: "callback pending",
              payload_size: 32,
              created_at: "2026-03-22T08:01:00Z"
            }
          ]
        }
      })
    );
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture({
        summary: {
          ticket_count: 1,
          pending_ticket_count: 1,
          waiting_ticket_count: 0,
          failed_notification_count: 0,
          pending_notification_count: 0,
          affected_run_count: 1,
          affected_workflow_count: 1
        },
        entries: [
          buildSensitiveAccessInboxEntryFixture({
            ticket: buildSensitiveAccessTicketFixture({
              id: "ticket-governed-1",
              access_request_id: "request-governed-1",
              run_id: "run-governed",
              node_run_id: "node-governed",
              status: "pending",
              waiting_status: "waiting",
              created_at: "2026-03-22T10:00:00Z"
            }),
            request: buildSensitiveAccessRequestFixture({
              id: "request-governed-1",
              run_id: "run-governed",
              node_run_id: "node-governed",
              resource_id: "resource-governed",
              created_at: "2026-03-22T09:59:00Z"
            }),
            resource: buildSensitiveAccessResourceFixture({
              id: "resource-governed",
              label: "Governed secret",
              sensitivity_level: "L3",
              source: "credential",
              created_at: "2026-03-22T09:00:00Z",
              updated_at: "2026-03-22T09:30:00Z"
            }),
            runSnapshot: {
              workflowId: "workflow-governed"
            },
            runFollowUp: {
              affectedRunCount: 1,
              sampledRunCount: 1,
              waitingRunCount: 1,
              runningRunCount: 0,
              succeededRunCount: 0,
              failedRunCount: 0,
              unknownRunCount: 0,
              recommendedAction: null,
              sampledRuns: [
                {
                  runId: "run-governed",
                  snapshot: {
                    workflowId: "workflow-governed"
                  },
                  callbackTickets: [],
                  sensitiveAccessEntries: [],
                  toolGovernance: {
                    referenced_tool_ids: ["native.catalog-gap"],
                    missing_tool_ids: ["native.catalog-gap"],
                    governed_tool_count: 0,
                    strong_isolation_tool_count: 0
                  },
                  legacyAuthGovernance:
                    buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
                      binding: {
                        workflow_id: "workflow-governed",
                        workflow_name: "Governed workflow"
                      }
                    })
                }
              ]
            }
          })
        ]
      })
    );

    const html = renderToStaticMarkup(
      await RunsPage({
        searchParams: Promise.resolve({
          track: "应用新建编排",
          needs_follow_up: "true",
          source_governance_kind: "drifted",
          q: "drift"
        })
      })
    );

    expect(html).toContain(
      '/runs/run-1?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain(
      '/workflows/workflow-1?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain(
      '/workflows?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain(
      '/runs/run-1?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;event_type=callback_waiting&amp;node_run_id=node-run-1#run-diagnostics-execution-timeline'
    );
    expect(html).toContain(
      '/workflows/workflow-governed?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=legacy_publish_auth'
    );
    expect(html).toContain(
      '/workflows/workflow-governed?needs_follow_up=true&amp;q=drift&amp;source_governance_kind=drifted&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&amp;definition_issue=missing_tool'
    );
    expect(html).toContain("callback pending");
  });
});

