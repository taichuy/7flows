import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowApiPage from "@/app/workflows/[workflowId]/api/page";
import WorkflowDetailCompatPage from "@/app/workflows/[workflowId]/page";
import WorkflowEditorPage from "@/app/workflows/[workflowId]/editor/page";
import WorkflowLogsPage from "@/app/workflows/[workflowId]/logs/page";
import WorkflowMonitorPage from "@/app/workflows/[workflowId]/monitor/page";
import WorkflowPublishPage from "@/app/workflows/[workflowId]/publish/page";
import {
  getServerPublishedEndpointInvocationDetail as getPublishedEndpointInvocationDetail,
  getServerRunDetail as getRunDetail,
  getServerRunEvidenceView as getRunEvidenceView,
  getServerRunExecutionView as getRunExecutionView,
  getServerWorkflowDetail,
  getServerWorkflowPublishedEndpoints,
  getServerWorkflowRuns as getWorkflowRuns,
  getServerWorkspaceContext,
  requireServerWorkflowStudioSurfaceAccess
} from "@/lib/server-workspace-access";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import {
  canAccessWorkflowStudioSurface,
  getWorkspaceConsolePageHref
} from "@/lib/workspace-console";
import type { WorkspaceContextResponse } from "@/lib/workspace-access";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  },
  notFound: () => {
    throw new Error("notFound");
  }
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/app/actions/publish", () => ({
  invokePublishedEndpointSample: vi.fn()
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({
    children,
    activeNav,
    layout,
    navigationHrefOverrides
  }: {
    children: ReactNode;
    activeNav?: string;
    layout?: string;
    navigationHrefOverrides?: { tools?: string };
  }) =>
    createElement(
      "div",
      {
        "data-component": "workspace-shell",
        "data-active-nav": activeNav ?? "none",
        "data-layout": layout ?? "default",
        "data-tools-href": navigationHrefOverrides?.tools ?? "none"
      },
      children
    )
}));

vi.mock("@/components/workflow-editor-workbench-entry", () => ({
  WorkflowEditorWorkbenchEntry: ({
    workflow,
    bootstrapRequest
  }: {
    workflow: { id: string };
    bootstrapRequest: { workflowId: string; surface: string };
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-editor-workbench-entry",
        "data-workflow-id": workflow.id,
        "data-bootstrap-workflow-id": bootstrapRequest.workflowId,
        "data-bootstrap-surface": bootstrapRequest.surface
      },
      workflow.id
    )
}));

vi.mock("@/components/run-diagnostics-execution-sections", () => ({
  RunDiagnosticsExecutionSections: ({
    executionView,
    evidenceView,
    workflowId,
    runDetailHref
  }: {
    executionView: { run_id?: string | null } | null;
    evidenceView: { summary?: { node_count?: number | null } | null } | null;
    workflowId?: string | null;
    runDetailHref?: string | null;
  }) =>
    createElement(
      "div",
      {
        "data-component": "run-diagnostics-execution-sections",
        "data-run-id": executionView?.run_id ?? "none",
        "data-workflow-id": workflowId ?? "none",
        "data-run-detail-href": runDetailHref ?? "none",
        "data-evidence-node-count": evidenceView?.summary?.node_count ?? 0
      },
      executionView?.run_id ?? "none"
    )
}));

vi.mock("@/components/workflow-publish-panel", () => ({
  WorkflowPublishPanel: ({
    workflow,
    expandedBindingId
  }: {
    workflow: { id: string };
    expandedBindingId?: string | null;
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-publish-panel",
        "data-workflow-id": workflow.id,
        "data-expanded-binding-id": expandedBindingId ?? "none"
      },
      workflow.id
    )
}));

vi.mock("@/components/workflow-publish-invocation-entry-card", () => ({
  WorkflowPublishInvocationEntryCard: ({
    item,
    detailHref,
    detailActive
  }: {
    item: { id: string };
    detailHref: string;
    detailActive: boolean;
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-publish-invocation-entry-card",
        "data-invocation-id": item.id,
        "data-detail-href": detailHref,
        "data-detail-active": detailActive ? "true" : "false"
      },
      item.id
    )
}));

