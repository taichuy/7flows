import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceToolsHub } from "@/components/workspace-tools-hub";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getServerWorkspaceModelProviderSettingsState } from "@/lib/server-workspace-access";
import {
  buildWorkspaceToolsHref,
  getWorkflowStudioSurfaceDefinition,
  readWorkspaceToolsHubContext,
  resolveWorkspaceToolsReturnHref
} from "@/lib/workbench-links";
import { canAccessConsolePage, getWorkspaceConsolePageHref } from "@/lib/workspace-console";

export const metadata: Metadata = {
  title: "Tools | 7Flows Studio"
};

type WorkspaceToolsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceToolsPage({ searchParams }: WorkspaceToolsPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedContext = readWorkspaceToolsHubContext(resolvedSearchParams);
  const requestedHref = buildWorkspaceToolsHref(requestedContext);
  const workspaceContext = await getServerWorkspaceContext();

  if (!workspaceContext) {
    redirect(`/login?next=${encodeURIComponent(requestedHref)}`);
  }

  const canManageProviders = canAccessConsolePage("providers", workspaceContext);
  const [workflowLibrary, pluginRegistry, providerSettingsState] = await Promise.all([
    getWorkflowLibrarySnapshot(),
    getPluginRegistrySnapshot(),
    canManageProviders
      ? getServerWorkspaceModelProviderSettingsState()
      : Promise.resolve({
          settings: null,
          errorMessage: null,
          status: null
        })
  ]);

  const returnHref = resolveWorkspaceToolsReturnHref(requestedContext);
  const workflowSurfaceDefinition = requestedContext.workflowSurface
    ? getWorkflowStudioSurfaceDefinition(requestedContext.workflowSurface)
    : null;
  const nativeTools = workflowLibrary.tools.filter(
    (tool) => !tool.ecosystem.trim().toLowerCase().startsWith("compat:")
  );
  const providerRegistryState = canManageProviders
    ? {
        kind: providerSettingsState.errorMessage ? ("error" as const) : ("ready" as const),
        message: providerSettingsState.errorMessage
      }
    : {
        kind: "restricted" as const,
        message:
          "当前账号没有团队模型供应商配置权限；这里只展示原生 provider plugin 目录，不泄露团队 credential 绑定细节。"
      };

  return (
    <WorkspaceShell
      activeNav="tools"
      layout="focused"
      navigationMode="all"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <main className="workspace-main">
        <WorkspaceToolsHub
          handoff={{
            returnHref,
            workflowId: requestedContext.workflowId,
            workflowSurfaceLabel: workflowSurfaceDefinition?.label ?? null
          }}
          initialToolSource="native"
          nativeTools={nativeTools}
          nodeCatalog={workflowLibrary.nodes}
          pluginAdapters={pluginRegistry.adapters}
          pluginGovernanceHref="/workspace-starters"
          pluginTools={pluginRegistry.tools}
          providerCatalog={providerSettingsState.settings?.registry.catalog ?? []}
          providerConfigs={providerSettingsState.settings?.registry.items ?? []}
          providerManageHref={canManageProviders ? getWorkspaceConsolePageHref("providers") : null}
          providerRegistryState={providerRegistryState}
        />
        {requestedContext.workflowId ? (
          <p className="workspace-muted" data-component="workspace-tools-handoff-summary">
            当前 handoff 指向 workflow <strong>{requestedContext.workflowId}</strong>
            {workflowSurfaceDefinition ? <> · {workflowSurfaceDefinition.label}</> : null}。
          </p>
        ) : (
          <div className="workspace-action-row">
            <Link className="workspace-ghost-button compact" href="/workspace">
              返回工作台
            </Link>
          </div>
        )}
      </main>
    </WorkspaceShell>
  );
}
