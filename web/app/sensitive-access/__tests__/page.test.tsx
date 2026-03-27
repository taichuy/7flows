import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import SensitiveAccessInboxPage from "@/app/sensitive-access/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import {
  buildLegacyAuthGovernanceDraftCleanupChecklistFixture,
  buildLegacyAuthGovernancePublishedFollowUpChecklistFixture,
  buildLegacyAuthGovernanceSnapshotFixture,
  buildLegacyAuthGovernanceWorkflowFixture
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";
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

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/sensitive-access",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams()
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

function buildSystemOverview() {
  return buildSystemOverviewFixture({
    sandbox_readiness: {
      enabled_backend_count: 1,
      healthy_backend_count: 0,
      degraded_backend_count: 0,
      offline_backend_count: 1,
      execution_classes: [
        {
          execution_class: "sandbox",
          available: true,
          backend_ids: ["sandbox-default"],
          supported_languages: ["python"],
          supported_profiles: ["default"],
          supported_dependency_modes: ["none"],
          supports_tool_execution: true,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: true,
          supports_filesystem_policy: true,
          reason: null
        }
      ],
      supported_languages: ["python"],
      supported_profiles: ["default"],
      supported_dependency_modes: ["none"],
      supports_tool_execution: true,
      supports_builtin_package_sets: false,
      supports_backend_extensions: false,
      supports_network_policy: true,
      supports_filesystem_policy: true
    }
  });
}

