"use client";

import { WorkspaceStarterDefinitionSnapshotPanel } from "@/components/workspace-starter-library/definition-snapshot-panel";
import { WorkspaceStarterHeroSection } from "@/components/workspace-starter-library/hero-section";
import { WorkspaceStarterHistoryPanel } from "@/components/workspace-starter-library/history-panel";
import { WorkspaceStarterMetadataPanel } from "@/components/workspace-starter-library/starter-metadata-panel";
import { WorkspaceStarterSourceDiffPanel } from "@/components/workspace-starter-library/source-diff-panel";
import { WorkspaceStarterTemplateListPanel } from "@/components/workspace-starter-library/template-list-panel";
import { useWorkspaceStarterLibraryState } from "@/components/workspace-starter-library/use-workspace-starter-library-state";
import {
  buildWorkspaceStarterEmptyStateFollowUp,
  buildWorkspaceStarterSourceGovernancePrimaryFollowUp,
  buildWorkflowCreateHrefFromWorkspaceStarterViewState,
  type WorkspaceStarterLibraryViewState
} from "@/components/workspace-starter-library/shared";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import { pickWorkspaceStarterGovernanceQueryScope } from "@/lib/workspace-starter-governance-query";

type WorkspaceStarterLibraryProps = {
  initialTemplates: WorkspaceStarterTemplateItem[];
  initialViewState: WorkspaceStarterLibraryViewState;
  tools: PluginToolRegistryItem[];
};