vi.mock("@/components/workflow-publish-invocation-detail-panel", () => ({
  WorkflowPublishInvocationDetailPanel: ({
    detail,
    currentHref,
    clearHref
  }: {
    detail: { invocation: { id: string } };
    currentHref?: string | null;
    clearHref: string;
  }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-publish-invocation-detail-panel",
        "data-invocation-id": detail.invocation.id,
        "data-current-href": currentHref ?? "none",
        "data-clear-href": clearHref
      },
      detail.invocation.id
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerPublishedEndpointInvocationDetail: vi.fn(),
  getServerRunDetail: vi.fn(),
  getServerRunEvidenceView: vi.fn(),
  getServerRunExecutionView: vi.fn(),
  getServerWorkflowDetail: vi.fn(),
  getServerWorkflowPublishedEndpoints: vi.fn(),
  getServerWorkflowRuns: vi.fn(),
  getServerWorkspaceContext: vi.fn(),
  requireServerWorkflowStudioSurfaceAccess: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-plugin-registry", () => ({
  getPluginRegistrySnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

vi.mock("@/lib/get-workflow-publish-governance", () => ({
  getWorkflowPublishGovernanceSnapshot: vi.fn()
}));

function buildWorkspaceContext(): WorkspaceContextResponse {
  return {
    workspace: {
      id: "default",
      name: "7Flows Workspace",
      slug: "sevenflows"
    },
    current_user: {
      id: "user-admin",
      email: "admin@taichuy.com",
      display_name: "7Flows Admin",
      status: "active",
      last_login_at: "2026-03-28T09:00:00Z"
    },
    current_member: {
      id: "member-owner",
      role: "owner",
      user: {
        id: "user-admin",
        email: "admin@taichuy.com",
        display_name: "7Flows Admin",
        status: "active",
        last_login_at: "2026-03-28T09:00:00Z"
      },
      created_at: "2026-03-27T12:00:00Z",
      updated_at: "2026-03-27T12:00:00Z"
    },
    available_roles: ["owner", "admin", "editor", "viewer"],
    can_manage_members: true
  };
}

function buildWorkflowRun(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workflow_id: "workflow-1",
    workflow_version: "v1",
    status: "succeeded",
    error_message: null,
    created_at: "2026-03-31T08:00:00Z",
    started_at: "2026-03-31T08:00:10Z",
    finished_at: "2026-03-31T08:00:20Z",
    node_run_count: 3,
    event_count: 6,
    last_event_at: "2026-03-31T08:00:20Z",
    tool_governance: null,
    ...overrides
  } as Awaited<ReturnType<typeof getWorkflowRuns>>[number];
}

function buildPublishedBinding(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workflow_id: "workflow-1",
    workflow_version_id: "workflow-version-1",
    workflow_version: "v1",
    target_workflow_version_id: "workflow-version-1",
    target_workflow_version: "v1",
    compiled_blueprint_id: "blueprint-1",
    endpoint_id: `${id}-endpoint`,
    endpoint_name: `Endpoint ${id}`,
    endpoint_alias: `${id}.alias`,
    route_path: `/published/${id}`,
    protocol: "native",
    auth_mode: "api_key",
    streaming: false,
    lifecycle_status: "published",
    input_schema: {},
    output_schema: null,
    created_at: "2026-03-31T08:00:00Z",
    updated_at: "2026-03-31T08:00:00Z",
    activity: {
      total_count: 4,
      succeeded_count: 3,
      failed_count: 1,
      rejected_count: 0,
      cache_hit_count: 1,
      cache_miss_count: 2,
      cache_bypass_count: 1,
      pending_approval_count: 1,
      pending_notification_count: 0,
      primary_sensitive_resource: null,
    },
    ...overrides,
  } as Awaited<ReturnType<typeof getServerWorkflowPublishedEndpoints>>[number];
}

function buildPublishedInvocationAudit(overrides: Record<string, unknown> = {}) {
  return {
    filters: {},
    summary: {
      total_count: 4,
      succeeded_count: 3,
      failed_count: 1,
      rejected_count: 0,
      cache_hit_count: 1,
      cache_miss_count: 2,
      cache_bypass_count: 1,
      pending_approval_count: 1,
      pending_notification_count: 0,
      primary_sensitive_resource: null,
    },
    facets: {
      status_counts: [],
      request_source_counts: [],
      request_surface_counts: [],
      cache_status_counts: [],
      run_status_counts: [],
      reason_counts: [],
      api_key_usage: [],
      recent_failure_reasons: [],
      timeline_granularity: "hour",
      timeline: [],
    },
    items: [],
    ...overrides,
  } as NonNullable<
    Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>["invocationAuditsByBinding"][string]
  >;
}

function buildPublishedInvocationItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workflow_id: "workflow-1",
    binding_id: "binding-1",
    endpoint_id: "binding-1-endpoint",
    endpoint_alias: "binding-1.alias",
    route_path: "/published/binding-1",
    protocol: "native",
    auth_mode: "api_key",
    request_source: "workflow",
    request_surface: "native.workflow",
    status: "failed",
    cache_status: "miss",
    run_id: "run-1",
    run_status: "failed",
    run_current_node_id: "node-1",
    run_waiting_reason: null,
    run_waiting_lifecycle: null,
    run_snapshot: null,
    run_follow_up: null,
    execution_focus_explanation: null,
    callback_waiting_explanation: null,
    reason_code: "runtime_failed",
    error_message: "Tool timed out",
    request_preview: { key_count: 1, keys: ["message"], sample: { message: "hi" } },
    response_preview: null,
    duration_ms: 1200,
    created_at: "2026-03-31T09:00:00Z",
    finished_at: "2026-03-31T09:00:01Z",
    ...overrides
  } as NonNullable<
    Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>["invocationAuditsByBinding"][string]
  >["items"][number];
}

function buildPublishedInvocationDetail(
  id: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    kind: "ok",
    data: {
      invocation: buildPublishedInvocationItem(id),
      run: {
        id: "run-1",
        status: "failed",
        current_node_id: "node-1",
        error_message: "Tool timed out",
        created_at: "2026-03-31T09:00:00Z"
      },
      run_snapshot: {
        status: "failed",
        current_node_id: "node-1"
      },
      run_follow_up: null,
      blocking_node_run_id: null,
      execution_focus_reason: null,
      execution_focus_node: null,
      execution_focus_explanation: {
        primary_signal: "Tool timed out",
        follow_up: "打开 run trace 继续排障。"
      },
      callback_waiting_explanation: null,
      skill_trace: null,
      blocking_sensitive_access_entries: [],
      sensitive_access_entries: [],
      callback_tickets: [],
      cache: {
        cache_status: "miss",
        cache_key: null,
        cache_entry_id: null,
        inventory_entry: null
      },
      legacy_auth_governance: null,
      ...overrides
    }
  } as Awaited<ReturnType<typeof getPublishedEndpointInvocationDetail>>;
}

function buildRunDetailSnapshot(runId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: runId,
    workflow_id: "workflow-1",
    workflow_version: "v1",
    compiled_blueprint_id: null,
    status: "succeeded",
    input_payload: { message: "hello" },
    checkpoint_payload: {},
    output_payload: { answer: "ok" },
    error_message: null,
    current_node_id: "node-1",
    started_at: "2026-03-31T08:00:10Z",
    finished_at: "2026-03-31T08:00:20Z",
    created_at: "2026-03-31T08:00:00Z",
    event_count: 6,
    event_type_counts: { run_started: 1, node_completed: 3 },
    first_event_at: "2026-03-31T08:00:10Z",
    last_event_at: "2026-03-31T08:00:20Z",
    blocking_node_run_id: null,
    execution_focus_reason: "current_node",
    execution_focus_node: {
      node_run_id: "node-run-1",
      node_id: "node-1",
      node_name: "LLM Agent",
      node_type: "llm",
      status: "succeeded",
      artifact_refs: [],
      artifacts: [],
      tool_calls: []
    },
    execution_focus_explanation: {
      primary_signal: "current node",
      follow_up: "review execution and evidence"
    },
    execution_focus_skill_trace: null,
    tool_governance: null,
    legacy_auth_governance: null,
    run_follow_up: null,
    node_runs: [],
    artifacts: [],
    tool_calls: [],
    ai_calls: [],
    events: [],
    ...overrides
  } as Awaited<ReturnType<typeof getRunDetail>>;
}

