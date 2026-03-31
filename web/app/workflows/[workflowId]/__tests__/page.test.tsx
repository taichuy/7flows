import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkflowDetailCompatPage from "@/app/workflows/[workflowId]/page";
import WorkflowEditorPage from "@/app/workflows/[workflowId]/editor/page";
import WorkflowPublishPage from "@/app/workflows/[workflowId]/publish/page";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getWorkflowPublishedEndpoints } from "@/lib/get-workflow-publish";
import { getWorkflowPublishGovernanceSnapshot } from "@/lib/get-workflow-publish-governance";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
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

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
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

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflowDetail: vi.fn(),
  getWorkflows: vi.fn()
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

vi.mock("@/lib/get-workflow-publish", () => ({
  getWorkflowPublishedEndpoints: vi.fn()
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
  vi.mocked(getWorkflowDetail).mockResolvedValue({
    id: "workflow-1",
    name: "Workflow 1"
  } as Awaited<ReturnType<typeof getWorkflowDetail>>);
  vi.mocked(getWorkflows).mockResolvedValue([] as Awaited<ReturnType<typeof getWorkflows>>);
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
  vi.mocked(getWorkflowPublishedEndpoints).mockResolvedValue(
    [] as Awaited<ReturnType<typeof getWorkflowPublishedEndpoints>>
  );
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

  it("renders only the editor surface on the canonical editor route", async () => {
    const html = renderToStaticMarkup(
      await WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
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
    expect(html).toContain("/workflows/workflow-1/editor");
    expect(html).toContain("/workflows/workflow-1/publish");
    expect(html).not.toContain("?surface=");
    expect(vi.mocked(getWorkflows)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowLibrarySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getPluginRegistrySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getSystemOverview)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowPublishedEndpoints)).not.toHaveBeenCalled();
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
    expect(html).toContain("publish governance");
    expect(html).toContain("Workflow 1");
    expect(html).toContain("draft only");
    expect(html).toContain("/workflows/workflow-1/editor");
    expect(html).toContain("/workflows/workflow-1/publish");
    expect(vi.mocked(getWorkflowPublishedEndpoints)).toHaveBeenCalledWith("workflow-1", {
      includeAllVersions: true
    });
    expect(vi.mocked(getPluginRegistrySnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getSystemOverview)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowPublishGovernanceSnapshot)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflows)).not.toHaveBeenCalled();
    expect(vi.mocked(getWorkflowLibrarySnapshot)).not.toHaveBeenCalled();
  });

  it("loads publish governance detail only when a binding is explicitly selected", async () => {
    vi.mocked(getWorkflowPublishedEndpoints).mockResolvedValue([
      { id: "binding-1" }
    ] as Awaited<ReturnType<typeof getWorkflowPublishedEndpoints>>);

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

  it("redirects unauthenticated editor access back to login with the canonical route", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      WorkflowEditorPage({
        params: Promise.resolve({ workflowId: "workflow-1" }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrowError("redirect:/login?next=%2Fworkflows%2Fworkflow-1%2Feditor");
  });
});
