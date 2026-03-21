import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import { WorkspaceStarterSourceCard } from "@/components/workspace-starter-library/source-status-card";
import type {
  WorkspaceStarterSourceGovernance,
  WorkspaceStarterSourceDiff,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency,
  type WorkflowDefinitionSandboxGovernance,
  type WorkflowDefinitionSandboxGovernanceNode
} from "@/lib/workflow-definition-sandbox-governance";
import type { WorkflowDefinitionToolGovernance } from "@/lib/workflow-definition-tool-governance";

import { formatTimestamp } from "./shared";

type WorkspaceStarterDefinitionSnapshotPanelProps = {
  selectedTemplate: WorkspaceStarterTemplateItem | null;
  selectedTemplateSandboxGovernance: WorkflowDefinitionSandboxGovernance;
  selectedTemplateToolGovernance: WorkflowDefinitionToolGovernance;
  sourceGovernance: WorkspaceStarterSourceGovernance | null;
  sourceDiff: WorkspaceStarterSourceDiff | null;
  isLoadingSourceDiff: boolean;
  isRefreshing: boolean;
  isRebasing: boolean;
  onRefresh: () => void;
  onRebase: () => void;
};

export function WorkspaceStarterDefinitionSnapshotPanel({
  selectedTemplate,
  selectedTemplateSandboxGovernance,
  selectedTemplateToolGovernance,
  sourceGovernance,
  sourceDiff,
  isLoadingSourceDiff,
  isRefreshing,
  isRebasing,
  onRefresh,
  onRebase
}: WorkspaceStarterDefinitionSnapshotPanelProps) {
  const sandboxGovernanceBadges = buildWorkflowDefinitionSandboxGovernanceBadges(
    selectedTemplateSandboxGovernance
  );
  const sandboxDependencySummary = describeWorkflowDefinitionSandboxDependency(
    selectedTemplateSandboxGovernance
  );

  return (
    <article className="diagnostic-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>Definition snapshot</h2>
        </div>
      </div>

      {!selectedTemplate ? (
        <p className="empty-state">当前没有可预览的模板定义。</p>
      ) : (
        <>
          <div className="meta-grid">
            <div className="summary-card">
              <span>Updated</span>
              <strong>{formatTimestamp(selectedTemplate.updated_at)}</strong>
            </div>
            <div className="summary-card">
              <span>Workflow version</span>
              <strong>{selectedTemplate.created_from_workflow_version ?? "n/a"}</strong>
            </div>
            <div className="summary-card">
              <span>Source status</span>
              <strong>{sourceGovernance?.status_label ?? "-"}</strong>
            </div>
            <div className="summary-card">
              <span>Governed tools</span>
              <strong>{selectedTemplateToolGovernance.governedToolCount}</strong>
            </div>
            <div className="summary-card">
              <span>Strong isolation</span>
              <strong>{selectedTemplateToolGovernance.strongIsolationToolCount}</strong>
            </div>
            <div className="summary-card">
              <span>Missing catalog tools</span>
              <strong>{selectedTemplateToolGovernance.missingToolIds.length}</strong>
            </div>
            <div className="summary-card">
              <span>Sandbox nodes</span>
              <strong>{selectedTemplateSandboxGovernance.sandboxNodeCount}</strong>
            </div>
            <div className="summary-card">
              <span>Dependency modes</span>
              <strong>{selectedTemplateSandboxGovernance.dependencyModes.join(" / ") || "-"}</strong>
            </div>
          </div>

          <div className="starter-tag-row">
            {selectedTemplate.tags.map((tag) => (
              <span className="event-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>

          <WorkspaceStarterSourceCard
            template={selectedTemplate}
            sourceGovernance={sourceGovernance}
            sourceDiff={sourceDiff}
            isLoadingSourceDiff={isLoadingSourceDiff}
            isRefreshing={isRefreshing}
            isRebasing={isRebasing}
            onRefresh={onRefresh}
            onRebase={onRebase}
          />

          <div className="section-heading">
            <div>
              <p className="eyebrow">Governance</p>
              <h3>Referenced tools</h3>
            </div>
            <p className="section-copy">
              这里直接暴露 starter definition 实际引用到的工具治理事实，避免模板治理只停留在节点数量和来源状态。
            </p>
          </div>

          {selectedTemplateToolGovernance.referencedTools.length === 0 ? (
            <p className="empty-state">
              当前模板还没有引用 tool 节点或 `llm_agent.allowedToolIds`，因此这里没有额外的工具治理摘要。
            </p>
          ) : (
            <div className="governance-node-list">
              {selectedTemplateToolGovernance.referencedTools.map((tool) => (
                <ToolGovernanceSummary
                  key={`${selectedTemplate.id}-${tool.id}`}
                  tool={tool}
                  title={tool.name}
                  subtitle={tool.id}
                  trailingChip={tool.ecosystem}
                />
              ))}
            </div>
          )}

          {selectedTemplateToolGovernance.missingToolIds.length > 0 ? (
            <div className="payload-card compact-card">
              <div className="payload-card-header">
                <div>
                  <span className="status-meta">Catalog gap</span>
                  <p className="binding-meta">
                    这些工具仍被模板引用，但当前 workspace plugin catalog 里还看不到对应定义。
                  </p>
                </div>
                <span className="event-chip">
                  {selectedTemplateToolGovernance.missingToolIds.length} missing
                </span>
              </div>
              <div className="tool-badge-row">
                {selectedTemplateToolGovernance.missingToolIds.map((toolId) => (
                  <span className="event-chip" key={`${selectedTemplate.id}-missing-${toolId}`}>
                    {toolId}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="section-heading">
            <div>
              <p className="eyebrow">Sandbox</p>
              <h3>Sandbox dependency</h3>
            </div>
            <p className="section-copy">
              这里直接暴露 starter definition 里的 `sandbox_code` runtime policy，避免作者保存过的依赖约束在治理页丢失。
            </p>
          </div>

          {selectedTemplateSandboxGovernance.sandboxNodeCount === 0 ? (
            <p className="empty-state">
              当前模板没有 `sandbox_code` 节点，因此这里没有额外的 sandbox 依赖治理摘要。
            </p>
          ) : (
            <>
              <div className="summary-strip compact-strip">
                <div className="summary-card">
                  <span>Sandbox nodes</span>
                  <strong>{selectedTemplateSandboxGovernance.sandboxNodeCount}</strong>
                </div>
                <div className="summary-card">
                  <span>Explicit execution</span>
                  <strong>{selectedTemplateSandboxGovernance.explicitExecutionCount}</strong>
                </div>
                <div className="summary-card">
                  <span>Execution</span>
                  <strong>
                    {selectedTemplateSandboxGovernance.executionClasses.join(" / ") || "-"}
                  </strong>
                </div>
                <div className="summary-card">
                  <span>Backend extensions</span>
                  <strong>{selectedTemplateSandboxGovernance.backendExtensionNodeCount}</strong>
                </div>
              </div>

              <div className="starter-tag-row">
                {sandboxGovernanceBadges.map((badge) => (
                  <span className="event-chip" key={`${selectedTemplate.id}-sandbox-${badge}`}>
                    {badge}
                  </span>
                ))}
              </div>

              <p className="binding-meta">
                {sandboxDependencySummary ??
                  "当前模板含有 sandbox_code 节点，但还没有记录显式 dependencyMode；进入编辑器后应优先补齐依赖策略、builtin package set 或 dependency ref。"}
              </p>

              <div className="governance-node-list">
                {selectedTemplateSandboxGovernance.nodes.map((node) => (
                  <div className="binding-card compact-card" key={`${selectedTemplate.id}-sandbox-node-${node.id}`}>
                    <div className="binding-card-header">
                      <div>
                        <p className="entry-card-title">{node.name}</p>
                        <p className="binding-meta">sandbox_code · {node.id}</p>
                      </div>
                      <span className="health-pill">{node.executionClass}</span>
                    </div>
                    <div className="starter-tag-row">
                      {buildSandboxNodeFactChips(node).map((fact) => (
                        <span className="event-chip" key={`${selectedTemplate.id}-${node.id}-${fact}`}>
                          {fact}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="governance-node-list">
            {(selectedTemplate.definition.nodes ?? []).map((node) => (
              <div className="binding-card compact-card" key={node.id}>
                <div className="binding-card-header">
                  <div>
                    <p className="entry-card-title">{node.name ?? node.id}</p>
                    <p className="binding-meta">
                      {node.type} · {node.id}
                    </p>
                  </div>
                  <span className="health-pill">{node.type}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function buildSandboxNodeFactChips(node: WorkflowDefinitionSandboxGovernanceNode) {
  const chips = [
    node.explicitExecution ? "explicit runtimePolicy" : "default runtimePolicy",
    `dependencyMode ${node.dependencyMode ?? "未声明"}`
  ];

  if (node.builtinPackageSet) {
    chips.push(`builtin ${node.builtinPackageSet}`);
  }
  if (node.dependencyRef) {
    chips.push(`dependency ref ${node.dependencyRef}`);
  }
  if (node.backendExtensionKeys.length > 0) {
    chips.push(`extensions ${node.backendExtensionKeys.join(", ")}`);
  }

  return chips;
}
