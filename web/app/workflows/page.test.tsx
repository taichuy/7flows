import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowsPage from "@/app/workflows/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflows } from "@/lib/get-workflows";
import {
  buildSensitiveAccessResourceFixture,
  buildSensitiveAccessInboxSnapshotFixture,
  buildSystemOverviewFixture
} from "@/lib/workbench-page-test-fixtures";
import {
  buildLegacyAuthGovernanceBindingFixture,
  buildLegacyAuthGovernanceSnapshotFixture,
  buildLegacyAuthGovernanceWorkflowFixture,
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-sensitive-access", () => ({
  getSensitiveAccessInboxSnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflow-publish", () => ({
  getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot: vi.fn()
}));

function buildSensitiveAccessInboxSnapshot(
  overrides: Partial<Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>> = {}
) {
  return buildSensitiveAccessInboxSnapshotFixture(overrides);
}

function buildSystemOverview() {
  return buildSystemOverviewFixture({
    sandbox_readiness: {
      enabled_backend_count: 1,
      healthy_backend_count: 0,
      degraded_backend_count: 1,
      offline_backend_count: 0,
      execution_classes: [
        {
          execution_class: "sandbox",
          available: false,
          backend_ids: [],
          supported_languages: [],
          supported_profiles: [],
          supported_dependency_modes: [],
          supports_tool_execution: false,
          supports_builtin_package_sets: false,
          supports_backend_extensions: false,
          supports_network_policy: false,
          supports_filesystem_policy: false,
          reason: "sandbox-default healthcheck is still degraded."
        }
      ],
      supported_languages: [],
      supported_profiles: [],
      supported_dependency_modes: [],
      supports_tool_execution: false,
      supports_builtin_package_sets: false,
      supports_backend_extensions: false,
      supports_network_policy: false,
      supports_filesystem_policy: false
    }
  });
}