export function WorkspaceStarterLibrary({
  initialTemplates,
  initialViewState,
  tools
}: WorkspaceStarterLibraryProps) {
  const {
    activeTemplateCount,
    activeTrack,
    archiveFilter,
    archivedTemplateCount,
    bulkPreview,
    bulkPreviewNotice,
    filteredTemplates,
    formState,
    focusTemplateFromBulkResult,
    governedTemplateCount,
    handleBulkAction,
    handleRebaseFromSource,
    handleRefreshFromSource,
    handleSave,
    handleTemplateMutation,
    hasPendingChanges,
    historyItems,
    isBulkMutating,
    isLoadingBulkPreview,
    isLoadingSourceGovernanceScope,
    isLoadingHistory,
    isLoadingSourceDiff,
    isMutating,
    isRebasing,
    isRefreshing,
    isSaving,
    lastBulkResult,
    message,
    messageTone,
    missingToolTemplateCount,
    needsFollowUp,
    searchQuery,
    selectedTemplate,
    selectedTemplateId,
    sourceGovernanceKind,
    sourceGovernanceScope,
    selectedTemplateSandboxGovernance,
    selectedTemplateToolGovernance,
    selectedTrackMeta,
    setActiveTrack,
    setArchiveFilter,
    setFormState,
    setNeedsFollowUp,
    setSearchQuery,
    setSelectedTemplateId,
    setSourceGovernanceKind,
    sourceDiff,
    sourceGovernance,
    strongIsolationTemplateCount,
    templateToolGovernanceById,
    templates
  } = useWorkspaceStarterLibraryState(initialTemplates, tools, initialViewState);

  const createWorkflowHref = buildWorkflowCreateHrefFromWorkspaceStarterViewState({
    activeTrack,
    sourceGovernanceKind,
    needsFollowUp,
    searchQuery,
    selectedTemplateId: selectedTemplate?.archived ? null : selectedTemplateId
  });
  const workspaceStarterGovernanceQueryScope = pickWorkspaceStarterGovernanceQueryScope({
    activeTrack,
    sourceGovernanceKind,
    needsFollowUp,
    searchQuery,
    selectedTemplateId
  });
  const sourceGovernancePrimaryFollowUp = buildWorkspaceStarterSourceGovernancePrimaryFollowUp({
    sourceGovernanceScope,
    templates,
    createWorkflowHref,
    workspaceStarterGovernanceQueryScope
  });
  const emptyStateFollowUp = buildWorkspaceStarterEmptyStateFollowUp({
    sourceGovernancePrimaryFollowUp,
    createWorkflowHref
  });

  return (
    <main className="editor-shell">
      <WorkspaceStarterHeroSection
        activeTemplateCount={activeTemplateCount}
        archivedTemplateCount={archivedTemplateCount}
        filteredTemplateCount={filteredTemplates.length}
        governedTemplateCount={governedTemplateCount}
        missingToolTemplateCount={missingToolTemplateCount}
        selectedTemplateName={selectedTemplate?.name ?? null}
        strongIsolationTemplateCount={strongIsolationTemplateCount}
        activeTrack={activeTrack}
        createWorkflowHref={createWorkflowHref}
      />

      <section className="governance-layout">
        <WorkspaceStarterTemplateListPanel
          templates={templates}
          filteredTemplates={filteredTemplates}
          selectedTemplateId={selectedTemplateId}
          activeTrack={activeTrack}
          archiveFilter={archiveFilter}
          sourceGovernanceKind={sourceGovernanceKind}
          needsFollowUp={needsFollowUp}
          searchQuery={searchQuery}
          createWorkflowHref={createWorkflowHref}
          activeTemplateCount={activeTemplateCount}
          archivedTemplateCount={archivedTemplateCount}
          templateToolGovernanceById={templateToolGovernanceById}
          bulkPreview={bulkPreview}
          bulkPreviewNotice={bulkPreviewNotice}
          isBulkMutating={isBulkMutating}
          isLoadingBulkPreview={isLoadingBulkPreview}
          isLoadingSourceGovernanceScope={isLoadingSourceGovernanceScope}
          lastBulkResult={lastBulkResult}
          emptyStateFollowUp={emptyStateFollowUp}
          sourceGovernancePrimaryFollowUp={sourceGovernancePrimaryFollowUp}
          sourceGovernanceScope={sourceGovernanceScope}
          onTrackChange={setActiveTrack}
          onArchiveFilterChange={setArchiveFilter}
          onSourceGovernanceKindChange={setSourceGovernanceKind}
          onNeedsFollowUpChange={setNeedsFollowUp}
          onSearchQueryChange={setSearchQuery}
          onSelectTemplate={setSelectedTemplateId}
          onFocusTemplate={focusTemplateFromBulkResult}
          onBulkAction={handleBulkAction}
        />

        <div className="governance-sidebar">
          <WorkspaceStarterMetadataPanel
            selectedTemplate={selectedTemplate}
            selectedTemplateToolGovernance={selectedTemplateToolGovernance}
            formState={formState}
            selectedTrackPriority={selectedTrackMeta?.priority ?? null}
            hasPendingChanges={hasPendingChanges}
            isSaving={isSaving}
            isMutating={isMutating}
            message={message}
            messageTone={messageTone}
            createWorkflowHref={selectedTemplate?.archived ? null : createWorkflowHref}
            emptyStateFollowUp={emptyStateFollowUp}
            workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
            setFormState={setFormState}
            onSave={handleSave}
            onTemplateMutation={handleTemplateMutation}
          />

          <WorkspaceStarterDefinitionSnapshotPanel
            selectedTemplate={selectedTemplate}
            selectedTemplateSandboxGovernance={selectedTemplateSandboxGovernance}
            selectedTemplateToolGovernance={selectedTemplateToolGovernance}
            sourceGovernance={sourceGovernance}
            sourceDiff={sourceDiff}
            isLoadingSourceDiff={isLoadingSourceDiff}
            isRefreshing={isRefreshing}
            isRebasing={isRebasing}
            createWorkflowHref={selectedTemplate?.archived ? null : createWorkflowHref}
            workspaceStarterGovernanceQueryScope={workspaceStarterGovernanceQueryScope}
            emptyStateFollowUp={emptyStateFollowUp}
            onRefresh={handleRefreshFromSource}
            onRebase={handleRebaseFromSource}
          />

          <WorkspaceStarterHistoryPanel
            selectedTemplate={selectedTemplate}
            historyItems={historyItems}
            isLoading={isLoadingHistory}
            createWorkflowHref={selectedTemplate?.archived ? null : createWorkflowHref}
            emptyStateFollowUp={emptyStateFollowUp}
          />
          <WorkspaceStarterSourceDiffPanel
            selectedTemplate={selectedTemplate}
            sourceDiff={sourceDiff}
            isLoading={isLoadingSourceDiff}
            isRebasing={isRebasing}
            createWorkflowHref={selectedTemplate?.archived ? null : createWorkflowHref}
            emptyStateFollowUp={emptyStateFollowUp}
            onRebase={handleRebaseFromSource}
          />
        </div>
      </section>
    </main>
  );
}
