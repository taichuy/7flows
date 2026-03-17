import Link from "next/link";

import { updateWorkflowToolBinding } from "@/app/actions/workflow";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import { WorkflowToolBindingForm } from "@/components/workflow-tool-binding-form";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowDetail, WorkflowListItem } from "@/lib/get-workflows";
import { getToolGovernanceSummary } from "@/lib/tool-governance";

type WorkflowToolBindingPanelProps = {
  workflows: WorkflowListItem[];
  selectedWorkflow: WorkflowDetail | null;
  tools: PluginToolRegistryItem[];
};

type ToolNodeBinding = {
  id: string;
  name: string;
  currentToolId: string;
  currentEcosystem: string;
  currentBindingMode: string;
  currentTool: PluginToolRegistryItem | null;
  missingCatalogEntry: boolean;
};

export function WorkflowToolBindingPanel({
  workflows,
  selectedWorkflow,
  tools
}: WorkflowToolBindingPanelProps) {
  const toolNodes = getToolNodeBindings(selectedWorkflow, tools);
  const boundToolNodes = toolNodes.filter((node) => node.currentToolId);
  const governedToolNodes = boundToolNodes.filter((node) => node.currentTool).length;
  const strongIsolationToolNodes = boundToolNodes.filter((node) => {
    if (!node.currentTool) {
      return false;
    }
    return getToolGovernanceSummary(node.currentTool).requiresStrongIsolationByDefault;
  }).length;
  const missingCatalogBindings = toolNodes.filter((node) => node.missingCatalogEntry).length;

  return (
    <article className="diagnostic-panel panel-span" id="workflow-binding">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>Tool node binding</h2>
        </div>
        <p className="section-copy">
          直接把已持久化的 compat 工具目录绑定回 workflow 里的 `tool` 节点，保存后会写回
          工作流定义并自动生成新版本。
        </p>
      </div>

      {workflows.length === 0 ? (
        <p className="empty-state">当前还没有 workflow，可先通过后端 API 创建一个草稿。</p>
      ) : (
        <>
          <div className="workflow-chip-row">
            {workflows.map((workflow) => {
              const selected = workflow.id === selectedWorkflow?.id;

              return (
                <Link
                  className={`workflow-chip ${selected ? "selected" : ""}`}
                  href={`/?workflow=${encodeURIComponent(workflow.id)}#workflow-binding`}
                  key={workflow.id}
                >
                  <span>{workflow.name}</span>
                  <small>
                    {workflow.version} · {workflow.status}
                  </small>
                </Link>
              );
            })}
          </div>

          {selectedWorkflow ? (
            <div className="binding-workbench">
              <div className="binding-overview">
                <div className="entry-card compact-card">
                  <p className="entry-card-title">{selectedWorkflow.name}</p>
                  <p className="section-copy entry-copy">
                    workflow {selectedWorkflow.id} · 当前版本 {selectedWorkflow.version}
                  </p>
                  <div className="summary-strip compact-strip">
                    <article className="summary-card">
                      <span>Tool nodes</span>
                      <strong>{toolNodes.length}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Catalog tools</span>
                      <strong>{tools.length}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Versions</span>
                      <strong>{selectedWorkflow.versions.length}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Governed bindings</span>
                      <strong>{governedToolNodes}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Strong isolation</span>
                      <strong>{strongIsolationToolNodes}</strong>
                    </article>
                    <article className="summary-card">
                      <span>Catalog gaps</span>
                      <strong>{missingCatalogBindings}</strong>
                    </article>
                  </div>
                  <p className="binding-meta">
                    这里现在直接暴露当前 workflow 已绑定工具的治理状态，避免作者只有进入编辑器后才发现某些节点默认需要
                    `sandbox / microvm` 或已经脱离当前 catalog。
                  </p>
                </div>
              </div>

              <div className="binding-list">
                {toolNodes.length === 0 ? (
                  <p className="empty-state">
                    这个 workflow 里暂时没有 `tool` 节点，因此没有可绑定的目录项。
                  </p>
                ) : (
                  toolNodes.map((node) => (
                    <article className="binding-card" key={node.id}>
                      <div className="binding-card-header">
                        <div>
                          <p className="status-meta">Tool node</p>
                          <h3>{node.name}</h3>
                        </div>
                        <span className={`health-pill ${node.currentToolId ? "up" : "disabled"}`}>
                          {node.currentToolId ? "bound" : "empty"}
                        </span>
                      </div>
                      <p className="binding-meta">
                        当前绑定：
                        {node.currentToolId ? (
                          <>
                            {" "}
                            <strong>{node.currentToolId}</strong> · {node.currentEcosystem} ·{" "}
                            {node.currentBindingMode}
                          </>
                        ) : (
                          " 未设置"
                        )}
                      </p>
                      {node.currentTool ? (
                        <ToolGovernanceSummary
                          tool={node.currentTool}
                          title="Current tool governance"
                          subtitle="当前绑定会沿既有 workflow 版本链继续生效。保存改绑前先确认默认执行边界。"
                          trailingChip={node.currentToolId}
                        />
                      ) : null}
                      {node.missingCatalogEntry ? (
                        <p className="sync-message error">
                          当前绑定的工具已不在 catalog 里。请先同步目录，或改绑到仍可用的工具定义。
                        </p>
                      ) : null}
                      <WorkflowToolBindingForm
                        workflowId={selectedWorkflow.id}
                        nodeId={node.id}
                        nodeName={node.name}
                        currentToolId={node.currentToolId}
                        tools={tools}
                        action={updateWorkflowToolBinding}
                      />
                    </article>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="empty-state">无法加载所选 workflow 详情，请刷新后重试。</p>
          )}
        </>
      )}
    </article>
  );
}

function getToolNodeBindings(
  selectedWorkflow: WorkflowDetail | null,
  tools: PluginToolRegistryItem[]
): ToolNodeBinding[] {
  if (!selectedWorkflow?.definition?.nodes) {
    return [];
  }

  return selectedWorkflow.definition.nodes
    .filter((node) => node.type === "tool")
    .map((node) => {
      const toolConfig =
        typeof node.config?.tool === "object" && node.config.tool !== null
          ? (node.config.tool as Record<string, unknown>)
          : null;
      const flatToolId =
        typeof node.config?.toolId === "string" ? String(node.config.toolId) : "";
      const boundToolId =
        typeof toolConfig?.toolId === "string" ? String(toolConfig.toolId) : flatToolId;
      const ecosystem =
        typeof toolConfig?.ecosystem === "string" ? String(toolConfig.ecosystem) : "native";
      const currentTool = boundToolId
        ? tools.find((tool) => tool.id === boundToolId) ?? null
        : null;

      return {
        id: node.id,
        name: node.name,
        currentToolId: boundToolId,
        currentEcosystem: boundToolId ? ecosystem : "-",
        currentBindingMode: toolConfig ? "config.tool" : flatToolId ? "config.toolId" : "-",
        currentTool,
        missingCatalogEntry: Boolean(boundToolId) && !currentTool
      };
    });
}