describe("SensitiveAccessInboxPage", () => {
  it("surfaces live sandbox readiness before the inbox list", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture()
    );
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("审批、恢复与通知派发统一收口");
    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain(
      "强隔离执行链路当前可用，但仍有 1 个已启用 backend 处于 offline。"
    );
    expect(html).toContain("Sandbox execution chain");
    expect(html).toContain("approval / resume / notification 已经汇到同一条 operator inbox");
  });

  it("surfaces a canonical inbox next step when pending approvals remain", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture({
        summary: {
          ticket_count: 1,
          pending_ticket_count: 1,
          waiting_ticket_count: 1
        },
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
        ]
      })
    );
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Recommended next step");
    expect(html).toContain("approval blocker");
    expect(html).toContain("Primary governed resource: Sandbox secret.");
    expect(html).toContain("open exact inbox slice");
    expect(html).toContain(
      '/sensitive-access?status=pending&amp;waiting_status=waiting&amp;run_id=run-1&amp;node_run_id=node-run-1&amp;access_request_id=request-1&amp;approval_ticket_id=ticket-1'
    );
  });

  it("projects the primary operator blocker to a focused trace slice in the cross-entry digest", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture({
        summary: {
          ticket_count: 1,
          pending_ticket_count: 1,
          waiting_ticket_count: 1,
          primary_resource: buildSensitiveAccessResourceFixture({
            label: "OpenAI Prod Key",
            sensitivity_level: "L3",
            source: "credential",
            credential_governance: {
              credential_id: "credential-openai-prod",
              credential_name: "OpenAI Prod Key",
              credential_type: "api_key",
              credential_status: "active",
              sensitivity_level: "L3",
              sensitive_resource_id: "resource-1",
              sensitive_resource_label: "OpenAI Prod Key",
              credential_ref: "cred://openai/prod",
              summary: "OpenAI Prod Key · L3 治理 · 生效中"
            }
          })
        },
        entries: [
          buildSensitiveAccessInboxEntryFixture({
            ticket: buildSensitiveAccessTicketFixture({
              run_id: "run-sensitive-focus",
              node_run_id: "node-sensitive-entry",
              created_at: "2026-03-24T08:00:00Z"
            }),
            request: buildSensitiveAccessRequestFixture({
              run_id: "run-sensitive-focus",
              node_run_id: "node-sensitive-entry",
              resource_id: "resource-1",
              created_at: "2026-03-24T08:00:00Z"
            }),
            resource: buildSensitiveAccessResourceFixture({
              label: "OpenAI Prod Key",
              sensitivity_level: "L3",
              source: "credential",
              credential_governance: {
                credential_id: "credential-openai-prod",
                credential_name: "OpenAI Prod Key",
                credential_type: "api_key",
                credential_status: "active",
                sensitivity_level: "L3",
                sensitive_resource_id: "resource-1",
                sensitive_resource_label: "OpenAI Prod Key",
                credential_ref: "cred://openai/prod",
                summary: "OpenAI Prod Key · L3 治理 · 生效中"
              },
              created_at: "2026-03-24T08:00:00Z",
              updated_at: "2026-03-24T08:00:00Z"
            }),
            executionContext: buildSensitiveAccessExecutionContextFixture({
              runId: "run-sensitive-focus",
              focusNode: buildSensitiveAccessExecutionFocusNodeFixture({
                node_run_id: "node-sensitive-focus",
                node_id: "approval-node",
                node_name: "Approval Gate"
              }),
              focusMatchesEntry: false,
              entryNodeRunId: "node-sensitive-entry"
            })
          })
        ]
      })
    );
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("jump to focused trace slice");
    expect(html).toContain(
      '/runs/run-sensitive-focus?node_run_id=node-sensitive-focus#run-diagnostics-execution-timeline'
    );
    expect(html).toContain("OpenAI Prod Key · L3 治理 · 生效中");
  });

  it("surfaces workflow legacy auth handoff alongside the inbox backlog", async () => {
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshotFixture({
        summary: {
          ticket_count: 1,
          pending_ticket_count: 1,
          waiting_ticket_count: 1
        },
        entries: [
          buildSensitiveAccessInboxEntryFixture({
            ticket: buildSensitiveAccessTicketFixture({
              created_at: "2026-03-24T08:00:00Z"
            }),
            request: buildSensitiveAccessRequestFixture({
              requester_type: "tool",
              requester_id: "native.search",
              action_type: "invoke",
              created_at: "2026-03-24T08:00:00Z"
            }),
            resource: buildSensitiveAccessResourceFixture({
              label: "Remote search capability",
              source: "local_capability",
              created_at: "2026-03-24T08:00:00Z",
              updated_at: "2026-03-24T08:00:00Z"
            }),
            runSnapshot: {
              workflowId: "workflow-1",
              status: "waiting",
              currentNodeId: "tool-node",
              waitingReason: "waiting approval"
            },
            legacyAuthGovernance: buildLegacyAuthGovernanceSnapshotFixture({
              generated_at: "2026-03-24T08:00:00Z",
              workflow_count: 1,
              binding_count: 2,
              summary: {
                draft_candidate_count: 1,
                published_blocker_count: 1,
                offline_inventory_count: 0
              },
              checklist: [
                buildLegacyAuthGovernanceDraftCleanupChecklistFixture({
                  workflow_name: "Demo Workflow",
                  detail: "先处理 draft cleanup。"
                }),
                buildLegacyAuthGovernancePublishedFollowUpChecklistFixture({
                  workflow_name: "Demo Workflow",
                  detail: "再处理 live legacy published blockers。"
                })
              ],
              workflows: [
                buildLegacyAuthGovernanceWorkflowFixture({
                  workflow_id: "workflow-1",
                  workflow_name: "Demo Workflow",
                  binding_count: 2,
                  draft_candidate_count: 1,
                  published_blocker_count: 1,
                  offline_inventory_count: 0,
                  tool_governance: {
                    referenced_tool_ids: ["native.catalog-gap"],
                    missing_tool_ids: ["native.catalog-gap"],
                    governed_tool_count: 0,
                    strong_isolation_tool_count: 0
                  }
                })
              ]
            })
          })
        ]
      })
    );
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());

    const html = renderToStaticMarkup(
      await SensitiveAccessInboxPage({
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain("Legacy publish auth checklist 直接跟到 operator backlog");
    expect(html).toContain("Affected workflows");
    expect(html).toContain("先批量下线 draft legacy bindings");
    expect(html).toContain("再补发支持鉴权的 replacement bindings");
    expect(html).toContain("Demo Workflow");
    expect(html).toContain("Publish auth contract");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain(
      'href="/workflows/workflow-1?needs_follow_up=true&amp;definition_issue=missing_tool"'
    );
  });
});
