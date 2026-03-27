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
    <div style={{ minHeight: '100vh', background: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation Bar mimicking Dify modal header */}
      <div style={{ height: 56, background: '#ffffff', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <Link href={buildWorkspaceHrefFromWorkspaceStarterViewState(workspaceStarterGovernanceScope)}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: '#374151', display: 'flex', alignItems: 'center', padding: '4px 8px' }}>
            返回工作台
          </Button>
        </Link>
        <div style={{ marginLeft: 16, fontSize: 16, fontWeight: 600, color: '#111827' }}>
          创建应用
        </div>
      </div>

      <div style={{ flex: 1, padding: '32px 24px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 1100, display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 60%', background: '#ffffff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
            <div style={{ marginBottom: 24 }}>
              <Title level={4} style={{ margin: 0, color: '#111827' }}>选择应用模板</Title>
              <Text type="secondary">先按主业务线选入口，再用最小骨架进入编排。</Text>
            </div>
            <div style={{ marginBottom: 16 }}>
              <WorkbenchEntryLinks
                {...surfaceCopy.heroLinks}
                currentHref={currentWorkflowCreateHref}
                variant="inline"
              />
            </div>
            {recentWorkflowLink ? (
              <div style={{ marginBottom: 16, fontSize: 13 }}>
                <Link href={recentWorkflowLink.href} style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 500 }}>
                  {recentWorkflowLink.label}
                </Link>
              </div>
            ) : null}
            {hasScopedWorkspaceStarterFilters ? (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 10, background: '#F8FAFC', border: '1px solid #E5E7EB', color: '#475467', fontSize: 13, lineHeight: 1.6 }}>
                <strong style={{ display: 'block', marginBottom: 6, color: '#111827' }}>Scoped governance</strong>
                <span>{surfaceCopy.scopedGovernanceDescription}</span>
                <div style={{ marginTop: 8 }}>
                  <Link href={starterGovernanceHref} style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 500 }}>
                    {surfaceCopy.scopedGovernanceBackLinkLabel}
                  </Link>
                </div>
              </div>
            ) : null}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16 }}>
                {workflows.slice(0, 3).map((workflow) => {
                  const workflowHref = appendWorkflowLibraryViewState(
                    buildWorkflowDetailLinkSurfaceFromWorkspaceStarterViewState({
                      workflowId: workflow.id,
                      viewState: workspaceStarterGovernanceScope,
                      variant: "recent"
                    }).href,
                    workflow.tool_governance?.missing_tool_ids?.length
                      ? { definitionIssue: "missing_tool" }
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
            ) : null}
            {selectedStarterNextStepSurface ? (
              <div style={{ marginTop: 16 }}>
                <WorkspaceStarterFollowUpCard
                  title={surfaceCopy.recommendedNextStepTitle}
                  label={selectedStarterNextStepSurface.label}
                  detail={selectedStarterNextStepSurface.detail}
                  primaryResourceSummary={selectedStarterNextStepSurface.primaryResourceSummary}
                  workflowGovernanceHandoff={selectedStarterNextStepSurface.workflowGovernanceHandoff}
                  actions={
                    selectedStarterNextStepSurface.href && selectedStarterNextStepSurface.hrefLabel ? (
                      <Link
                        href={selectedStarterNextStepSurface.href}
                        style={{ color: '#1D4ED8', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {selectedStarterNextStepSurface.hrefLabel}
                      </Link>
                    ) : null
                  }
                />
              </div>
            ) : null}
          </div>

          <div style={{ flex: '0 0 380px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 24, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <Title level={4} style={{ margin: '0 0 24px', color: '#111827' }}>配置草稿</Title>
              
              <div style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 8, fontWeight: 500, color: '#374151' }}>应用名称</div>
                <Input
                  size="large"
                  value={workflowName}
                  onChange={(event) => setWorkflowName(event.target.value)}
                  placeholder={selectedStarter.defaultWorkflowName}
                />
              </div>

              <div style={{ background: '#F9FAFB', borderRadius: 8, padding: 16, border: '1px solid #E5E7EB', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: '#111827' }}>{selectedStarter.name}</div>
                  <Tag color="blue" style={{ margin: 0 }}>{selectedStarter.priority}</Tag>
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
                  {selectedStarter.description}
                </div>
                
                <Row gutter={[8, 8]} style={{ fontSize: 12 }}>
                  <Col span={12}>
                    <div style={{ color: '#9CA3AF' }}>Track</div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>{selectedStarter.businessTrack}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ color: '#9CA3AF' }}>Source</div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>{selectedStarter.source.shortLabel}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ color: '#9CA3AF' }}>Nodes</div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>{selectedStarter.nodeCount}</div>
                  </Col>
                  <Col span={12}>
                    <div style={{ color: '#9CA3AF' }}>Governed tools</div>
                    <div style={{ fontWeight: 500, color: '#374151' }}>{selectedStarter.governedToolCount}</div>
                  </Col>
                </Row>
                {selectedStarterSandboxBadges.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {selectedStarterSandboxBadges.map((badge) => (
                      <Tag key={`${selectedStarter.id}-${badge.label}`} color={badge.tone === 'warning' ? 'gold' : badge.tone === 'danger' ? 'red' : 'blue'} style={{ margin: 0 }}>
                        {badge.label}
                      </Tag>
                    ))}
                  </div>
                ) : null}
                {selectedStarterSandboxDependencySummary ? (
                  <div style={{ marginTop: 12, fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
                    {selectedStarterSandboxDependencySummary}
                  </div>
                ) : null}
              </div>

              <Button 
                type="primary" 
                size="large" 
                block 
                disabled={Boolean(selectedStarterMissingToolBlockingSurface)}
                onClick={handleCreateWorkflow}
                loading={isCreating}
                style={{ height: 44, borderRadius: 8, background: '#1C64F2' }}
              >
                创建并进入编排
              </Button>
              
              {message && (
                <div style={{ 
                  marginTop: 16, 
                  padding: 12, 
                  borderRadius: 8, 
                  background: messageTone === 'error' ? '#FEF2F2' : '#F0FDF4',
                  color: messageTone === 'error' ? '#DC2626' : '#16A34A',
                  fontSize: 13
                }}>
                  {message}
                </div>
              )}
            </div>

            {selectedStarterMissingToolBlockingSurface ? (
              <div style={{ background: '#FEF2F2', borderRadius: 12, border: '1px solid #FECACA', padding: 16, color: '#B42318', fontSize: 13, lineHeight: 1.7 }}>
                <strong style={{ display: 'block', marginBottom: 8 }}>catalog gap</strong>
                {selectedStarterMissingToolBlockingSurface.blockedMessage}
              </div>
            ) : null}

            {shouldRenderSelectedStarterSourceGovernance ? (
              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#667085' }}>
                    Source governance
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475467', lineHeight: 1.7 }}>
                    {surfaceCopy.sourceGovernanceDescription}
                  </p>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedStarterSourcePresenter ? (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <Tag color="blue" style={{ margin: 0 }}>
                          {selectedStarterSourcePresenter.actionStatusLabel ?? selectedStarterSourcePresenter.statusLabel}
                        </Tag>
                        {selectedStarterSourceChips.map((chip) => (
                          <Tag key={`${selectedStarter.id}-${chip}`} style={{ margin: 0 }}>
                            {chip}
                          </Tag>
                        ))}
                      </div>
                      {selectedStarterSourcePrimarySignal ? (
                        <div style={{ fontSize: 13, color: '#111827', lineHeight: 1.7 }}>
                          {selectedStarterSourcePrimarySignal}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 13, color: '#475467', lineHeight: 1.7 }}>
                        {selectedStarterSourcePresenter.followUp ?? selectedStarterSourcePresenter.summary}
                      </div>
                    </>
                  ) : null}
                  {selectedStarterNextStepSurface?.href && selectedStarterNextStepSurface.hrefLabel ? (
                    <div style={{ fontSize: 13, color: '#475467', lineHeight: 1.7 }}>
                      {surfaceCopy.sourceGovernanceFollowUpPrefix}
                      <Link href={selectedStarterNextStepSurface.href} style={{ marginLeft: 4, color: '#1D4ED8', textDecoration: 'none', fontWeight: 500 }}>
                        {selectedStarterNextStepSurface.hrefLabel}
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
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
