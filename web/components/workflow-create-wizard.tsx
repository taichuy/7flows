"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import { buildWorkspaceStarterSourceGovernanceSurface } from "@/components/workspace-starter-library/shared";
import { WorkbenchEntryLink, WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import type { WorkspaceStarterSourceGovernanceKind } from "@/lib/get-workspace-starters";
import {
  buildLegacyPublishAuthModeContractSummary,
  buildLegacyPublishAuthModeFollowUp
} from "@/lib/legacy-publish-auth-contract";
import {
  getWorkflowBusinessTrack,
  WORKFLOW_BUSINESS_TRACKS
} from "@/lib/workflow-business-tracks";
import { appendWorkflowLibraryViewState } from "@/lib/workflow-library-query";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency
} from "@/lib/workflow-definition-sandbox-governance";
import {
  formatCatalogGapResourceSummary,
  formatCatalogGapToolSummary
} from "@/lib/workflow-definition-governance";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import {
  buildWorkflowCreateWizardSurfaceCopy,
  type WorkflowCreateWizardSurfaceCopy
} from "@/lib/workbench-entry-surfaces";
import {
  createWorkflow,
  type WorkflowListItem,
  WorkflowDefinitionValidationError
} from "@/lib/get-workflows";
import {
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
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
  legacyAuthGovernanceSnapshot?: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workflows: WorkflowListItem[];
  starters: WorkflowLibraryStarterItem[];
  starterSourceLanes: WorkflowLibrarySourceLane[];
  nodeCatalog: WorkflowNodeCatalogItem[];
  tools: PluginToolRegistryItem[];
};

