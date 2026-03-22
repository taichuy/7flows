"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buildWorkspaceStarterSourceGovernanceSurface } from "@/components/workspace-starter-library/shared";
import { WorkbenchEntryLink, WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkspaceStarterSourceGovernanceKind } from "@/lib/get-workspace-starters";
import {
  getWorkflowBusinessTrack,
  WORKFLOW_BUSINESS_TRACKS
} from "@/lib/workflow-business-tracks";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency
} from "@/lib/workflow-definition-sandbox-governance";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import { buildWorkflowCreateWizardSurfaceCopy } from "@/lib/workbench-entry-surfaces";
import {
  createWorkflow,
  type WorkflowListItem,
  WorkflowDefinitionValidationError
} from "@/lib/get-workflows";
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState,
  hasScopedWorkspaceStarterGovernanceFilters,
  pickWorkspaceStarterGovernanceQueryScope,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowStarterTemplates,
  buildWorkflowStarterTracks,
  type WorkflowStarterTemplate,
  type WorkflowStarterTemplateId
} from "@/lib/workflow-starters";

type WorkflowCreateWizardProps = {
  catalogToolCount: number;
  governanceQueryScope: WorkspaceStarterGovernanceQueryScope;
  workflows: WorkflowListItem[];
  starters: WorkflowLibraryStarterItem[];
  starterSourceLanes: WorkflowLibrarySourceLane[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  tools: PluginToolRegistryItem[];
};

export function WorkflowCreateWizard({
  catalogToolCount,
  governanceQueryScope,
  workflows,
  starters,
  starterSourceLanes,
  nodeCatalog,
  tools
}: WorkflowCreateWizardProps) {
  const router = useRouter();
  const preferredStarterId = governanceQueryScope.selectedTemplateId ?? undefined;
  const searchQuery = governanceQueryScope.searchQuery;
  const sourceGovernanceKind =
    governanceQueryScope.sourceGovernanceKind === "all"
      ? undefined
      : governanceQueryScope.sourceGovernanceKind;
  const needsFollowUp = governanceQueryScope.needsFollowUp;
  const starterTemplates = useMemo(
    () => buildWorkflowStarterTemplates(starters, nodeCatalog, tools),
    [nodeCatalog, starters, tools]
  );
  const starterTracks = useMemo(
    () => buildWorkflowStarterTracks(starterTemplates),
    [starterTemplates]
  );
  const defaultStarter =
    starterTemplates.find((starter) => starter.id === preferredStarterId) ??
    starterTemplates[0] ??
    null;
  const [activeTrack, setActiveTrack] = useState(
    governanceQueryScope.activeTrack === "all"
      ? (defaultStarter?.businessTrack ?? WORKFLOW_BUSINESS_TRACKS[0].id)
      : governanceQueryScope.activeTrack
  );
  const [governanceActiveTrack, setGovernanceActiveTrack] = useState(
    governanceQueryScope.activeTrack
  );
  const [selectedStarterId, setSelectedStarterId] =
    useState<WorkflowStarterTemplateId | null>(defaultStarter?.id ?? null);
  const [workflowName, setWorkflowName] = useState(defaultStarter?.defaultWorkflowName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "success" | "error">("idle");
  const [isCreating, startCreateTransition] = useTransition();

  const selectedStarter = useMemo(
    () =>
      (selectedStarterId
        ? starterTemplates.find((starter) => starter.id === selectedStarterId)
        : null) ?? defaultStarter,
    [defaultStarter, selectedStarterId, starterTemplates]
  );
  const activeTrackMeta = useMemo(
    () => getWorkflowBusinessTrack(activeTrack),
    [activeTrack]
  );
  const selectedStarterSandboxBadges = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowDefinitionSandboxGovernanceBadges(selectedStarter.sandboxGovernance)
        : [],
    [selectedStarter]
  );
  const selectedStarterSourceGovernance = selectedStarter?.sourceGovernance ?? null;
  const selectedStarterSourceGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkspaceStarterSourceGovernanceSurface({
            template: toWorkspaceStarterSourceGovernanceTemplate(selectedStarter)
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterSourcePresenter =
    selectedStarterSourceGovernanceSurface?.presenter ?? null;
  const selectedStarterSourceChips = selectedStarterSourcePresenter?.factChips ?? [];
  const selectedStarterSourceFollowUp =
    selectedStarterSourceGovernanceSurface?.recommendedNextStep?.detail ??
    selectedStarterSourcePresenter?.followUp ??
    "";
  const selectedStarterSourceFollowUpLabel =
    selectedStarterSourceGovernanceSurface?.recommendedNextStep?.label ??
    selectedStarterSourcePresenter?.actionStatusLabel ??
    selectedStarterSourcePresenter?.statusLabel ??
    "";
  const shouldRenderSelectedStarterSourceGovernance = Boolean(
    selectedStarter &&
      (selectedStarter.origin === "workspace" ||
        selectedStarter.createdFromWorkflowId ||
        selectedStarterSourceGovernance)
  );
  const workspaceStarterGovernanceScope = useMemo<WorkspaceStarterGovernanceQueryScope>(
    () =>
      pickWorkspaceStarterGovernanceQueryScope({
        activeTrack: governanceActiveTrack,
        sourceGovernanceKind: sourceGovernanceKind ?? "all",
        needsFollowUp,
        searchQuery,
        selectedTemplateId:
          selectedStarter?.origin === "workspace"
            ? selectedStarter.id
            : governanceQueryScope.selectedTemplateId
      }),
    [
      governanceActiveTrack,
      governanceQueryScope.selectedTemplateId,
      needsFollowUp,
      searchQuery,
      selectedStarter,
      sourceGovernanceKind
    ]
  );
  const starterGovernanceHref = buildWorkspaceStarterLibraryHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
  );
  const recentWorkflowLink = workflows[0]
    ? buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
        workflowId: workflows[0].id,
        viewState: workspaceStarterGovernanceScope,
        variant: "recent"
      })
    : null;
  const surfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
    starterGovernanceHref
  });
  const selectedStarterSandboxDependencySummary = useMemo(
    () =>
      selectedStarter
        ? describeWorkflowDefinitionSandboxDependency(selectedStarter.sandboxGovernance)
        : null,
    [selectedStarter]
  );
  const visibleStarters = useMemo(
    () =>
      starterTemplates.filter((starter) =>
        activeTrack ? starter.businessTrack === activeTrack : true
      ),
    [activeTrack, starterTemplates]
  );

  const applyStarterSelection = (
    nextStarterId: WorkflowStarterTemplateId,
    currentStarterId: WorkflowStarterTemplateId | null = selectedStarterId
  ) => {
    const currentStarter =
      (currentStarterId
        ? starterTemplates.find((starter) => starter.id === currentStarterId)
        : null) ?? defaultStarter;
    const nextStarter =
      starterTemplates.find((starter) => starter.id === nextStarterId) ?? defaultStarter;

    if (!nextStarter) {
      return;
    }

    if (
      !workflowName.trim() ||
      (currentStarter
        ? workflowName.trim() === currentStarter.defaultWorkflowName
        : false)
    ) {
      setWorkflowName(nextStarter.defaultWorkflowName);
    }

    setSelectedStarterId(nextStarterId);
    setActiveTrack(nextStarter.businessTrack);
    setMessage(null);
    setMessageTone("idle");
  };

  const handleTrackSelect = (trackId: (typeof starterTracks)[number]["id"]) => {
    setActiveTrack(trackId);
    setGovernanceActiveTrack(trackId);

    const nextVisibleStarters = starterTemplates.filter(
      (starter) => starter.businessTrack === trackId
    );
    if (nextVisibleStarters.some((starter) => starter.id === selectedStarterId)) {
      return;
    }

    if (nextVisibleStarters[0]) {
      applyStarterSelection(nextVisibleStarters[0].id);
    }
  };

  const handleCreateWorkflow = () => {
    startCreateTransition(async () => {
      if (!selectedStarter) {
        return;
      }

      const normalizedName = workflowName.trim() || selectedStarter.defaultWorkflowName;
      setMessage("正在创建 workflow 草稿...");
      setMessageTone("idle");

      try {
        const body = await createWorkflow({
          name: normalizedName,
          definition: structuredClone(selectedStarter.definition)
        });

        setMessage(`已创建 ${normalizedName}，正在进入编辑器...`);
        setMessageTone("success");
        router.push(
          buildWorkflowEditorHrefFromWorkspaceStarterViewState(
            body.id,
            workspaceStarterGovernanceScope
          )
        );
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof WorkflowDefinitionValidationError
            ? error.message
            : "无法连接后端创建 workflow，请确认 API 已启动。"
        );
        setMessageTone("error");
      }
    });
  };

  const hasScopedWorkspaceStarterFilters = hasScopedWorkspaceStarterGovernanceFilters(
    workspaceStarterGovernanceScope
  );

  if (!selectedStarter) {
    return (
      <main className="editor-shell">
        <section className="hero creation-hero">
          <div className="hero-copy">
            <p className="eyebrow">Starter scope</p>
            <h1>当前筛选范围里没有可复用的 active workspace starter</h1>
            <p className="hero-text">
              {surfaceCopy.emptyStateDescription}
            </p>
            <div className="hero-actions">
              <WorkbenchEntryLinks {...surfaceCopy.emptyStateLinks} />
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-label">Current track</div>
            <div className="panel-value">{activeTrackMeta.priority}</div>
            <p className="panel-text">
              当前业务线：<strong>{activeTrackMeta.id}</strong>
            </p>
            <p className="panel-text">
              搜索：<strong>{searchQuery.trim() || "未设置"}</strong>
            </p>
            <p className="panel-text">
              来源治理：<strong>{sourceGovernanceKind ?? "全部"}</strong>
            </p>
            <p className="panel-text">
              follow-up queue：<strong>{needsFollowUp ? "仅关注热点" : "未启用"}</strong>
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <section className="hero creation-hero">
        <div className="hero-copy">
          <p className="eyebrow">Workflow Creation</p>
          <h1>按业务主线挑 starter，再把草稿送进画布</h1>
          <p className="hero-text">
            这一页继续沿着当前优先级推进，不再只展示一排静态 starter 卡片，而是把
            “应用新建编排 / 节点能力 / 插件兼容 / API 调用开放” 收成一组可筛选的主业务入口。
            这样 starter 不只是创建页素材，而是后续模板治理和节点入口分层的稳定落点。
          </p>
          <div className="pill-row">
            <span className="pill">{starterTracks.length} business tracks</span>
            <span className="pill">{starterTemplates.length} starter templates</span>
            <span className="pill">{catalogToolCount} catalog tools</span>
            <span className="pill">{workflows.length} existing workflows</span>
          </div>
          <div className="hero-actions">
            <WorkbenchEntryLinks {...surfaceCopy.heroLinks} />
            {recentWorkflowLink ? (
              <Link className="inline-link secondary" href={recentWorkflowLink.href}>
                {recentWorkflowLink.label}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hero-panel">
          <div className="panel-label">Starter focus</div>
          <div className="panel-value">{activeTrackMeta.priority}</div>
          <p className="panel-text">
            当前主线：<strong>{activeTrackMeta.id}</strong>
          </p>
          <p className="panel-text">
            选中的 starter：<strong>{selectedStarter.name}</strong>
          </p>
          <p className="panel-text">
            当前焦点：<strong>{selectedStarter.workflowFocus}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>Visible starters</dt>
              <dd>{visibleStarters.length}</dd>
            </div>
            <div>
              <dt>Catalog tools</dt>
              <dd>{catalogToolCount}</dd>
            </div>
            <div>
              <dt>Drafts</dt>
              <dd>{workflows.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="creation-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Templates</p>
              <h2>Starter library</h2>
            </div>
            <p className="section-copy">
              先按主业务线选入口，再用最小骨架进入编排。后续 workspace 级模板治理，也继续沿着
              这套 starter library 演进。
            </p>
            {hasScopedWorkspaceStarterFilters ? (
              <p className="binding-meta">
                {surfaceCopy.scopedGovernanceDescription}
                {" "}
                <WorkbenchEntryLink
                  className="inline-link secondary"
                  linkKey="workspaceStarterLibrary"
                  override={{ href: starterGovernanceHref }}
                >
                  {surfaceCopy.scopedGovernanceBackLinkLabel}
                </WorkbenchEntryLink>
                。
              </p>
            ) : null}
          </div>

          <WorkflowStarterBrowser
            activeTrack={activeTrack}
            selectedStarterId={selectedStarter.id}
            starters={visibleStarters}
            tracks={starterTracks}
            sourceLanes={starterSourceLanes}
            onSelectTrack={handleTrackSelect}
            onSelectStarter={applyStarterSelection}
          />
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Create</p>
              <h2>Draft setup</h2>
            </div>
          </div>

          <div className="binding-form">
            <label className="binding-field">
              <span className="binding-label">Workflow name</span>
              <input
                className="trace-text-input"
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
                placeholder={selectedStarter.defaultWorkflowName}
              />
            </label>

            <div className="starter-summary-card">
              <div className="starter-card-header">
                <p className="entry-card-title">{selectedStarter.name}</p>
                <span className="health-pill">{selectedStarter.priority}</span>
              </div>
              <p className="section-copy starter-summary-copy">
                {selectedStarter.description}
              </p>
              <div className="summary-strip compact-strip">
                <div className="summary-card">
                  <span>Track</span>
                  <strong>{selectedStarter.businessTrack}</strong>
                </div>
                <div className="summary-card">
                  <span>Source</span>
                  <strong>{selectedStarter.source.shortLabel}</strong>
                </div>
                <div className="summary-card">
                  <span>Nodes</span>
                  <strong>{selectedStarter.nodeCount}</strong>
                </div>
                <div className="summary-card">
                  <span>Governed tools</span>
                  <strong>{selectedStarter.governedToolCount}</strong>
                </div>
                <div className="summary-card">
                  <span>Strong isolation</span>
                  <strong>{selectedStarter.strongIsolationToolCount}</strong>
                </div>
              </div>
              <p className="starter-focus-copy">{selectedStarter.trackSummary}</p>
              <p className="starter-focus-copy">{selectedStarter.source.summary}</p>
              <p className="starter-focus-copy">
                下一步：{selectedStarter.recommendedNextStep}
              </p>
              {shouldRenderSelectedStarterSourceGovernance && selectedStarterSourcePresenter ? (
                <div className="binding-form">
                  <p className="binding-label">Source governance</p>
                  <p className="binding-meta">{surfaceCopy.sourceGovernanceDescription}</p>
                  <div className="summary-strip compact-strip">
                    <div className="summary-card">
                      <span>Status</span>
                      <strong>{selectedStarterSourcePresenter.statusLabel}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Template</span>
                      <strong>{selectedStarterSourceGovernance?.templateVersion ?? "未记录"}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Source</span>
                      <strong>{selectedStarterSourcePresenter.sourceVersion ?? "不可用"}</strong>
                    </div>
                  </div>
                  <p className="section-copy starter-summary-copy">
                    {selectedStarterSourcePresenter.summary}
                  </p>
                  {selectedStarterSourceFollowUp ? (
                    <div className="entry-card compact-card">
                      <div className="payload-card-header">
                        <span className="status-meta">Recommended next step</span>
                        {selectedStarterSourceFollowUpLabel ? (
                          <span className="event-chip">{selectedStarterSourceFollowUpLabel}</span>
                        ) : null}
                      </div>
                      <p className="section-copy starter-summary-copy">
                        {selectedStarterSourceFollowUp}
                      </p>
                    </div>
                  ) : null}
                  {selectedStarterSourceChips.length > 0 ? (
                    <div className="starter-tag-row">
                      {selectedStarterSourceChips.map((chip) => (
                        <span className="event-chip" key={`${selectedStarter.id}-${chip}`}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="binding-meta">
                    {surfaceCopy.sourceGovernanceFollowUpPrefix}
                    {" "}
                    <WorkbenchEntryLink
                      className="inline-link secondary"
                      linkKey="workspaceStarterLibrary"
                      override={{ href: starterGovernanceHref }}
                    >
                      {surfaceCopy.sourceGovernanceFollowUpLinkLabel}
                    </WorkbenchEntryLink>
                    。
                  </p>
                </div>
              ) : null}
              {selectedStarter.referencedTools.length > 0 ? (
                <div className="binding-form">
                  <p className="binding-label">Tool governance in this starter</p>
                  <p className="binding-meta">
                    创建前先确认 starter 已引用的工具是否默认需要 `sandbox / microvm`，避免后面进入画布后才发现治理约束。
                  </p>
                  {selectedStarter.referencedTools.slice(0, 2).map((tool) => (
                    <ToolGovernanceSummary
                      key={`starter-tool-${tool.id}`}
                      tool={tool}
                      title={tool.name || tool.id}
                      subtitle={`${tool.ecosystem} · starter referenced tool`}
                    />
                  ))}
                  {selectedStarter.referencedTools.length > 2 ? (
                    <p className="binding-meta">
                      还有 {selectedStarter.referencedTools.length - 2} 个引用工具会在进入编辑器后继续沿同一治理规则展示。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {selectedStarter.sandboxGovernance.sandboxNodeCount > 0 ? (
                <div className="binding-form">
                  <p className="binding-label">Sandbox dependency in this starter</p>
                  <p className="binding-meta">
                    创建前先确认 `sandbox_code` 节点已经记录的 execution、dependencyMode 和
                    backendExtensions 与当前 sandbox readiness 一致，避免进入画布后才发现依赖约束漂移。
                  </p>
                  <div className="summary-strip compact-strip">
                    <div className="summary-card">
                      <span>Sandbox nodes</span>
                      <strong>{selectedStarter.sandboxGovernance.sandboxNodeCount}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Execution</span>
                      <strong>
                        {selectedStarter.sandboxGovernance.executionClasses.join(" / ") || "-"}
                      </strong>
                    </div>
                    <div className="summary-card">
                      <span>Dependency mode</span>
                      <strong>
                        {selectedStarter.sandboxGovernance.dependencyModes.join(" / ") || "未声明"}
                      </strong>
                    </div>
                    <div className="summary-card">
                      <span>Extensions</span>
                      <strong>{selectedStarter.sandboxGovernance.backendExtensionNodeCount}</strong>
                    </div>
                  </div>
                  <div className="starter-tag-row">
                    {selectedStarterSandboxBadges.map((badge) => (
                      <span className="event-chip" key={`${selectedStarter.id}-${badge}`}>
                        {badge}
                      </span>
                    ))}
                  </div>
                  <p className="binding-meta">
                    {selectedStarterSandboxDependencySummary ??
                      "当前 starter 已含 sandbox_code 节点，但还没有显式 dependencyMode；进入画布后优先补齐依赖策略与 runtime policy。"}
                  </p>
                </div>
              ) : null}
              {selectedStarter.missingToolIds.length > 0 ? (
                <p className="sync-message error">
                  当前 starter 引用了目录里不存在的 tool：{selectedStarter.missingToolIds.join(", ")}。
                </p>
              ) : null}
              <div className="starter-tag-row">
                {selectedStarter.nodeLabels.map((nodeLabel) => (
                  <span className="event-chip" key={`summary-${nodeLabel}`}>
                    {nodeLabel}
                  </span>
                ))}
                {selectedStarter.tags.map((tag) => (
                  <span className="event-chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="binding-actions">
              <button
                className="sync-button"
                type="button"
                onClick={handleCreateWorkflow}
                disabled={isCreating}
              >
                {isCreating ? "创建中..." : "创建并进入画布"}
              </button>
            </div>

            <p className={`sync-message ${messageTone}`}>
              {message ??
                "创建后会直接进入 workflow 编辑器，继续补节点、连线、运行态调试和后续发布链路。"}
            </p>
          </div>
        </article>

        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Existing drafts</p>
              <h2>Continue an existing workflow</h2>
            </div>
            <p className="section-copy">
              已有草稿会继续保留版本链路。需要接着修改时，也可以直接回到现有 workflow。
            </p>
          </div>

          {workflows.length === 0 ? (
            <p className="empty-state">
              当前还没有历史 workflow。创建第一个 starter 后，就可以从这里继续返回编辑。
            </p>
          ) : (
            <div className="workflow-chip-row">
              {workflows.map((workflow) => {
                const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
                  workflowId: workflow.id,
                  viewState: workspaceStarterGovernanceScope
                });

                return (
                  <WorkflowChipLink
                    key={workflow.id}
                    workflow={workflow}
                    href={workflowDetailLink.href}
                  />
                );
              })}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

type WorkspaceStarterSourceGovernanceSurfaceTemplate = Parameters<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>[0]["template"];

function toWorkspaceStarterSourceGovernanceTemplate(
  starter: WorkflowStarterTemplate
): WorkspaceStarterSourceGovernanceSurfaceTemplate {
  const governance = starter.sourceGovernance;

  return {
    archived: starter.archived,
    created_from_workflow_id: starter.createdFromWorkflowId,
    source_governance: governance
      ? {
          kind: governance.kind,
          status_label: governance.statusLabel,
          summary: governance.summary,
          source_workflow_id: governance.sourceWorkflowId ?? null,
          source_workflow_name: governance.sourceWorkflowName ?? null,
          template_version: governance.templateVersion ?? null,
          source_version: governance.sourceVersion ?? null,
          action_decision: governance.actionDecision ?? null,
          outcome_explanation: governance.outcomeExplanation ?? null
        }
      : null
  };
}