function buildExecutionView(runId: string, overrides: Record<string, unknown> = {}) {
  return {
    run_id: runId,
    workflow_id: "workflow-1",
    workflow_version: "v1",
    compiled_blueprint_id: null,
    status: "succeeded",
    summary: {
      node_run_count: 0,
      waiting_node_count: 0,
      errored_node_count: 0,
      execution_dispatched_node_count: 0,
      execution_fallback_node_count: 0,
      execution_blocked_node_count: 0,
      execution_unavailable_node_count: 0,
      artifact_count: 0,
      tool_call_count: 0,
      ai_call_count: 0,
      assistant_call_count: 0,
      callback_ticket_count: 0,
      skill_reference_load_count: 0,
      sensitive_access_request_count: 0,
      sensitive_access_approval_ticket_count: 0,
      sensitive_access_notification_count: 0,
      artifact_kind_counts: {},
      tool_status_counts: {},
      ai_role_counts: {},
      execution_requested_class_counts: {},
      execution_effective_class_counts: {},
      execution_executor_ref_counts: {},
      execution_sandbox_backend_counts: {},
      skill_reference_phase_counts: {},
      skill_reference_source_counts: {},
      callback_ticket_status_counts: {},
      sensitive_access_decision_counts: {},
      sensitive_access_approval_status_counts: {},
      sensitive_access_notification_status_counts: {},
      callback_waiting: {
        node_count: 0,
        terminated_node_count: 0,
        issued_ticket_count: 0,
        expired_ticket_count: 0,
        consumed_ticket_count: 0,
        canceled_ticket_count: 0,
        late_callback_count: 0,
        resume_schedule_count: 0,
        scheduled_resume_pending_node_count: 0,
        scheduled_resume_requeued_node_count: 0,
        resume_source_counts: {},
        scheduled_resume_source_counts: {},
        termination_reason_counts: {}
      }
    },
    blocking_node_run_id: null,
    execution_focus_reason: null,
    execution_focus_node: null,
    execution_focus_explanation: null,
    legacy_auth_governance: null,
    run_snapshot: null,
    run_follow_up: null,
    skill_trace: null,
    nodes: [],
    ...overrides
  } as Awaited<ReturnType<typeof getRunExecutionView>>;
}

function buildEvidenceView(runId: string, overrides: Record<string, unknown> = {}) {
  return {
    run_id: runId,
    workflow_id: "workflow-1",
    workflow_version: "v1",
    status: "succeeded",
    summary: {
      node_count: 1,
      artifact_count: 0,
      tool_call_count: 0,
      assistant_call_count: 0
    },
    nodes: [],
    ...overrides
  } as Awaited<ReturnType<typeof getRunEvidenceView>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
  vi.mocked(requireServerWorkflowStudioSurfaceAccess).mockImplementation(
    async ({
      surface,
      requestedHref
    }: {
      surface: Parameters<typeof canAccessWorkflowStudioSurface>[0];
      requestedHref: string;
    }) => {
      const workspaceContext = await getServerWorkspaceContext();

      if (!workspaceContext) {
        throw new Error(`redirect:/login?next=${encodeURIComponent(requestedHref)}`);
      }

      if (!canAccessWorkflowStudioSurface(surface, workspaceContext)) {
        throw new Error(`redirect:${getWorkspaceConsolePageHref("workspace")}`);
      }

      return workspaceContext;
    }
  );
  vi.mocked(getServerWorkflowDetail).mockResolvedValue({
    id: "workflow-1",
    name: "Workflow 1"
  } as Awaited<ReturnType<typeof getServerWorkflowDetail>>);
  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
    nodes: [],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [],
    toolSourceLanes: [],
    tools: []
  } as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
  vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
    adapters: [],
    tools: []
  } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);
  vi.mocked(getSystemOverview).mockResolvedValue({
    callback_waiting_automation: null,
    sandbox_readiness: null,
    sandbox_backends: [],
    runtime_activity: {
      recent_runs: [],
      recent_events: [],
      summary: {
        recent_run_count: 0,
        recent_event_count: 0,
        run_statuses: {},
        event_types: {}
      }
    }
  } as unknown as Awaited<ReturnType<typeof getSystemOverview>>);
  vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue(
    [] as Awaited<ReturnType<typeof getServerWorkflowPublishedEndpoints>>
  );
  vi.mocked(getWorkflowRuns).mockResolvedValue(
    [] as Awaited<ReturnType<typeof getWorkflowRuns>>
  );
  vi.mocked(getRunDetail).mockResolvedValue(null);
  vi.mocked(getRunExecutionView).mockResolvedValue(null);
  vi.mocked(getRunEvidenceView).mockResolvedValue(null);
  vi.mocked(getPublishedEndpointInvocationDetail).mockResolvedValue(null);
  vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
    cacheInventories: {},
    apiKeysByBinding: {},
    invocationAuditsByBinding: {},
    invocationDetailsByBinding: {},
    rateLimitWindowAuditsByBinding: {}
  } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);
});

