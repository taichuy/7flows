"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";
import { buildWorkflowCreateWizardPresentation } from "@/components/workflow-create-wizard/presentation";
import { WorkflowCreateLauncherPanel } from "@/components/workflow-create-wizard/workflow-create-launcher-panel";
import { WorkflowCreatePreviewPanel } from "@/components/workflow-create-wizard/workflow-create-preview-panel";
import type { WorkflowCreateWizardProps } from "@/components/workflow-create-wizard/types";
import { useWorkflowCreateShellState } from "@/components/workflow-create-wizard/use-workflow-create-shell-state";
import {
  createWorkflow,
  WorkflowDefinitionValidationError
} from "@/lib/get-workflows";
import { buildWorkflowEditorHrefFromWorkspaceStarterViewState } from "@/lib/workspace-starter-governance-query";

import { Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

export function WorkflowCreateWizard({
  governanceQueryScope,
  legacyAuthGovernanceSnapshot = null,
  workflows,
  starters,
  nodeCatalog,
  tools
}: WorkflowCreateWizardProps) {
  const router = useRouter();
  const searchQuery = governanceQueryScope.searchQuery;
  const sourceGovernanceKind =
    governanceQueryScope.sourceGovernanceKind === "all"
      ? undefined
      : governanceQueryScope.sourceGovernanceKind;
  const needsFollowUp = governanceQueryScope.needsFollowUp;
  const {
    activeTrack,
    activeTrackPresentation,
    applyStarterSelection,
    clearFeedback,
    createSignalItems,
    handleTrackSelect,
    isCreating,
    message,
    messageTone,
    runCreateTransition,
    selectedStarter,
    starterTracks,
    selectedStarterTrackPresentation,
    setFeedback,
    setWorkflowName,
    visibleStarters,
    workflowName,
    workspaceStarterGovernanceScope
  } = useWorkflowCreateShellState({
    governanceQueryScope,
    nodeCatalog,
    starters,
    tools,
    workflowsCount: workflows.length
  });
  const {
    currentWorkflowCreateHref,
    featuredNodes,
    governanceDisclosureStatus,
    hasScopedWorkspaceStarterFilters,
    recentDrafts,
    recentWorkflowHref,
    selectedStarterFactPills,
    selectedStarterMissingToolBlockingSurface,
    selectedStarterNextStepSurface,
    selectedStarterPreviewNodes,
    selectedStarterPreviewOverflow,
    selectedStarterSandboxBadges,
    selectedStarterSandboxDependencySummary,
    selectedStarterSourceGovernancePresenter,
    shouldRenderSelectedStarterNextStep,
    shouldRenderSelectedStarterSourceGovernance,
    starterGovernanceHref,
    surfaceCopy,
    workspaceHref
  } = useMemo(
    () =>
      buildWorkflowCreateWizardPresentation({
        legacyAuthGovernanceSnapshot,
        nodeCatalog,
        selectedStarter,
        workflows,
        workspaceStarterGovernanceScope
      }),
    [
      legacyAuthGovernanceSnapshot,
      nodeCatalog,
      selectedStarter,
      workflows,
      workspaceStarterGovernanceScope
    ]
  );

  const handleCreateWorkflow = useCallback(() => {
    runCreateTransition(async () => {
      if (!selectedStarter) {
        return;
      }

      if (selectedStarterMissingToolBlockingSurface) {
        setFeedback(selectedStarterMissingToolBlockingSurface.blockedMessage, "error");
        return;
      }

      const normalizedName = workflowName.trim() || selectedStarter.defaultWorkflowName;
      setFeedback("正在创建应用草稿...", "idle");

      try {
        if (!selectedStarter.definition) {
          setFeedback("当前 starter definition 尚未加载完成，请刷新创建页后重试。", "error");
          return;
        }

        const body = await createWorkflow({
          name: normalizedName,
          definition: structuredClone(selectedStarter.definition)
        });

        setFeedback(`已创建 ${normalizedName}，正在进入 xyflow Studio...`, "success");
        router.push(
          buildWorkflowEditorHrefFromWorkspaceStarterViewState(
            body.id,
            workspaceStarterGovernanceScope
          )
        );
        router.refresh();
      } catch (error) {
        setFeedback(
          error instanceof WorkflowDefinitionValidationError
            ? error.message
            : "无法连接后端创建 workflow，请确认 API 已启动。",
          "error"
        );
      }
    });
  }, [
    router,
    runCreateTransition,
    selectedStarter,
    selectedStarterMissingToolBlockingSurface,
    setFeedback,
    workflowName,
    workspaceStarterGovernanceScope
  ]);

  const handleWorkflowNameChange = useCallback(
    (nextWorkflowName: string) => {
      clearFeedback();
      setWorkflowName(nextWorkflowName);
    },
    [clearFeedback, setWorkflowName]
  );

  if (!selectedStarter) {
    return (
      <main className="editor-shell">
        <section className="hero creation-hero">
          <div className="hero-copy">
            <p className="eyebrow">Starter scope</p>
            <h1>当前筛选范围里没有可复用的 active workspace starter</h1>
            <p className="hero-text">{surfaceCopy.emptyStateDescription}</p>
            <div className="hero-actions">
              <WorkbenchEntryLinks
                {...surfaceCopy.emptyStateLinks}
                currentHref={currentWorkflowCreateHref}
              />
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-label">当前应用类型</div>
            <div className="panel-value">{activeTrackPresentation.label}</div>
            <p className="panel-text">{activeTrackPresentation.summary}</p>
            <p className="panel-text">
              搜索：<strong>{searchQuery.trim() || "未设置"}</strong>
            </p>
            <p className="panel-text">
              来源治理：<strong>{sourceGovernanceKind ?? "全部"}</strong>
            </p>
            <p className="panel-text">
              follow-up：<strong>{needsFollowUp ? "仅关注热点" : "未启用"}</strong>
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
          <Link href={workspaceHref}>
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
            <strong>选起点后直接进入 Studio</strong>
          </div>
        </div>
        <div className="workflow-create-topbar-summary" aria-label="创建页摘要">
          <span className="workflow-create-inline-chip">{activeTrackPresentation.label}</span>
          <span className="workflow-create-inline-chip muted">{visibleStarters.length} 个 starter</span>
          {workflows.length > 0 ? (
            <span className="workflow-create-inline-chip muted">{workflows.length} 个草稿</span>
          ) : null}
        </div>
      </section>

      <section className="workflow-create-page">
        <WorkflowCreateLauncherPanel
          activeTrack={activeTrack}
          createSignalItems={createSignalItems}
          featuredNodes={featuredNodes}
          hasScopedWorkspaceStarterFilters={hasScopedWorkspaceStarterFilters}
          scopedGovernanceBackLinkLabel={surfaceCopy.scopedGovernanceBackLinkLabel}
          scopedGovernanceDescription={surfaceCopy.scopedGovernanceDescription}
          selectedStarterId={selectedStarter.id}
          starterGovernanceHref={starterGovernanceHref}
          starterTracks={starterTracks}
          visibleStarters={visibleStarters}
          onSelectStarter={applyStarterSelection}
          onSelectTrack={handleTrackSelect}
        />

        <WorkflowCreatePreviewPanel
          governanceDisclosureStatus={governanceDisclosureStatus}
          isCreating={isCreating}
          message={message}
          messageTone={messageTone}
          recentDrafts={recentDrafts}
          recentWorkflowHref={recentWorkflowHref}
          selectedStarter={selectedStarter}
          selectedStarterFactPills={selectedStarterFactPills}
          selectedStarterMissingToolBlockingSurface={selectedStarterMissingToolBlockingSurface}
          selectedStarterNextStepSurface={selectedStarterNextStepSurface}
          selectedStarterPreviewNodes={selectedStarterPreviewNodes}
          selectedStarterPreviewOverflow={selectedStarterPreviewOverflow}
          selectedStarterSandboxBadges={selectedStarterSandboxBadges}
          selectedStarterSandboxDependencySummary={selectedStarterSandboxDependencySummary}
          selectedStarterSourceGovernancePresenter={selectedStarterSourceGovernancePresenter}
          selectedStarterTrackLabel={selectedStarterTrackPresentation.label}
          shouldDisableCreate={Boolean(selectedStarterMissingToolBlockingSurface)}
          shouldRenderSelectedStarterNextStep={shouldRenderSelectedStarterNextStep}
          shouldRenderSelectedStarterSourceGovernance={shouldRenderSelectedStarterSourceGovernance}
          starterGovernanceHref={starterGovernanceHref}
          surfaceCopy={surfaceCopy}
          totalWorkflows={workflows.length}
          workflowName={workflowName}
          onCreateWorkflow={handleCreateWorkflow}
          onWorkflowNameChange={handleWorkflowNameChange}
        />
      </section>
    </main>
  );
}
