import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import WorkflowsPage from "@/app/workflows/page";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflows } from "@/lib/get-workflows";

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

function buildSensitiveAccessInboxSnapshot() {
  return {
    channels: [],
    resources: [],
    requests: [],
    notifications: [],
    summary: {
      ticket_count: 0,
      pending_ticket_count: 0,
      approved_ticket_count: 0,
      rejected_ticket_count: 0,
      expired_ticket_count: 0,
      waiting_ticket_count: 0,
      resumed_ticket_count: 0,
      failed_ticket_count: 0,
      pending_notification_count: 0,
      delivered_notification_count: 0,
      failed_notification_count: 0
    },
    entries: []
  } as Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>;
}

function buildSystemOverview() {
  return {
    status: "ok",
    environment: "local",
    services: [],
    capabilities: [],
    plugin_adapters: [],
    sandbox_backends: [],
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
    },
    plugin_tools: [],
    runtime_activity: {
      summary: {
        recent_run_count: 0,
        recent_event_count: 0,
        run_statuses: {},
        event_types: {}
      },
      recent_runs: [],
      recent_events: []
    },
    callback_waiting_automation: {
      status: "configured",
      scheduler_required: true,
      detail: "healthy",
      scheduler_health_status: "healthy",
      scheduler_health_detail: "healthy",
      steps: []
    }
  };
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
    expect(html).toContain("Alpha workflow · missing tools");
    expect(html).toContain("Sandbox execution chain");
    expect(html).toContain("Live sandbox readiness");
    expect(html).toContain("强隔离路径会按 execution class fail-closed：sandbox 当前 blocked。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("tool governance");
    expect(html).toContain("优先回到 Alpha workflow 补齐 1 个 missing tool");
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
      "优先回到 Legacy Auth workflow 把 1 个 publish draft 的 authMode 切回 api_key / internal"
    );
    expect(html).toContain('/workflows/workflow-legacy-auth');
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
    expect(html).toContain("starter governance");
    expect(html).toContain("仍处于来源缺失");
    expect(html).toContain("回到治理页");
    expect(html).toContain("/workspace-starters?needs_follow_up=true&amp;source_governance_kind=missing_source&amp;starter=starter-governed");
    expect(html).toContain("没有缺失 catalog tool");
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

    expect(html).toContain("first workflow");
    expect(html).toContain("优先从 starter OpenClaw starter 创建首个草稿");
    expect(html).toContain("用这个 starter 创建 workflow");
    expect(html).toContain("/workflows/new?starter=starter-openclaw&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92");
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
