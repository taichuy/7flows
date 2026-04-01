import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceToolsPage from "@/app/workspace/tools/page";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import {
  getServerWorkspaceContext,
  getServerWorkspaceModelProviderSettingsState
} from "@/lib/server-workspace-access";
import type { WorkspaceContextResponse } from "@/lib/workspace-access";

Object.assign(globalThis, { React });

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    throw new Error(`redirect:${href}`);
  }
}));

vi.mock("@/components/workspace-shell", () => ({
  WorkspaceShell: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-component": "workspace-shell" }, children)
}));

vi.mock("@/components/workspace-tools-hub", () => ({
  WorkspaceToolsHub: ({
    handoff,
    nodeCatalog,
    providerCatalog,
    providerConfigs,
    nativeTools,
    pluginTools,
    pluginAdapters,
    providerRegistryState,
    providerManageHref
  }: {
    handoff: { returnHref: string | null };
    nodeCatalog: Array<unknown>;
    providerCatalog: Array<unknown>;
    providerConfigs: Array<unknown>;
    nativeTools: Array<unknown>;
    pluginTools: Array<unknown>;
    pluginAdapters: Array<unknown>;
    providerRegistryState: { kind: string };
    providerManageHref: string | null;
  }) =>
    createElement(
      "div",
      {
        "data-component": "workspace-tools-hub",
        "data-return-href": handoff.returnHref ?? "none",
        "data-node-count": nodeCatalog.length,
        "data-provider-count": providerCatalog.length,
        "data-provider-config-count": providerConfigs.length,
        "data-native-tool-count": nativeTools.length,
        "data-plugin-tool-count": pluginTools.length,
        "data-adapter-count": pluginAdapters.length,
        "data-provider-state": providerRegistryState.kind,
        "data-provider-manage-href": providerManageHref ?? "none"
      },
      "tools-hub"
    )
}));

vi.mock("@/lib/server-workspace-access", () => ({
  getServerWorkspaceContext: vi.fn(),
  getServerWorkspaceModelProviderSettingsState: vi.fn()
}));

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-plugin-registry", () => ({
  getPluginRegistrySnapshot: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getServerWorkspaceContext).mockResolvedValue(buildWorkspaceContext());
  vi.mocked(getServerWorkspaceModelProviderSettingsState).mockResolvedValue({
    settings: {
      registry: {
        catalog: [{ id: "openai", label: "OpenAI" }],
        items: [{ id: "provider-openai-1" }]
      },
      credentials: []
    } as never,
    errorMessage: null,
    status: 200
  });
  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
    nodes: [{ id: "node-1" }],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [],
    toolSourceLanes: [],
    tools: [
      {
        id: "native.search",
        ecosystem: "native"
      }
    ]
  } as never);
  vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
    adapters: [{ id: "dify-default" }],
    tools: [{ id: "compat:dify:tool:search" }]
  } as never);
});

describe("WorkspaceToolsPage", () => {
  it("renders the tools hub inside the workspace shell", async () => {
    const html = renderToStaticMarkup(
      await WorkspaceToolsPage({
        searchParams: Promise.resolve({
          return_href: "/workflows/workflow-1/editor",
          workflow_id: "workflow-1",
          workflow_surface: "editor"
        })
      })
    );

    expect(html).toContain('data-component="workspace-shell"');
    expect(html).toContain('data-component="workspace-tools-hub"');
    expect(html).toContain('data-return-href="/workflows/workflow-1/editor"');
    expect(html).toContain('data-node-count="1"');
    expect(html).toContain('data-provider-count="1"');
    expect(html).toContain('data-provider-config-count="1"');
    expect(html).toContain('data-native-tool-count="1"');
    expect(html).toContain('data-plugin-tool-count="1"');
    expect(html).toContain('data-adapter-count="1"');
    expect(html).toContain('data-provider-state="ready"');
    expect(html).toContain('data-provider-manage-href="/workspace/settings/providers"');
    expect(html).toContain("当前 handoff 指向 workflow");
  });

  it("redirects unauthenticated users back to login with canonical next", async () => {
    vi.mocked(getServerWorkspaceContext).mockResolvedValue(null);

    await expect(
      WorkspaceToolsPage({
        searchParams: Promise.resolve({
          return_href: "/workflows/workflow-1/editor",
          workflow_id: "workflow-1",
          workflow_surface: "editor"
        })
      })
    ).rejects.toThrowError(
      "redirect:/login?next=%2Fworkspace%2Ftools%3Freturn_href%3D%252Fworkflows%252Fworkflow-1%252Feditor%26workflow_id%3Dworkflow-1%26workflow_surface%3Deditor"
    );
  });
});

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
    can_manage_members: true,
    route_permissions: []
  };
}