function buildWorkflowLibrarySnapshot(
  overrides: Partial<Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>> = {}
) {
  return {
    nodes: [],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [],
    toolSourceLanes: [],
    tools: [],
    ...overrides
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>;
}

function buildLegacyAuthGovernanceSnapshot(
  overrides: Partial<
    NonNullable<Awaited<ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>>>
  > = {}
) {
  return buildLegacyAuthGovernanceSnapshotFixture(overrides) as NonNullable<
    Awaited<ReturnType<typeof getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot>>
  >;
}

beforeEach(() => {
  vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue(
    buildLegacyAuthGovernanceSnapshot()
  );
});

function buildStarter(
  overrides: Partial<Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>["starters"][number]> = {}
) {
  return {
    id: "starter-openclaw",
    origin: "workspace",
    workspaceId: "default",
    name: "OpenClaw starter",
    description: "Starter for the first workflow draft.",
    businessTrack: "应用新建编排",
    defaultWorkflowName: "OpenClaw Workflow",
    workflowFocus: "Author entry",
    recommendedNextStep: "Create the first workflow draft.",
    tags: ["starter"],
    definition: {
      nodes: [],
      edges: []
    },
    source: {
      kind: "starter",
      scope: "workspace",
      status: "available",
      governance: "workspace",
      ecosystem: "7flows",
      label: "Workspace starter",
      shortLabel: "workspace",
      summary: "Workspace maintained starter"
    },
    createdFromWorkflowId: null,
    createdFromWorkflowVersion: null,
    archived: false,
    createdAt: "2026-03-23T19:45:00Z",
    updatedAt: "2026-03-23T19:45:00Z",
    toolGovernance: {
      referencedToolIds: [],
      referencedTools: [],
      missingToolIds: [],
      governedToolCount: 0,
      strongIsolationToolCount: 0
    },
    sourceGovernance: {
      kind: "no_source",
      statusLabel: "无来源",
      summary: "No upstream source is required.",
      sourceWorkflowId: null,
      sourceWorkflowName: null,
      templateVersion: "0.1.0",
      sourceVersion: null,
      actionDecision: null,
      outcomeExplanation: null
    },
    ...overrides
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>["starters"][number];
}

describe("WorkflowsPage", () => {
  it("renders workflow chips and governance summary", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-1",
        name: "Alpha workflow",
        version: "1.0.0",
        status: "draft",
        node_count: 4,
        tool_governance: {
          referenced_tool_ids: ["tool-1", "tool-2"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 2,
          strong_isolation_tool_count: 1
        }
      },
      {
        id: "workflow-2",
        name: "Beta workflow",
        version: "2.0.0",
        status: "published",
        node_count: 3,
        tool_governance: {
          referenced_tool_ids: ["tool-3"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }
    ]);

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("作者、operator 与运行入口统一收口");
    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain('/workflows/workflow-1');
    expect(html).toContain('/workflows/new');
    expect(html).toContain('/workspace-starters');
    expect(html).toContain('/runs');
    expect(html).toContain('/sensitive-access');
    expect(html).toContain("draft:1 / published:1");
    expect(html).toContain("Alpha workflow · catalog gap · tool-missing");
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).toContain("跨 workflow catalog gap handoff");
    expect(html).toContain("只看 missing-tool workflow");
    expect(html).toContain(
      "当前 workflow 仍引用目录里不存在的 tool：tool-missing；补齐 binding 后即可清空当前范围里的 missing-tool backlog。"
    );
    expect(html).toContain("Sandbox execution chain");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("强隔离路径会按 execution class fail-closed：sandbox 当前 blocked。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("tool governance");
    expect(html).toContain("优先回到 Alpha workflow 补齐 catalog gap（tool-missing）");
    expect(html).toContain('/workflows/workflow-1');
    expect(html).toContain("回到 workflow 编辑器");
  });

  it("prioritizes legacy publish auth cleanup in workflow library governance", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-legacy-auth",
        name: "Legacy Auth workflow",
        version: "1.2.0",
        status: "draft",
        node_count: 5,
        definition_issues: [
          {
            category: "publish_draft",
            message: "Public Search 当前不能使用 authMode = token。",
            path: "publish.0.authMode",
            field: "authMode"
          }
        ],
        tool_governance: {
          referenced_tool_ids: ["tool-1"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      },
      {
        id: "workflow-missing-tool",
        name: "Tooling workflow",
        version: "1.0.0",
        status: "published",
        node_count: 2,
        tool_governance: {
          referenced_tool_ids: ["tool-2"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }
    ]);

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("Publish auth workflows");
    expect(html).toContain("Legacy Auth workflow · publish auth blocker");
    expect(html).toContain("1 publish auth blocker");
    expect(html).toContain("publish auth cleanup");
    expect(html).toContain(
      "优先回到 Legacy Auth workflow 处理 1 个 publish draft：先把 workflow draft endpoint 切回 api_key/internal 并保存"
    );
    expect(html).toContain('/workflows/workflow-legacy-auth');
  });

  it("prioritizes shared operator backlog follow-up before local workflow cleanup", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot({
        summary: {
          ...buildSensitiveAccessInboxSnapshot().summary,
          ticket_count: 1,
          pending_ticket_count: 1,
          affected_run_count: 1,
          affected_workflow_count: 1,
          primary_resource: buildSensitiveAccessResourceFixture({
            label: "Workflow secret",
            sensitivity_level: "L3",
            source: "credential"
          })
        }
      })
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-1",
        name: "Alpha workflow",
        version: "1.0.0",
        status: "draft",
        node_count: 3,
        definition_issues: [],
        tool_governance: {
          referenced_tool_ids: ["tool-missing"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }
    ]);

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("pending approval ticket");
    expect(html).toContain("当前 Workflow secret 仍是 operator inbox 的首要治理资源");
    expect(html).toContain("Primary governed resource: Workflow secret.");
    expect(html).toContain('/sensitive-access?status=pending');
    expect(html).toContain("跨 workflow catalog gap handoff");
    expect(html).toContain(
      "当前 workflow 仍引用目录里不存在的 tool：tool-missing；补齐 binding 后即可清空当前范围里的 missing-tool backlog。"
    );
    expect(html).toContain('/workflows/workflow-1?definition_issue=missing_tool');
    expect(html).not.toContain("publish auth cleanup");
  });

  it("projects workflow library digest to a focused trace slice when operator backlog already has focus-node facts", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot({
        summary: {
          ...buildSensitiveAccessInboxSnapshot().summary,
          ticket_count: 1,
          pending_ticket_count: 1,
          waiting_ticket_count: 1
        },
        entries: [
          {
            ticket: {
              id: "ticket-workflow-1",
              access_request_id: "request-workflow-1",
              run_id: "run-workflow-entry",
              node_run_id: "node-workflow-entry",
              status: "pending",
              waiting_status: "waiting",
              created_at: "2026-03-22T10:00:00Z"
            },
            request: {
              id: "request-workflow-1",
              run_id: "run-workflow-entry",
              node_run_id: "node-workflow-entry",
              requester_type: "ai",
              requester_id: "agent-workflow",
              resource_id: "resource-workflow-secret",
              action_type: "read",
              created_at: "2026-03-22T09:59:00Z"
            },
            resource: {
              id: "resource-workflow-secret",
              label: "Workflow secret",
              sensitivity_level: "L3",
              source: "credential",
              metadata: {},
              created_at: "2026-03-22T09:00:00Z",
              updated_at: "2026-03-22T09:30:00Z"
            },
            notifications: [],
            callbackWaitingContext: null,
            executionContext: {
              runId: "run-workflow-focus",
              focusNode: {
                node_run_id: "node-workflow-focus",
                node_id: "workflow-approval-node",
                node_name: "Workflow Approval",
                node_type: "tool",
                callback_tickets: [],
                sensitive_access_entries: [],
                execution_fallback_count: 0,
                execution_blocked_count: 0,
                execution_unavailable_count: 0,
                artifact_refs: [],
                artifacts: [],
                tool_calls: []
              },
              focusReason: "current_node",
              focusExplanation: null,
              focusMatchesEntry: false,
              entryNodeRunId: "node-workflow-entry",
              skillTrace: null
            }
          }
        ]
      })
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-1",
        name: "Alpha workflow",
        version: "1.0.0",
        status: "draft",
        node_count: 1,
        definition_issues: [],
        tool_governance: {
          referenced_tool_ids: [],
          missing_tool_ids: [],
          governed_tool_count: 0,
          strong_isolation_tool_count: 0
        }
      }
    ]);

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("Cross-entry risk digest");
    expect(html).toContain("jump to focused trace slice");
    expect(html).toContain(
      '/runs/run-workflow-focus?node_run_id=node-workflow-focus#run-diagnostics-execution-timeline'
    );
    expect(html).toContain('/sensitive-access?status=pending');
  });

  it("surfaces cross-workflow legacy auth governance artifact in the library", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-legacy-auth",
        name: "Legacy Auth workflow",
        version: "1.2.0",
        status: "draft",
        node_count: 5,
        tool_governance: {
          referenced_tool_ids: ["tool-1"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      },
      {
        id: "workflow-replacement",
        name: "Replacement Ready workflow",
        version: "1.0.0",
        status: "published",
        node_count: 2,
        tool_governance: {
          referenced_tool_ids: ["tool-2"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }
    ]);
    vi.mocked(getWorkflowPublishedEndpointLegacyAuthGovernanceSnapshot).mockResolvedValue(
      buildLegacyAuthGovernanceSnapshot({
        workflow_count: 2,
        binding_count: 4,
        summary: {
          draft_candidate_count: 1,
          published_blocker_count: 2,
          offline_inventory_count: 1
        },
        checklist: [
          {
            key: "draft_cleanup",
            title: "先批量下线 draft legacy bindings",
            tone: "ready",
            tone_label: "可立即执行",
            count: 1,
            detail: "先处理 draft cleanup。"
          },
          {
            key: "published_follow_up",
            title: "再补发支持鉴权的 replacement bindings",
            tone: "manual",
            tone_label: "人工跟进",
            count: 2,
            detail: "再处理仍 live 的 published blocker。"
          }
        ],
        workflows: [
          buildLegacyAuthGovernanceWorkflowFixture({
            workflow_id: "workflow-legacy-auth",
            workflow_name: "Legacy Auth workflow",
            binding_count: 3,
            draft_candidate_count: 1,
            published_blocker_count: 1,
            offline_inventory_count: 1
          }),
          buildLegacyAuthGovernanceWorkflowFixture({
            workflow_id: "workflow-replacement",
            workflow_name: "Replacement Ready workflow",
            binding_count: 1,
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 0
          })
        ],
        buckets: {
          draft_candidates: [
            buildLegacyAuthGovernanceBindingFixture({
              binding_id: "binding-draft",
              workflow_version: "1.2.0",
              lifecycle_status: "draft"
            })
          ],
          published_blockers: [
            buildLegacyAuthGovernanceBindingFixture({
              binding_id: "binding-live",
              workflow_version: "1.1.0"
            }),
            buildLegacyAuthGovernanceBindingFixture({
              workflow_id: "workflow-replacement",
              workflow_name: "Replacement Ready workflow",
              binding_id: "binding-live-2",
              workflow_version: "1.0.0"
            })
          ],
          offline_inventory: [
            buildLegacyAuthGovernanceBindingFixture({
              binding_id: "binding-offline",
              workflow_version: "1.0.0",
              lifecycle_status: "offline"
            })
          ]
        }
      })
    );

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("Legacy publish auth artifact");
    expect(html).toContain("跨 workflow operator checklist 与 governance export");
    expect(html).toContain("Affected workflows");
    expect(html).toContain("Legacy Auth workflow");
    expect(html).toContain("Replacement Ready workflow");
    expect(html).toContain("导出 JSON 清单");
    expect(html).toContain("只看 blocker workflow");
    expect(html).toContain('/workflows/workflow-legacy-auth?definition_issue=legacy_publish_auth');
  });

  it("filters the workflow chip list down to legacy publish auth blockers", async () => {
    vi.mocked(getWorkflows).mockReset();
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockImplementation(async (options?: { definitionIssue?: string | null }) => {
      const legacyWorkflow = {
        id: "workflow-legacy-auth",
        name: "Legacy Auth workflow",
        version: "1.2.0",
        status: "draft",
        node_count: 5,
        definition_issues: [
          {
            category: "publish_draft",
            message: "Public Search 当前不能使用 authMode = token。",
            path: "publish.0.authMode",
            field: "authMode"
          }
        ],
        tool_governance: {
          referenced_tool_ids: ["tool-1"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      };
      const cleanWorkflow = {
        id: "workflow-clean",
        name: "Clean workflow",
        version: "1.0.0",
        status: "published",
        node_count: 2,
        tool_governance: {
          referenced_tool_ids: ["tool-2"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      };

      return options?.definitionIssue === "legacy_publish_auth"
        ? [legacyWorkflow]
        : [legacyWorkflow, cleanWorkflow];
    });

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({
          definition_issue: "legacy_publish_auth"
        })
      })
    );

    expect(getWorkflows).toHaveBeenCalledTimes(2);
    expect(getWorkflows).toHaveBeenNthCalledWith(1);
    expect(getWorkflows).toHaveBeenNthCalledWith(2, {
      definitionIssue: "legacy_publish_auth"
    });
    expect(html).toContain("当前列表只显示 legacy publish auth blocker，共 1 / 2 个 workflow");
    expect(html).toContain(
      '/workflows/workflow-legacy-auth?definition_issue=legacy_publish_auth'
    );
    expect(html).toContain('/workflows?definition_issue=legacy_publish_auth');
    expect(html).not.toContain('/workflows/workflow-clean?definition_issue=legacy_publish_auth');
  });

  it("filters the workflow chip list down to catalog gap blockers", async () => {
    vi.mocked(getWorkflows).mockReset();
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockImplementation(async (options?: { definitionIssue?: string | null }) => {
      const missingToolWorkflow = {
        id: "workflow-missing-tool",
        name: "Missing Tool workflow",
        version: "1.1.0",
        status: "draft",
        node_count: 4,
        tool_governance: {
          referenced_tool_ids: ["tool-1", "tool-missing"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      };
      const cleanWorkflow = {
        id: "workflow-clean",
        name: "Clean workflow",
        version: "1.0.0",
        status: "published",
        node_count: 2,
        tool_governance: {
          referenced_tool_ids: ["tool-2"],
          missing_tool_ids: [],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      };

      return options?.definitionIssue === "missing_tool"
        ? [missingToolWorkflow]
        : [missingToolWorkflow, cleanWorkflow];
    });

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({
          definition_issue: "missing_tool"
        })
      })
    );

    expect(getWorkflows).toHaveBeenCalledTimes(2);
    expect(getWorkflows).toHaveBeenNthCalledWith(1);
    expect(getWorkflows).toHaveBeenNthCalledWith(2, {
      definitionIssue: "missing_tool"
    });
    expect(html).toContain("当前列表只显示存在 catalog gap 的 workflow，共 1 / 2 个 workflow");
    expect(html).toContain('/workflows/workflow-missing-tool?definition_issue=missing_tool');
    expect(html).toContain('/workflows?definition_issue=missing_tool');
    expect(html).not.toContain('/workflows/workflow-clean?definition_issue=missing_tool');
  });

  it("routes the empty state back to starter governance when the first active starter still needs follow-up", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(
      buildWorkflowLibrarySnapshot({
        starters: [
          buildStarter({
            id: "starter-governed",
            name: "Governed starter",
            sourceGovernance: {
              kind: "missing_source",
              statusLabel: "来源缺失",
              summary: "The source workflow is missing.",
              sourceWorkflowId: "source-workflow",
              sourceWorkflowName: "Source workflow",
              templateVersion: "0.1.0",
              sourceVersion: null,
              actionDecision: null,
              outcomeExplanation: null
            }
          })
        ]
      })
    );

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("当前还没有可编辑的 workflow");
    expect(html).toContain("Governed starter 当前是 workflow library 空态下最先需要处理的 starter。");
    expect(html).toContain("Primary governed starter: Governed starter · 来源缺失 · source Source workflow.");
    expect(html).toContain("确认模板后带此 starter 回到创建页");
    expect(html).toContain(
      "/workflows/new?needs_follow_up=true&amp;source_governance_kind=missing_source&amp;starter=starter-governed&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
    expect(html.match(/Recommended next step/g)).toHaveLength(1);
    expect(html).toContain("没有缺失 catalog tool");
  });

  it("prioritizes missing-tool starter follow-up when the workflow library is empty", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(
      buildWorkflowLibrarySnapshot({
        starters: [
          buildStarter({
            id: "starter-governed",
            name: "Governed starter",
            createdFromWorkflowId: "workflow-source-missing-tool",
            createdFromWorkflowVersion: "0.4.0",
            toolGovernance: {
              referencedToolIds: ["native.risk-search", "native.catalog-gap"],
              referencedTools: [],
              missingToolIds: ["native.catalog-gap"],
              governedToolCount: 1,
              strongIsolationToolCount: 1
            },
            sourceGovernance: {
              kind: "synced",
              statusLabel: "已对齐",
              summary: "Source workflow is still available.",
              sourceWorkflowId: "workflow-source-missing-tool",
              sourceWorkflowName: "Source workflow",
              templateVersion: "0.4.0",
              sourceVersion: "0.4.0",
              actionDecision: null,
              outcomeExplanation: null
            }
          })
        ]
      })
    );

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("Governed starter 当前是 workflow library 空态下最先需要处理的 starter。");
    expect(html).toContain("catalog gap");
    expect(html).toContain(
      "Primary governed starter: Governed starter · catalog gap · native.catalog-gap · source 0.4.0."
    );
    expect(html).toContain(
      "当前 starter 仍引用目录里不存在的 tool：native.catalog-gap；先回源 workflow 补齐 tool binding，再回来继续复用或创建。"
    );
    expect(html).toContain("打开源 workflow");
    expect(html).toContain("/workflows/workflow-source-missing-tool");
    expect(html).toContain("definition_issue=missing_tool");
    expect(html).toContain("starter=starter-governed");
    expect(html).not.toContain("确认模板后带此 starter 回到创建页");
    expect(html).not.toContain("带此 starter 回到创建页");
    expect(html.match(/Recommended next step/g)).toHaveLength(1);
  });

  it("prefers a starter-scoped create entry when the workflow library is empty but an active starter is ready", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(
      buildWorkflowLibrarySnapshot({
        starters: [buildStarter()]
      })
    );

    const html = renderToStaticMarkup(await WorkflowsPage());

    expect(html).toContain("OpenClaw starter 当前是 workflow library 空态下最先可继续推进的 starter。");
    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain("Primary governed starter: OpenClaw starter · 无来源.");
    expect(html).toContain("/workflows/new?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92");
    expect(html.match(/Recommended next step/g)).toHaveLength(1);
  });

  it("preserves workspace starter scope across workflow library links", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());
    vi.mocked(getWorkflows).mockResolvedValue([
      {
        id: "workflow-1",
        name: "Scoped workflow",
        version: "1.0.0",
        status: "draft",
        node_count: 4,
        tool_governance: {
          referenced_tool_ids: ["tool-1"],
          missing_tool_ids: ["tool-missing"],
          governed_tool_count: 1,
          strong_isolation_tool_count: 0
        }
      }
    ]);

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({
          track: "应用新建编排",
          starter: "starter-openclaw"
        })
      })
    );

    expect(html).toContain(
      '/workflows/new?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain(
      '/workspace-starters?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain(
      '/workflows/workflow-1?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
  });

  it("keeps the fallback starter-library CTA inside the current starter scope", async () => {
    vi.mocked(getSystemOverview).mockResolvedValue(buildSystemOverview());
    vi.mocked(getSensitiveAccessInboxSnapshot).mockResolvedValue(
      buildSensitiveAccessInboxSnapshot()
    );
    vi.mocked(getWorkflows).mockResolvedValue([]);
    vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue(buildWorkflowLibrarySnapshot());

    const html = renderToStaticMarkup(
      await WorkflowsPage({
        searchParams: Promise.resolve({
          track: "应用新建编排",
          starter: "starter-openclaw"
        })
      })
    );

    expect(html).toContain("starter library");
    expect(html).toContain(
      '/workspace-starters?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
  });
});
