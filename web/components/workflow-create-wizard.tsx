"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { WorkspaceStarterFollowUpCard } from "@/components/workspace-starter-library/follow-up-card";
import {
  buildWorkspaceStarterMissingToolGovernanceSurface,
  buildWorkspaceStarterSourceGovernanceSurface,
  type WorkspaceStarterFollowUpSurface
} from "@/components/workspace-starter-library/shared";
import { WorkbenchEntryLink, WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { WorkflowChipLink } from "@/components/workflow-chip-link";
import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";
import { ToolGovernanceSummary } from "@/components/tool-governance-summary";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import type { WorkspaceStarterSourceGovernanceKind } from "@/lib/get-workspace-starters";
import {
  getWorkflowBusinessTrack,
  WORKFLOW_BUSINESS_TRACKS
} from "@/lib/workflow-business-tracks";
import {
  appendWorkflowLibraryViewState,
  appendWorkflowLibraryViewStateForWorkflow
} from "@/lib/workflow-library-query";
import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  describeWorkflowDefinitionSandboxDependency
} from "@/lib/workflow-definition-sandbox-governance";
import { formatCatalogGapToolSummary, getWorkflowLegacyPublishAuthBacklogCount } from "@/lib/workflow-definition-governance";
import type {
  WorkflowLibrarySourceLane,
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import {
  buildWorkflowGovernanceHandoff,
  type WorkflowGovernanceHandoff
} from "@/lib/workflow-governance-handoff";
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
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState,
  buildWorkflowEditorHrefFromWorkspaceStarterViewState,
  buildWorkflowLibraryHrefFromWorkspaceStarterViewState,
  buildWorkspaceHrefFromWorkspaceStarterViewState,
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

import { Input, Button, Spin, Layout, Typography, Card, Space, Tag, Modal, Row, Col } from "antd";
import { PlusOutlined, RocketOutlined, ArrowLeftOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;

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
            template: toWorkspaceStarterGovernanceTemplate(selectedStarter)
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterSourcePresenter =
    selectedStarterSourceGovernanceSurface?.presenter ?? null;
  const selectedStarterSourceChips = selectedStarterSourcePresenter?.factChips ?? [];
  const selectedStarterSourcePrimarySignal =
    selectedStarter?.sourceGovernance?.outcomeExplanation?.primarySignal ??
    selectedStarter?.sourceGovernance?.outcomeExplanation?.primary_signal ??
    null;
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
  const currentWorkflowCreateHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState(
    workspaceStarterGovernanceScope
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
  const sourceWorkflowSummariesById = useMemo(
    () => Object.fromEntries(workflows.map((workflow) => [workflow.id, workflow] as const)),
    [workflows]
  );
  const selectedStarterMissingToolGovernanceSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkspaceStarterMissingToolGovernanceSurface({
            template: toWorkspaceStarterGovernanceTemplate(selectedStarter),
            missingToolIds: selectedStarter.missingToolIds,
            sourceWorkflowSummariesById,
            workspaceStarterGovernanceQueryScope: workspaceStarterGovernanceScope
          })
        : null,
    [selectedStarter, sourceWorkflowSummariesById, workspaceStarterGovernanceScope]
  );
  const selectedStarterMissingToolBlockingSurface = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterMissingToolBlockingSurface({
            starter: selectedStarter
          })
        : null,
    [selectedStarter]
  );
  const selectedStarterLegacyAuthWorkflowGovernanceHandoff = useMemo(
    () =>
      selectedStarter
        ? buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
            starter: selectedStarter,
            legacyAuthGovernanceSnapshot,
            workspaceStarterGovernanceScope
          })
        : null,
    [legacyAuthGovernanceSnapshot, selectedStarter, workspaceStarterGovernanceScope]
  );
  const selectedStarterNextStepSurface = selectedStarter
    ? buildWorkflowCreateStarterNextStepSurface({
        missingToolGovernanceSurface: selectedStarterMissingToolGovernanceSurface,
        legacyAuthWorkflowGovernanceHandoff: selectedStarterLegacyAuthWorkflowGovernanceHandoff,
        starter: selectedStarter,
        sourceGovernanceSurface: selectedStarterSourceGovernanceSurface,
        starterGovernanceHref,
        surfaceCopy
      })
    : null;
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

    if (selectedStarterMissingToolBlockingSurface) {
      setMessage(selectedStarterMissingToolBlockingSurface.blockedMessage);
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
              <WorkbenchEntryLinks
                {...surfaceCopy.emptyStateLinks}
                currentHref={currentWorkflowCreateHref}
              />
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
    <main className="workflow-create-shell">
      <section className="workflow-create-topbar">
        <div className="workflow-create-topbar-left">
          <Link href={buildWorkspaceHrefFromWorkspaceStarterViewState(workspaceStarterGovernanceScope)}>
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              className="workflow-create-back-button"
            >
              返回工作台
            </Button>
          </Link>
          <div className="workflow-create-topbar-copy">
            <span>New app</span>
            <strong>创建应用</strong>
          </div>
        </div>

        <div className="workflow-create-topbar-actions">
          <WorkbenchEntryLinks
            {...surfaceCopy.heroLinks}
            currentHref={currentWorkflowCreateHref}
            variant="inline"
          />
        </div>
      </section>

      <section className="workflow-create-page">
        <div className="workflow-create-main-card">
          <div className="workflow-create-hero">
            <div className="workflow-create-hero-copy">
              <p className="workspace-eyebrow">Applications / Create</p>
              <Title level={3} style={{ margin: 0, color: '#111827' }}>
                选择应用模板
              </Title>
              <Text type="secondary">先按主业务线选入口，再用最小骨架进入编排。</Text>

              {recentWorkflowLink ? (
                <div className="workflow-create-inline-actions">
                  <Link href={recentWorkflowLink.href} className="workflow-create-inline-link">
                    {recentWorkflowLink.label}
                  </Link>
                </div>
              ) : null}

              {hasScopedWorkspaceStarterFilters ? (
                <div className="workflow-create-scoped-banner">
                  <strong>Scoped governance</strong>
                  <span>{surfaceCopy.scopedGovernanceDescription}</span>
                  <Link href={starterGovernanceHref} className="workflow-create-inline-link">
                    {surfaceCopy.scopedGovernanceBackLinkLabel}
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="workflow-create-hero-side">
              <article className="workflow-create-hero-stat">
                <span>当前业务线</span>
                <strong>{activeTrackMeta.priority}</strong>
                <p>{activeTrackMeta.id}</p>
              </article>
              <article className="workflow-create-hero-stat">
                <span>可用模板</span>
                <strong>{visibleStarters.length}</strong>
                <p>{catalogToolCount} 个工具能力已入目录</p>
              </article>
              <article className="workflow-create-hero-stat wide">
                <span>创建目标</span>
                <strong>{selectedStarter.defaultWorkflowName}</strong>
                <p>{selectedStarter.recommendedNextStep}</p>
              </article>
            </div>
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

          {workflows.length > 0 ? (
            <div className="workflow-create-recent-section">
              <div className="workflow-create-recent-header">
                <div>
                  <p className="workspace-eyebrow">Recent drafts</p>
                  <h3>最近工作流</h3>
                </div>
              </div>
              <div className="workflow-create-recent-grid">
                {workflows.slice(0, 3).map((workflow) => {
                  const workflowHref = appendWorkflowLibraryViewState(
                    buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
                      workflowId: workflow.id,
                      viewState: workspaceStarterGovernanceScope,
                      variant: 'recent'
                    }).href,
                    workflow.tool_governance?.missing_tool_ids?.length
                      ? { definitionIssue: 'missing_tool' }
                      : {}
                  );

                  return (
                    <WorkflowChipLink
                      currentHref={currentWorkflowCreateHref}
                      href={workflowHref}
                      key={workflow.id}
                      workflow={workflow}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}

          {selectedStarterNextStepSurface ? (
            <div className="workflow-create-followup-card">
              <WorkspaceStarterFollowUpCard
                title={surfaceCopy.recommendedNextStepTitle}
                label={selectedStarterNextStepSurface.label}
                detail={selectedStarterNextStepSurface.detail}
                primaryResourceSummary={selectedStarterNextStepSurface.primaryResourceSummary}
                workflowGovernanceHandoff={selectedStarterNextStepSurface.workflowGovernanceHandoff}
                actions={
                  selectedStarterNextStepSurface.href && selectedStarterNextStepSurface.hrefLabel ? (
                    <Link href={selectedStarterNextStepSurface.href} className="workflow-create-inline-link">
                      {selectedStarterNextStepSurface.hrefLabel}
                    </Link>
                  ) : null
                }
              />
            </div>
          ) : null}
        </div>

        <aside className="workflow-create-side">
          <div className="workflow-create-config-card">
            <Title level={4} style={{ margin: '0 0 20px', color: '#111827' }}>
              配置草稿
            </Title>

            <div className="workflow-create-form-field">
              <div className="workflow-create-form-label">应用名称</div>
              <Input
                size="large"
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
                placeholder={selectedStarter.defaultWorkflowName}
              />
            </div>

            <div className="workflow-create-selected-card">
              <div className="workflow-create-selected-head">
                <div>
                  <div className="workflow-create-selected-title">{selectedStarter.name}</div>
                  <div className="workflow-create-selected-copy">{selectedStarter.description}</div>
                </div>
                <Tag color="blue" style={{ margin: 0 }}>
                  {selectedStarter.priority}
                </Tag>
              </div>

              <Row gutter={[8, 8]} className="workflow-create-selected-metrics">
                <Col span={12}>
                  <div className="workflow-create-metric-label">Track</div>
                  <div className="workflow-create-metric-value">{selectedStarter.businessTrack}</div>
                </Col>
                <Col span={12}>
                  <div className="workflow-create-metric-label">Source</div>
                  <div className="workflow-create-metric-value">{selectedStarter.source.shortLabel}</div>
                </Col>
                <Col span={12}>
                  <div className="workflow-create-metric-label">Nodes</div>
                  <div className="workflow-create-metric-value">{selectedStarter.nodeCount}</div>
                </Col>
                <Col span={12}>
                  <div className="workflow-create-metric-label">Governed tools</div>
                  <div className="workflow-create-metric-value">{selectedStarter.governedToolCount}</div>
                </Col>
              </Row>

              {selectedStarterSandboxBadges.length > 0 ? (
                <div className="workflow-create-selected-badges">
                  {selectedStarterSandboxBadges.map((badge) => (
                    <Tag
                      key={`${selectedStarter.id}-${badge.label}`}
                      color={badge.tone === 'warning' ? 'gold' : badge.tone === 'danger' ? 'red' : 'blue'}
                      style={{ margin: 0 }}
                    >
                      {badge.label}
                    </Tag>
                  ))}
                </div>
              ) : null}

              {selectedStarterSandboxDependencySummary ? (
                <div className="workflow-create-selected-hint">{selectedStarterSandboxDependencySummary}</div>
              ) : null}
            </div>

            <Button
              type="primary"
              size="large"
              block
              disabled={Boolean(selectedStarterMissingToolBlockingSurface)}
              onClick={handleCreateWorkflow}
              loading={isCreating}
              className="workflow-create-primary-button"
            >
              创建并进入编排
            </Button>

            {message ? (
              <div className={`workflow-create-feedback ${messageTone === 'error' ? 'error' : 'success'}`}>
                {message}
              </div>
            ) : null}
          </div>

          {selectedStarterMissingToolBlockingSurface ? (
            <div className="workflow-create-warning-card">
              <strong>catalog gap</strong>
              {selectedStarterMissingToolBlockingSurface.blockedMessage}
            </div>
          ) : null}

          {shouldRenderSelectedStarterSourceGovernance ? (
            <div className="workflow-create-governance-card">
              <div className="workflow-create-governance-header">
                <div className="workflow-create-governance-eyebrow">Source governance</div>
                <p>{surfaceCopy.sourceGovernanceDescription}</p>
              </div>
              <div className="workflow-create-governance-body">
                {selectedStarterSourcePresenter ? (
                  <>
                    <div className="workflow-create-selected-badges">
                      <Tag color="blue" style={{ margin: 0 }}>
                        {selectedStarterSourcePresenter.actionStatusLabel ?? selectedStarterSourcePresenter.statusLabel}
                      </Tag>
                      {selectedStarterSourceChips.map((chip) => (
                        <Tag key={`${selectedStarter.id}-${chip}`} style={{ margin: 0 }}>
                          {chip}
                        </Tag>
                      ))}
                    </div>
                    {selectedStarterSourcePrimarySignal ? <div>{selectedStarterSourcePrimarySignal}</div> : null}
                    <div>{selectedStarterSourcePresenter.followUp ?? selectedStarterSourcePresenter.summary}</div>
                  </>
                ) : null}

                {selectedStarterNextStepSurface?.href && selectedStarterNextStepSurface.hrefLabel ? (
                  <div>
                    {surfaceCopy.sourceGovernanceFollowUpPrefix}
                    <Link href={selectedStarterNextStepSurface.href} className="workflow-create-inline-link with-offset">
                      {selectedStarterNextStepSurface.hrefLabel}
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
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
  workflowGovernanceHandoff?: WorkflowGovernanceHandoff | null;
  href: string | null;
  hrefLabel: string | null;
};

type WorkflowCreateStarterMissingToolBlockingSurface = {
  blockedMessage: string;
};

function toWorkspaceStarterGovernanceTemplate(
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
  legacyAuthWorkflowGovernanceHandoff,
  starter,
  sourceGovernanceSurface,
  starterGovernanceHref,
  surfaceCopy
}: {
  missingToolGovernanceSurface: WorkspaceStarterFollowUpSurface | null;
  legacyAuthWorkflowGovernanceHandoff: WorkflowGovernanceHandoff | null;
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
      workflowGovernanceHandoff: missingToolGovernanceSurface.workflowGovernanceHandoff,
      href: missingToolGovernanceSurface.entryOverride?.href ?? null,
      hrefLabel: missingToolGovernanceSurface.entryOverride?.label ?? null
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
      workflowGovernanceHandoff:
        recommendedNextStep.workflowGovernanceHandoff ?? legacyAuthWorkflowGovernanceHandoff,
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
      workflowGovernanceHandoff:
        sourceGovernanceSurface?.recommendedNextStep?.workflowGovernanceHandoff ??
        legacyAuthWorkflowGovernanceHandoff,
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
    workflowGovernanceHandoff: legacyAuthWorkflowGovernanceHandoff,
    href: shouldLinkToStarterGovernance ? starterGovernanceHref : null,
    hrefLabel: shouldLinkToStarterGovernance
      ? surfaceCopy.sourceGovernanceFollowUpLinkLabel
      : null
  };
}

function buildWorkflowCreateStarterMissingToolBlockingSurface({
  starter
}: {
  starter: WorkflowStarterTemplate;
}): WorkflowCreateStarterMissingToolBlockingSurface | null {
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
    "如果现在创建，API 会直接拒绝该草稿。先补 tool binding，再沿上面的治理入口完成治理，最后回来创建草稿。";

  return {
    blockedMessage
  };
}

function buildWorkflowCreateStarterLegacyAuthWorkflowGovernanceHandoff({
  starter,
  legacyAuthGovernanceSnapshot,
  workspaceStarterGovernanceScope
}: {
  starter: WorkflowStarterTemplate;
  legacyAuthGovernanceSnapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workspaceStarterGovernanceScope: WorkspaceStarterGovernanceQueryScope;
}): WorkflowGovernanceHandoff | null {
  const sourceWorkflowId =
    starter.sourceGovernance?.sourceWorkflowId?.trim() || starter.createdFromWorkflowId?.trim();

  if (!sourceWorkflowId || legacyAuthGovernanceSnapshot === null) {
    return null;
  }

  const workflow = legacyAuthGovernanceSnapshot.workflows.find(
    (item) => item.workflow_id === sourceWorkflowId
  );

  if (workflow === undefined || getWorkflowLegacyPublishAuthBacklogCount(workflow) <= 0) {
    return null;
  }

  const workflowDetailLink = buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
    workflowId: workflow.workflow_id,
    viewState: workspaceStarterGovernanceScope,
    variant: "source"
  });

  return buildWorkflowGovernanceHandoff({
    workflowId: workflow.workflow_id,
    workflowDetailHref: workflowDetailLink.href,
    toolGovernance: workflow.tool_governance,
    legacyAuthGovernance: legacyAuthGovernanceSnapshot
  });
}