describe("Workflow studio routes", () => {
  it("redirects the legacy detail route to the canonical editor surface", async () => {
    await expect(
      WorkflowDetailCompatPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/workflows/workflow-1/editor");
  });

  it("preserves non-surface search params when redirecting to publish", async () => {
    await expect(
      WorkflowDetailCompatPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({
          surface: "publish",
          track: "应用新建编排",
          publish_binding: "binding-1"
        })
      })
    ).rejects.toThrowError(
      "redirect:/workflows/workflow-1/publish?publish_binding=binding-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    );
  });

  it("redirects legacy monitor surface requests to the canonical monitor route", async () => {
    await expect(
      WorkflowDetailCompatPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({
          surface: "monitor",
          run: "run-1"
        })
      })
    ).rejects.toThrowError("redirect:/workflows/workflow-1/monitor?run=run-1");
  });

  it("renders only the editor surface on the canonical editor route", async () => {
    const html = renderToStaticMarkup(
      await WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-active-nav="workflows"');
    expect(html).toContain('data-layout="editor"');
    expect(html).toContain('data-component="workflow-editor-workbench-entry"');
    expect(html).not.toContain('data-component="workflow-publish-panel"');
    expect(html).toContain('data-workflow-id="workflow-1"');
    expect(html).toContain('data-bootstrap-workflow-id="workflow-1"');
    expect(html).toContain('data-bootstrap-surface="editor"');
    expect(html).toContain("workflow-studio-shell-bar workflow-studio-shell-bar-compact");
    expect(html).toContain("Workflow 1");
    expect(html).toContain("draft only");
    expect(html).toContain("xyflow studio");
    expect(html).toContain("运行诊断");
    expect(html).toContain("Starter 模板");
    expect(html).toContain("编排中心");
    expect(html).toContain(
      'data-tools-href="/workspace/tools?return_href=%2Fworkflows%2Fworkflow-1%2Feditor&amp;workflow_id=workflow-1&amp;workflow_surface=editor"'
    );
    expect(html).toContain("/workflows/workflow-1/editor");
    expect(html).toContain("/workflows/workflow-1/publish");
    expect(html).not.toContain("?surface=");
    expect(vi.mocked(getServerWorkflowPublishedEndpoints)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowLibrarySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getPluginRegistrySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getSystemOverview)).not.toHaveBeenCalled();
    expect(vi.mocked(getServerWorkflowPublishedEndpoints)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
  });

  it("keeps the canonical publish route on the summary bootstrap seam by default", async () => {
    const html = renderToStaticMarkup(
      await WorkflowPublishPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workflow-publish-panel"');
    expect(html).toContain('data-expanded-binding-id="none"');
    expect(html).not.toContain('data-component="workflow-editor-workbench"');
    expect(html).toContain(
      'data-tools-href="/workspace/tools?return_href=%2Fworkflows%2Fworkflow-1%2Fpublish&amp;workflow_id=workflow-1&amp;workflow_surface=publish"'
    );
    expect(html).toContain("publish governance");
    expect(html).toContain("Workflow 1");
    expect(html).toContain("draft only");
    expect(html).toContain("/workflows/workflow-1/editor");
    expect(html).toContain("/workflows/workflow-1/publish");
    expect(vi.mocked(getServerWorkflowPublishedEndpoints)).toHaveBeenCalledWith("workflow-1", {
      includeAllVersions: true
    });
    expect(vi.mocked(getPluginRegistrySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getSystemOverview)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowLibrarySnapshot)).not.toHaveBeenCalled();
  });

  it("loads publish governance detail only when a binding is explicitly selected", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      { id: "binding-1" }
    ] as Awaited<ReturnType<typeof getServerWorkflowPublishedEndpoints>>);

    const html = renderToStaticMarkup(
      await WorkflowPublishPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({ publish_binding: "binding-1" })
      })
    );

    expect(html).toContain('data-component="workflow-publish-panel"');
    expect(html).toContain('data-expanded-binding-id="binding-1"');
    expect(vi.mocked(getPluginRegistrySnapshot)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getSystemOverview)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).toHaveBeenCalledWith(
      "workflow-1",
      [{ id: "binding-1" }],
      {
        activeInvocationFilter: {
          bindingId: "binding-1",
          invocationId: undefined,
          status: undefined,
          requestSource: undefined,
          requestSurface: undefined,
          cacheStatus: undefined,
          runStatus: undefined,
          apiKeyId: undefined,
          reasonCode: undefined
        }
      }
    );
  });

  it("renders the api surface from published bindings instead of a placeholder", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      {
        id: "binding-1",
        workflow_id: "workflow-1",
        workflow_version_id: "workflow-version-1",
        workflow_version: "v1",
        target_workflow_version_id: "workflow-version-1",
        target_workflow_version: "v1",
        compiled_blueprint_id: "blueprint-1",
        endpoint_id: "chat-endpoint",
        endpoint_name: "Chat endpoint",
        endpoint_alias: "chat.public",
        route_path: "/chat/public",
        protocol: "openai",
        auth_mode: "api_key",
        streaming: true,
        lifecycle_status: "published",
        input_schema: {},
        output_schema: null,
        published_at: "2026-03-31T08:00:00Z",
        created_at: "2026-03-31T08:00:00Z",
        updated_at: "2026-03-31T08:00:00Z"
      }
    ] as Awaited<ReturnType<typeof getServerWorkflowPublishedEndpoints>>);

    const html = renderToStaticMarkup(
      await WorkflowApiPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-component="workflow-api-surface"');
    expect(html).toContain('data-component="workflow-api-binding-doc"');
    expect(html).toContain("访问 API");
    expect(html).toContain("Chat endpoint");
    expect(html).toContain("http://localhost:8000/v1/chat/completions");
    expect(html).toContain("Authorization: Bearer &lt;published-api-key&gt;");
    expect(html).toContain('data-component="workflow-api-sample-form"');
    expect(html).toContain("运行本地 sample invocation");
    expect(html).not.toContain('data-component="workflow-studio-placeholder"');
    expect(html).toContain("/workflows/workflow-1/api");
    expect(html).toContain("/workflows/workflow-1/logs");
    expect(html).toContain("/workflows/workflow-1/monitor");
    expect(vi.mocked(getServerWorkflowPublishedEndpoints)).toHaveBeenCalledWith("workflow-1", {
      includeAllVersions: true
    });
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
  });

  it("renders the fresh sample receipt from api query-state without leaking it into the clear link", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      {
        id: "binding-1",
        workflow_id: "workflow-1",
        workflow_version_id: "workflow-version-1",
        workflow_version: "v1",
        target_workflow_version_id: "workflow-version-1",
        target_workflow_version: "v1",
        compiled_blueprint_id: "blueprint-1",
        endpoint_id: "chat-endpoint",
        endpoint_name: "Chat endpoint",
        endpoint_alias: "chat.public",
        route_path: "/chat/public",
        protocol: "openai",
        auth_mode: "api_key",
        streaming: true,
        lifecycle_status: "published",
        input_schema: {},
        output_schema: null,
        published_at: "2026-03-31T08:00:00Z",
        created_at: "2026-03-31T08:00:00Z",
        updated_at: "2026-03-31T08:00:00Z"
      }
    ] as Awaited<ReturnType<typeof getServerWorkflowPublishedEndpoints>>);

    const html = renderToStaticMarkup(
      await WorkflowApiPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({
          api_sample_status: "success",
          api_sample_binding: "binding-1",
          api_sample_invocation: "invocation-1",
          api_sample_run: "run-1",
          api_sample_run_status: "succeeded",
          api_sample_message: "Fresh sample recorded.",
          api_sample_request_surface: "openai.chat.completions"
        })
      })
    );

    expect(html).toContain('data-component="workflow-api-sample-result"');
    expect(html).toContain("Fresh sample recorded.");
    expect(html).toContain("/workflows/workflow-1/logs?publish_binding=binding-1&amp;publish_invocation=invocation-1&amp;run=run-1");
    expect(html).toContain("/workflows/workflow-1/monitor?publish_binding=binding-1&amp;publish_invocation=invocation-1&amp;run=run-1");
    expect(html).toContain('href="/workflows/workflow-1/api"');
    expect(html).not.toContain("api_sample_status=success");
  });

  it("renders an honest empty state when the workflow has no published binding", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      {
        id: "binding-draft",
        workflow_id: "workflow-1",
        workflow_version_id: "workflow-version-2",
        workflow_version: "v2",
        target_workflow_version_id: "workflow-version-2",
        target_workflow_version: "v2",
        compiled_blueprint_id: "blueprint-2",
        endpoint_id: "draft-endpoint",
        endpoint_name: "Draft endpoint",
        endpoint_alias: "chat.draft",
        route_path: "/chat/draft",
        protocol: "openai",
        auth_mode: "api_key",
        streaming: false,
        lifecycle_status: "draft",
        input_schema: {},
        output_schema: null,
        created_at: "2026-03-31T09:00:00Z",
        updated_at: "2026-03-31T09:00:00Z"
      }
    ] as Awaited<ReturnType<typeof getServerWorkflowPublishedEndpoints>>);

    const html = renderToStaticMarkup(
      await WorkflowApiPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workflow-api-empty-state"');
    expect(html).toContain("draft / offline publish definition");
    expect(html).toContain("前往发布治理");
    expect(html).not.toContain('data-component="workflow-studio-placeholder"');
  });

  it("renders the logs surface from published invocation facts by default", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      buildPublishedBinding("binding-1")
    ]);
    vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
      cacheInventories: {},
      apiKeysByBinding: {},
      invocationAuditsByBinding: {
        "binding-1": buildPublishedInvocationAudit({
          items: [
            buildPublishedInvocationItem("invocation-2", {
              run_id: "run-2",
              created_at: "2026-03-31T09:10:00Z",
              error_message: "Tool timed out"
            }),
            buildPublishedInvocationItem("invocation-1", {
              run_id: "run-1",
              status: "succeeded",
              error_message: null,
              created_at: "2026-03-31T08:10:00Z"
            })
          ]
        })
      },
      invocationDetailsByBinding: {},
      rateLimitWindowAuditsByBinding: {}
    } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);
    vi.mocked(getPublishedEndpointInvocationDetail).mockResolvedValue(
      buildPublishedInvocationDetail("invocation-2", {
        invocation: buildPublishedInvocationItem("invocation-2", {
          run_id: "run-2",
          error_message: "Tool timed out"
        }),
        run: {
          id: "run-2",
          status: "failed",
          current_node_id: "node-2",
          error_message: "Tool timed out",
          created_at: "2026-03-31T09:10:00Z"
        }
      })
    );
    vi.mocked(getWorkflowRuns).mockResolvedValue([
      buildWorkflowRun("run-2", {
        status: "failed",
        error_message: "Tool timed out",
        last_event_at: "2026-03-31T09:10:20Z"
      }),
      buildWorkflowRun("run-1")
    ]);
    vi.mocked(getRunDetail).mockResolvedValue(
      buildRunDetailSnapshot("run-2", { status: "failed", error_message: "Tool timed out" })
    );
    vi.mocked(getRunExecutionView).mockResolvedValue(buildExecutionView("run-2"));
    vi.mocked(getRunEvidenceView).mockResolvedValue(buildEvidenceView("run-2"));

    const logsHtml = renderToStaticMarkup(
      await WorkflowLogsPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(logsHtml).toContain('data-component="workflow-logs-surface"');
    expect(logsHtml).toContain('data-selection-source="latest"');
    expect(logsHtml).toContain('data-component="workflow-logs-invocation-list"');
    expect(logsHtml).toContain('data-component="workflow-logs-invocation-detail"');
    expect(logsHtml).toContain('data-component="workflow-publish-invocation-entry-card"');
    expect(logsHtml).toContain(
      'data-detail-href="/workflows/workflow-1/logs?publish_binding=binding-1&amp;publish_invocation=invocation-2"'
    );
    expect(logsHtml).toContain('data-component="workflow-publish-invocation-detail-panel"');
    expect(logsHtml).toContain('data-component="workflow-logs-run-handoff"');
    expect(logsHtml).toContain('data-component="run-diagnostics-execution-sections"');
    expect(vi.mocked(getPublishedEndpointInvocationDetail)).toHaveBeenCalledWith(
      "workflow-1",
      "binding-1",
      "invocation-2"
    );
    expect(vi.mocked(getRunDetail)).toHaveBeenCalledWith("run-2");
  });

  it("selects the requested invocation on the canonical logs route", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      buildPublishedBinding("binding-1")
    ]);
    vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
      cacheInventories: {},
      apiKeysByBinding: {},
      invocationAuditsByBinding: {
        "binding-1": buildPublishedInvocationAudit({
          items: [
            buildPublishedInvocationItem("invocation-2", { run_id: "run-2" }),
            buildPublishedInvocationItem("invocation-1", {
              run_id: "run-1",
              status: "succeeded",
              error_message: null
            })
          ]
        })
      },
      invocationDetailsByBinding: {},
      rateLimitWindowAuditsByBinding: {}
    } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);
    vi.mocked(getPublishedEndpointInvocationDetail).mockResolvedValue(
      buildPublishedInvocationDetail("invocation-1", {
        invocation: buildPublishedInvocationItem("invocation-1", {
          run_id: "run-1",
          status: "succeeded",
          error_message: null
        }),
        run: {
          id: "run-1",
          status: "succeeded",
          current_node_id: "node-1",
          error_message: null,
          created_at: "2026-03-31T08:10:00Z"
        }
      })
    );
    vi.mocked(getWorkflowRuns).mockResolvedValue([
      buildWorkflowRun("run-2"),
      buildWorkflowRun("run-1", {
        status: "succeeded",
        error_message: null,
        last_event_at: "2026-03-31T08:10:20Z"
      })
    ]);
    vi.mocked(getRunDetail).mockResolvedValue(buildRunDetailSnapshot("run-1"));
    vi.mocked(getRunExecutionView).mockResolvedValue(buildExecutionView("run-1"));
    vi.mocked(getRunEvidenceView).mockResolvedValue(buildEvidenceView("run-1"));

    const logsHtml = renderToStaticMarkup(
      await WorkflowLogsPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({
          publish_binding: "binding-1",
          publish_invocation: "invocation-1"
        })
      })
    );

    expect(logsHtml).toContain('data-selection-source="query"');
    expect(logsHtml).toContain('data-invocation-id="invocation-1"');
    expect(logsHtml).toContain(
      'data-current-href="/workflows/workflow-1/logs?publish_binding=binding-1&amp;publish_invocation=invocation-1"'
    );
    expect(vi.mocked(getPublishedEndpointInvocationDetail)).toHaveBeenCalledWith(
      "workflow-1",
      "binding-1",
      "invocation-1"
    );
    expect(vi.mocked(getRunDetail)).toHaveBeenCalledWith("run-1");
  });

  it("falls back to the requested run when invocation facts are absent", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      buildPublishedBinding("binding-1")
    ]);
    vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
      cacheInventories: {},
      apiKeysByBinding: {},
      invocationAuditsByBinding: {
        "binding-1": buildPublishedInvocationAudit({
          summary: {
            total_count: 0,
            succeeded_count: 0,
            failed_count: 0,
            rejected_count: 0,
            cache_hit_count: 0,
            cache_miss_count: 0,
            cache_bypass_count: 0,
            last_invoked_at: null,
            last_status: null,
            last_cache_status: null,
            last_run_id: null,
            last_run_status: null,
            last_reason_code: null
          },
          items: []
        })
      },
      invocationDetailsByBinding: {},
      rateLimitWindowAuditsByBinding: {}
    } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);
    vi.mocked(getWorkflowRuns).mockResolvedValue([
      buildWorkflowRun("run-2"),
      buildWorkflowRun("run-1", {
        status: "running",
        finished_at: null,
        last_event_at: "2026-03-31T08:05:00Z"
      })
    ]);
    vi.mocked(getRunDetail).mockResolvedValue(
      buildRunDetailSnapshot("run-1", {
        status: "running",
        finished_at: null,
        last_event_at: "2026-03-31T08:05:00Z"
      })
    );
    vi.mocked(getRunExecutionView).mockResolvedValue(buildExecutionView("run-1"));
    vi.mocked(getRunEvidenceView).mockResolvedValue(buildEvidenceView("run-1"));

    const logsHtml = renderToStaticMarkup(
      await WorkflowLogsPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({ run: "run-1" })
      })
    );

    expect(logsHtml).toContain('data-component="workflow-logs-run-fallback"');
    expect(logsHtml).toContain('data-selection-source="query"');
    expect(logsHtml).toContain('data-run-id="run-1"');
    expect(logsHtml).toContain("当前 published binding 还没有 recent invocations");
    expect(logsHtml).toContain('/workflows/workflow-1/logs?run=run-1');
    expect(logsHtml).toContain('data-run-detail-href="/runs/run-1"');
    expect(vi.mocked(getPublishedEndpointInvocationDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunDetail)).toHaveBeenCalledWith("run-1");
  });

  it("renders an honest logs empty state when the workflow has no invocation or run facts", async () => {
    const logsHtml = renderToStaticMarkup(
      await WorkflowLogsPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(logsHtml).toContain('data-component="workflow-logs-empty-state"');
    expect(logsHtml).toContain("recent published invocations 或 recent runs");
    expect(logsHtml).not.toContain('data-component="workflow-studio-placeholder"');
    expect(vi.mocked(getPublishedEndpointInvocationDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunExecutionView)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunEvidenceView)).not.toHaveBeenCalled();
  });

  it("renders an honest monitor empty state when the workflow has no published binding", async () => {
    const monitorHtml = renderToStaticMarkup(
      await WorkflowMonitorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(monitorHtml).toContain('data-component="workflow-monitor-empty-state"');
    expect(monitorHtml).toContain("监测报表");
    expect(monitorHtml).not.toContain('data-component="workflow-studio-placeholder"');
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
  });

  it("renders the monitor surface from publish invocation and follow-up facts", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      buildPublishedBinding("binding-1")
    ]);
    vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
      cacheInventories: {},
      apiKeysByBinding: {},
      invocationAuditsByBinding: {
        "binding-1": buildPublishedInvocationAudit({
          facets: {
            status_counts: [],
            request_source_counts: [],
            request_surface_counts: [],
            cache_status_counts: [],
            run_status_counts: [],
            reason_counts: [],
            api_key_usage: [],
            recent_failure_reasons: [],
            timeline_granularity: "hour",
            timeline: [
              {
                bucket_start: "2026-03-31T08:00:00Z",
                bucket_end: "2026-03-31T09:00:00Z",
                total_count: 4,
                succeeded_count: 3,
                failed_count: 1,
                rejected_count: 0,
                api_key_counts: [],
                cache_status_counts: [{ value: "hit", count: 1 }],
                run_status_counts: [{ value: "waiting_callback", count: 1 }],
                request_surface_counts: [{ value: "native.workflow", count: 4 }],
                reason_counts: [{ value: "runtime_failed", count: 1 }],
              }
            ],
          },
          items: [
            {
              id: "invocation-1",
              workflow_id: "workflow-1",
              binding_id: "binding-1",
              endpoint_id: "binding-1-endpoint",
              endpoint_alias: "binding-1.alias",
              route_path: "/published/binding-1",
              protocol: "native",
              auth_mode: "api_key",
              request_source: "workflow",
              request_surface: "native.workflow",
              status: "failed",
              cache_status: "miss",
              run_id: "run-monitor-1",
              run_status: "waiting_callback",
              run_current_node_id: "node-1",
              run_waiting_reason: "callback",
              run_waiting_lifecycle: null,
              run_snapshot: null,
              run_follow_up: {
                affected_run_count: 1,
                sampled_run_count: 1,
                waiting_run_count: 1,
                running_run_count: 0,
                succeeded_run_count: 0,
                failed_run_count: 1,
                unknown_run_count: 0,
                recommended_action: null,
                explanation: null,
                sampled_runs: [
                  {
                    run_id: "run-monitor-1",
                    snapshot: {
                      workflow_id: "workflow-1",
                      status: "waiting_callback",
                      current_node_id: "node-1",
                      waiting_reason: "callback",
                      execution_focus_node_id: "node-1",
                      execution_focus_node_name: "LLM Agent",
                      execution_focus_node_run_id: "node-run-1",
                      callback_waiting_explanation: {
                        primary_signal: "Callback still pending",
                        follow_up: "wait for external callback"
                      },
                      callback_waiting_lifecycle: {
                        node_run_id: "node-run-1",
                        node_status: "waiting_callback",
                        waiting_reason: "callback",
                        callback_ticket_count: 1,
                        callback_ticket_status_counts: { pending: 1 }
                      }
                    },
                    callback_tickets: [],
                    sensitive_access_entries: [],
                    tool_governance: null,
                    legacy_auth_governance: null,
                  }
                ]
              },
              execution_focus_explanation: null,
              callback_waiting_explanation: null,
              reason_code: "runtime_failed",
              error_message: "tool failed",
              request_preview: { key_count: 1, keys: ["message"], sample: { message: "hi" } },
              response_preview: null,
              duration_ms: 1200,
              created_at: "2026-03-31T08:10:00Z",
              finished_at: "2026-03-31T08:10:01Z",
            }
          ]
        })
      },
      invocationDetailsByBinding: {},
      rateLimitWindowAuditsByBinding: {}
    } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);

    const monitorHtml = renderToStaticMarkup(
      await WorkflowMonitorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(monitorHtml).toContain('data-component="workflow-monitor-surface"');
    expect(monitorHtml).toContain('data-component="workflow-monitor-summary-strip"');
    expect(monitorHtml).toContain('data-component="workflow-monitor-primary-follow-up"');
    expect(monitorHtml).toContain('data-component="workflow-monitor-trend-deck"');
    expect(monitorHtml).toContain('data-component="workflow-monitor-insight-grid"');
    expect(monitorHtml).toContain('data-component="workflow-monitor-window-summary"');
    expect(monitorHtml).toContain('data-component="workflow-monitor-sampled-runs"');
    expect(monitorHtml).toContain("Traffic timeline");
    expect(monitorHtml).toContain("Callback still pending");
    expect(monitorHtml).not.toContain('data-component="workflow-studio-placeholder"');
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).toHaveBeenCalledWith(
      "workflow-1",
      expect.arrayContaining([expect.objectContaining({ id: "binding-1" })]),
      undefined
    );
  });

  it("scopes monitor handoff to the requested invocation window when fresh sample query is present", async () => {
    vi.mocked(getServerWorkflowPublishedEndpoints).mockResolvedValue([
      buildPublishedBinding("binding-1"),
      buildPublishedBinding("binding-2", {
        endpoint_alias: "binding-2.alias",
        route_path: "/published/binding-2",
      })
    ]);
    vi.mocked(getPublishedEndpointInvocationDetail).mockResolvedValue(
      buildPublishedInvocationDetail("invocation-1", {
        invocation: buildPublishedInvocationItem("invocation-1", {
          binding_id: "binding-1",
          run_id: "run-monitor-1",
          created_at: "2026-03-31T09:58:00Z",
          run_follow_up: {
            affected_run_count: 1,
            sampled_run_count: 1,
            waiting_run_count: 1,
            running_run_count: 0,
            succeeded_run_count: 0,
            failed_run_count: 1,
            unknown_run_count: 0,
            recommended_action: null,
            explanation: null,
            sampled_runs: [
              {
                run_id: "run-monitor-1",
                snapshot: {
                  workflow_id: "workflow-1",
                  status: "waiting_callback",
                  current_node_id: "node-1",
                  waiting_reason: "callback",
                  execution_focus_node_id: "node-1",
                  execution_focus_node_name: "LLM Agent",
                  execution_focus_node_run_id: "node-run-1",
                  callback_waiting_explanation: {
                    primary_signal: "Callback still pending",
                    follow_up: "wait for external callback"
                  },
                  callback_waiting_lifecycle: null
                },
                callback_tickets: [],
                sensitive_access_entries: [],
                tool_governance: null,
                legacy_auth_governance: null,
              }
            ]
          }
        })
      })
    );
    vi.mocked(getWorkflowPublishGovernanceSnapshot).mockResolvedValue({
      cacheInventories: {},
      apiKeysByBinding: {},
      invocationAuditsByBinding: {
        "binding-1": buildPublishedInvocationAudit({
          facets: {
            status_counts: [],
            request_source_counts: [],
            request_surface_counts: [{ value: "native.workflow", count: 1 }],
            cache_status_counts: [{ value: "miss", count: 1 }],
            run_status_counts: [{ value: "waiting_callback", count: 1 }],
            reason_counts: [{ value: "runtime_failed", count: 1 }],
            api_key_usage: [],
            recent_failure_reasons: [],
            timeline_granularity: "hour",
            timeline: [
              {
                bucket_start: "2026-03-31T09:00:00Z",
                bucket_end: "2026-03-31T10:00:00Z",
                total_count: 1,
                succeeded_count: 0,
                failed_count: 1,
                rejected_count: 0,
                api_key_counts: [],
                cache_status_counts: [{ value: "miss", count: 1 }],
                run_status_counts: [{ value: "waiting_callback", count: 1 }],
                request_surface_counts: [{ value: "native.workflow", count: 1 }],
                reason_counts: [{ value: "runtime_failed", count: 1 }],
              }
            ],
          },
          items: [
            buildPublishedInvocationItem("invocation-1", {
              binding_id: "binding-1",
              run_id: "run-monitor-1",
              created_at: "2026-03-31T09:58:00Z",
              run_status: "waiting_callback",
              run_waiting_reason: "callback",
              run_follow_up: {
                affected_run_count: 1,
                sampled_run_count: 1,
                waiting_run_count: 1,
                running_run_count: 0,
                succeeded_run_count: 0,
                failed_run_count: 1,
                unknown_run_count: 0,
                recommended_action: null,
                explanation: null,
                sampled_runs: [
                  {
                    run_id: "run-monitor-1",
                    snapshot: {
                      workflow_id: "workflow-1",
                      status: "waiting_callback",
                      current_node_id: "node-1",
                      waiting_reason: "callback",
                      execution_focus_node_id: "node-1",
                      execution_focus_node_name: "LLM Agent",
                      execution_focus_node_run_id: "node-run-1",
                      callback_waiting_explanation: {
                        primary_signal: "Callback still pending",
                        follow_up: "wait for external callback"
                      },
                      callback_waiting_lifecycle: null
                    },
                    callback_tickets: [],
                    sensitive_access_entries: [],
                    tool_governance: null,
                    legacy_auth_governance: null,
                  }
                ]
              }
            })
          ]
        })
      },
      invocationDetailsByBinding: {},
      rateLimitWindowAuditsByBinding: {}
    } as Awaited<ReturnType<typeof getWorkflowPublishGovernanceSnapshot>>);

    const monitorHtml = renderToStaticMarkup(
      await WorkflowMonitorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({
          publish_binding: "binding-1",
          publish_invocation: "invocation-1",
          run: "run-monitor-1"
        })
      })
    );

    expect(monitorHtml).toContain('data-component="workflow-monitor-focus-card"');
    expect(monitorHtml).toContain('data-selection-source="query"');
    expect(monitorHtml).toContain("binding · binding-1");
    expect(monitorHtml).toContain("invocation · invocation-1");
    expect(monitorHtml).toContain("run · run-monitor-1");
    expect(monitorHtml).toContain(
      'href="/workflows/workflow-1/logs?publish_binding=binding-1&amp;publish_invocation=invocation-1&amp;run=run-monitor-1"'
    );
    expect(vi.mocked(getPublishedEndpointInvocationDetail)).toHaveBeenCalledWith(
      "workflow-1",
      "binding-1",
      "invocation-1"
    );
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).toHaveBeenCalledWith(
      "workflow-1",
      [expect.objectContaining({ id: "binding-1" })],
      {
        activeInvocationFilter: expect.objectContaining({
          bindingId: "binding-1",
          invocationId: "invocation-1",
          createdFrom: "2026-03-31T09:00:00.000Z",
          createdTo: "2026-03-31T10:00:00.000Z",
          limit: 24,
        })
      }
    );
  });

  it("redirects unauthenticated editor access back to login with the canonical route", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/login?next=%2Fworkflows%2Fworkflow-1%2Feditor");

    expect(vi.mocked(getServerWorkflowDetail)).not.toHaveBeenCalled();
  });

  it("redirects unauthorized publish access before loading workflow detail or bindings", async () => {
    const workspaceContext = buildWorkspaceContext();
    vi.mocked(getServerWorkspaceContext).mockResolvedValue({
      ...workspaceContext,
      current_member: {
        ...workspaceContext.current_member,
        role: "viewer"
      },
      route_permissions: [
        {
          route: "/api/workspace/members",
          methods: ["GET"],
          csrf_protected_methods: [],
          access_level: "manager",
          description: "team settings"
        }
      ]
    });

    await expect(
      WorkflowPublishPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/workspace");

    expect(vi.mocked(getServerWorkflowDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getServerWorkflowPublishedEndpoints)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
  });

  it("redirects unauthorized logs access before loading workflow detail or run facts", async () => {
    const workspaceContext = buildWorkspaceContext();
    vi.mocked(getServerWorkspaceContext).mockResolvedValue({
      ...workspaceContext,
      current_member: {
        ...workspaceContext.current_member,
        role: "viewer"
      },
      route_permissions: [
        {
          route: "/api/workspace/members",
          methods: ["GET"],
          csrf_protected_methods: [],
          access_level: "manager",
          description: "team settings"
        }
      ]
    });

    await expect(
      WorkflowLogsPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/workspace");

    expect(vi.mocked(getServerWorkflowDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowRuns)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunDetail)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunExecutionView)).not.toHaveBeenCalled();
    expect(vi.mocked(getRunEvidenceView)).not.toHaveBeenCalled();
  });
});