export function WorkflowCreateWizard({
  catalogToolCount,
  governanceQueryScope,
  legacyAuthGovernanceSnapshot = null,
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
  const selectedStarterMissingToolGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterMissingToolGovernanceSurface({
            starter: selectedStarter,
            workspaceStarterGovernanceScope
          })
        : null,
    [selectedStarter, workspaceStarterGovernanceScope]
  );
  const selectedStarterNextStepSurface = selectedStarter
    ? buildWorkflowCreateStarterNextStepSurface({
        missingToolGovernanceSurface: selectedStarterMissingToolGovernanceSurface,
        starter: selectedStarter,
        sourceGovernanceSurface: selectedStarterSourceGovernanceSurface,
        starterGovernanceHref,
        surfaceCopy
      })
    : null;
  const selectedStarterLegacyAuthGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterLegacyAuthGovernanceSurface({
            starter: selectedStarter,
            legacyAuthGovernanceSnapshot,
            workspaceStarterGovernanceScope
          })
        : null,
    [
      legacyAuthGovernanceSnapshot,
      selectedStarter,
      workspaceStarterGovernanceScope
    ]
  );
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

      if (selectedStarterMissingToolGovernanceSurface) {
        setMessage(selectedStarterMissingToolGovernanceSurface.blockedMessage);
        setMessageTone("error");
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
              {selectedStarterNextStepSurface ? (
                <WorkspaceStarterFollowUpCard
                  title={surfaceCopy.recommendedNextStepTitle}
                  label={selectedStarterNextStepSurface.label}
                  detail={selectedStarterNextStepSurface.detail}
                  primaryResourceSummary={selectedStarterNextStepSurface.primaryResourceSummary}
                  actions={
                    selectedStarterNextStepSurface.href && selectedStarterNextStepSurface.hrefLabel ? (
                      <WorkbenchEntryLink
                        className="inline-link secondary"
                        linkKey="workspaceStarterLibrary"
                        override={{ href: selectedStarterNextStepSurface.href }}
                      >
                        {selectedStarterNextStepSurface.hrefLabel}
                      </WorkbenchEntryLink>
                    ) : null
                  }
                />
              ) : null}
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
                  {selectedStarterSourceChips.length > 0 ? (
                    <div className="starter-tag-row">
                      {selectedStarterSourceChips.map((chip) => (
                        <span className="event-chip" key={`${selectedStarter.id}-${chip}`}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {selectedStarterLegacyAuthGovernanceSurface ? (
                <div className="binding-form">
                  <p className="binding-label">Source publish governance</p>
                  <p className="binding-meta">
                    当前 starter 的源 workflow 仍有 legacy publish auth backlog；创建新草稿前，先沿同一条治理链确认历史 binding 已经完成 cleanup 或 replacement，避免作者在创建页丢失 publish handoff。
                  </p>
                  <div className="summary-strip compact-strip">
                    <div className="summary-card">
                      <span>Source workflow</span>
                      <strong>{selectedStarterLegacyAuthGovernanceSurface.workflowName}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Draft cleanup</span>
                      <strong>{selectedStarterLegacyAuthGovernanceSurface.draftCandidateCount}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Published blockers</span>
                      <strong>{selectedStarterLegacyAuthGovernanceSurface.publishedBlockerCount}</strong>
                    </div>
                    <div className="summary-card">
                      <span>Offline inventory</span>
                      <strong>{selectedStarterLegacyAuthGovernanceSurface.offlineInventoryCount}</strong>
                    </div>
                  </div>
                  <p className="section-copy starter-summary-copy">
                    {selectedStarterLegacyAuthGovernanceSurface.summary}
                  </p>
                  <p className="binding-meta">
                    {selectedStarterLegacyAuthGovernanceSurface.followUp}
                  </p>
                  <div className="binding-actions">
                    <Link
                      className="inline-link"
                      href={selectedStarterLegacyAuthGovernanceSurface.workflowDetailHref}
                    >
                      {selectedStarterLegacyAuthGovernanceSurface.workflowDetailLabel}
                    </Link>
                    <Link
                      className="inline-link secondary"
                      href={selectedStarterLegacyAuthGovernanceSurface.workflowLibraryHref}
                    >
                      {selectedStarterLegacyAuthGovernanceSurface.workflowLibraryLabel}
                    </Link>
                  </div>
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
              {selectedStarterMissingToolGovernanceSurface ? (
                <div className="binding-form">
                  <p className="binding-label">Catalog gap</p>
                  <p className="binding-meta">
                    当前 starter 里的缺失 tool 会让创建动作在 API 校验阶段 fail-closed；先沿治理入口补齐 binding，
                    再回到创建页继续推草稿。
                  </p>
                  <div className="starter-tag-row">
                    {selectedStarterMissingToolGovernanceSurface.missingToolIds.map((toolId) => (
                      <span className="event-chip" key={`${selectedStarter.id}-missing-tool-${toolId}`}>
                        {toolId}
                      </span>
                    ))}
                  </div>
                  <p className="section-copy starter-summary-copy">
                    {selectedStarterMissingToolGovernanceSurface.detail}
                  </p>
                  {selectedStarterMissingToolGovernanceSurface.href &&
                  selectedStarterMissingToolGovernanceSurface.hrefLabel ? (
                    <div className="binding-actions">
                      <Link
                        className="inline-link"
                        href={selectedStarterMissingToolGovernanceSurface.href}
                      >
                        {selectedStarterMissingToolGovernanceSurface.hrefLabel}
                      </Link>
                    </div>
                  ) : null}
                </div>
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
                disabled={isCreating || selectedStarterMissingToolGovernanceSurface !== null}
              >
                {isCreating
                  ? "创建中..."
                  : selectedStarterMissingToolGovernanceSurface
                    ? "先补 tool binding"
                    : "创建并进入画布"}
              </button>
            </div>

            <p className={`sync-message ${messageTone}`}>
              {message ??
                (selectedStarterMissingToolGovernanceSurface?.blockedMessage ??
                  "创建后会直接进入 workflow 编辑器，继续补节点、连线、运行态调试和后续发布链路。")}
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

type WorkspaceStarterSourceGovernanceSurface = ReturnType<
  typeof buildWorkspaceStarterSourceGovernanceSurface
>;

type WorkflowCreateStarterNextStepSurface = {
  label: string;
  detail: string;
  primaryResourceSummary?: string | null;
  href: string | null;
  hrefLabel: string | null;
};

type WorkflowCreateStarterMissingToolGovernanceSurface = {
  label: string;
  detail: string;
  primaryResourceSummary: string;
  blockedMessage: string;
  missingToolIds: string[];
  href: string | null;
  hrefLabel: string | null;
};

type WorkflowCreateStarterLegacyAuthGovernanceSurface = {
  workflowName: string;
  draftCandidateCount: number;
  publishedBlockerCount: number;
  offlineInventoryCount: number;
  summary: string;
  followUp: string;
  workflowDetailHref: string;
  workflowDetailLabel: string;
  workflowLibraryHref: string;
  workflowLibraryLabel: string;
};

function toWorkspaceStarterSourceGovernanceTemplate(
  starter: WorkflowStarterTemplate
): WorkspaceStarterSourceGovernanceSurfaceTemplate {
  const governance = starter.sourceGovernance;

  return {
    id: starter.id,
    name: starter.name,
    archived: starter.archived,
    created_from_workflow_id: starter.createdFromWorkflowId ?? governance?.sourceWorkflowId ?? null,
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

function buildWorkflowCreateStarterNextStepSurface({
  missingToolGovernanceSurface,
  starter,
  sourceGovernanceSurface,
  starterGovernanceHref,
  surfaceCopy
}: {
  missingToolGovernanceSurface: WorkflowCreateStarterMissingToolGovernanceSurface | null;
  starter: WorkflowStarterTemplate;
  sourceGovernanceSurface: WorkspaceStarterSourceGovernanceSurface | null;
  starterGovernanceHref: string;
  surfaceCopy: WorkflowCreateWizardSurfaceCopy;
}): WorkflowCreateStarterNextStepSurface {
  if (missingToolGovernanceSurface) {
    return {
      label: missingToolGovernanceSurface.label,
      detail: missingToolGovernanceSurface.detail,
      primaryResourceSummary: missingToolGovernanceSurface.primaryResourceSummary,
      href: missingToolGovernanceSurface.href,
      hrefLabel: missingToolGovernanceSurface.hrefLabel
    };
  }

  const presenter = sourceGovernanceSurface?.presenter ?? null;
  const recommendedNextStep = sourceGovernanceSurface?.recommendedNextStep ?? null;
  const shouldLinkToStarterGovernance =
    starter.origin === "workspace" ||
    Boolean(starter.createdFromWorkflowId) ||
    Boolean(starter.sourceGovernance);

  if (
    recommendedNextStep &&
    (recommendedNextStep.action === "refresh" || recommendedNextStep.action === "rebase")
  ) {
    return {
      label: recommendedNextStep.label,
      detail: recommendedNextStep.detail,
      primaryResourceSummary: recommendedNextStep.primaryResourceSummary,
      href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
      hrefLabel: shouldLinkToStarterGovernance
        ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
        : null
    };
  }

  if (presenter?.needsAttention) {
    return {
      label: presenter.actionStatusLabel ?? presenter.statusLabel,
      detail: presenter.followUp ?? presenter.summary,
      primaryResourceSummary: sourceGovernanceSurface?.recommendedNextStep?.primaryResourceSummary,
      href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
      hrefLabel: shouldLinkToStarterGovernance
        ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
        : null
    };
  }

  return {
    label: surfaceCopy.createWorkflowRecommendedNextStepLabel,
    detail: starter.recommendedNextStep,
    primaryResourceSummary: null,
    href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
    hrefLabel: shouldLinkToStarterGovernance
      ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
      : null
  };
}

function buildWorkflowCreateStarterMissingToolGovernanceSurface({
  starter,
  workspaceStarterGovernanceScope
}: {
  starter: WorkflowStarterTemplate;
  workspaceStarterGovernanceScope: WorkspaceStarterGovernanceQueryScope;
}): WorkflowCreateStarterMissingToolGovernanceSurface | null {
  const missingToolIds = Array.from(
    new Set(starter.missingToolIds.map((toolId) => toolId.trim()).filter(Boolean))
  );

  if (missingToolIds.length === 0) {
    return null;
  }

  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();
  const renderedToolSummary = formatCatalogGapToolSummary(missingToolIds) ?? "unknown tool";
  const blockedMessage =
    `当前 starter 仍有 catalog gap（${renderedToolSummary}）；` +
    "先沿上面的治理入口补齐 binding，再回来创建草稿。";

  if (!sourceWorkflowId) {
    return {
      label: "catalog gap",
      detail:
        `当前 starter 仍引用目录里不存在的 tool：${renderedToolSummary}；` +
        "如果现在创建，API 会直接拒绝该草稿。先同步 workspace plugin catalog，或切换到仍可用的 starter。",
      primaryResourceSummary:
        formatCatalogGapResourceSummary(starter.name, missingToolIds) ??
        `${starter.name} · catalog gap`,
      blockedMessage,
      missingToolIds,
      href: null,
      hrefLabel: null
    };
  }

  const sourceWorkflowLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
    workflowId: sourceWorkflowId,
    viewState: workspaceStarterGovernanceScope,
    variant: "source"
  });

  return {
    label: "catalog gap",
    detail:
      `当前 starter 仍引用目录里不存在的 tool：${renderedToolSummary}；` +
      "如果现在创建，API 会直接拒绝该草稿。先回源 workflow 补齐 tool binding，再回来继续创建。",
    primaryResourceSummary:
      formatCatalogGapResourceSummary(starter.name, missingToolIds) ??
      `${starter.name} · catalog gap`,
    blockedMessage,
    missingToolIds,
    href: appendWorkflowLibraryViewState(sourceWorkflowLink.href, {
      definitionIssue: "missing_tool"
    }),
    hrefLabel: sourceWorkflowLink.label
  };
}

function buildWorkflowCreateStarterLegacyAuthGovernanceSurface({
  starter,
  legacyAuthGovernanceSnapshot,
  workspaceStarterGovernanceScope
}: {
  starter: WorkflowStarterTemplate;
  legacyAuthGovernanceSnapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workspaceStarterGovernanceScope: WorkspaceStarterGovernanceQueryScope;
}): WorkflowCreateStarterLegacyAuthGovernanceSurface | null {
  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();

  if (!sourceWorkflowId || legacyAuthGovernanceSnapshot === null) {
    return null;
  }

  const workflow = legacyAuthGovernanceSnapshot.workflows.find(
    (item) => item.workflow_id === sourceWorkflowId
  );

  if (
    workflow === undefined ||
    (workflow.draft_candidate_count <= 0 && workflow.published_blocker_count <= 0)
  ) {
    return null;
  }

  const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
    workflowId: workflow.workflow_id,
    viewState: workspaceStarterGovernanceScope,
    variant: "source"
  });
  const workflowLibraryHref = appendWorkflowLibraryViewState(
    buildWorkflowLibraryHrefFromWorkspaceStarterViewState(workspaceStarterGovernanceScope),
    {
      definitionIssue: "legacy_publish_auth"
    }
  );
  const workflowName =
    workflow.workflow_name || starter.sourceGovernance?.sourceWorkflowName || sourceWorkflowId;
  const contractSummary = buildLegacyPublishAuthModeContractSummary(
    legacyAuthGovernanceSnapshot.auth_mode_contract
  );
  const followUp = buildLegacyPublishAuthModeFollowUp(
    legacyAuthGovernanceSnapshot.auth_mode_contract
  );
  const summary =
    workflow.published_blocker_count > 0
      ? `${workflowName} 仍有 ${workflow.published_blocker_count} 条 live legacy binding，另外还有 ${workflow.draft_candidate_count} 条 draft cleanup 候选。${contractSummary}`
      : `${workflowName} 仍有 ${workflow.draft_candidate_count} 条 draft legacy binding 可直接 cleanup。${contractSummary}`;

  return {
    workflowName,
    draftCandidateCount: workflow.draft_candidate_count,
    publishedBlockerCount: workflow.published_blocker_count,
    offlineInventoryCount: workflow.offline_inventory_count,
    summary,
    followUp,
    workflowDetailHref: workflowDetailLink.href,
    workflowDetailLabel: workflowDetailLink.label,
    workflowLibraryHref,
    workflowLibraryLabel: "只看 legacy auth blocker workflows"
  };
}
