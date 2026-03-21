"use client";

import { WorkspaceStarterDefinitionSnapshotPanel } from "@/components/workspace-starter-library/definition-snapshot-panel";
import { WorkspaceStarterHeroSection } from "@/components/workspace-starter-library/hero-section";
import { WorkspaceStarterHistoryPanel } from "@/components/workspace-starter-library/history-panel";
import { WorkspaceStarterMetadataPanel } from "@/components/workspace-starter-library/starter-metadata-panel";
import { WorkspaceStarterSourceDiffPanel } from "@/components/workspace-starter-library/source-diff-panel";
import { WorkspaceStarterTemplateListPanel } from "@/components/workspace-starter-library/template-list-panel";
import { useWorkspaceStarterLibraryState } from "@/components/workspace-starter-library/use-workspace-starter-library-state";
import type { WorkspaceStarterLibraryViewState } from "@/components/workspace-starter-library/shared";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";

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
    searchQuery,
    selectedTemplate,
    selectedTemplateId,
    sourceGovernanceScope,
    selectedTemplateSandboxGovernance,
    selectedTemplateToolGovernance,
    selectedTrackMeta,
    setActiveTrack,
    setArchiveFilter,
    setFormState,
    setSearchQuery,
    setSelectedTemplateId,
    sourceDiff,
    sourceGovernance,
    strongIsolationTemplateCount,
    templateToolGovernanceById,
    templates
  } = useWorkspaceStarterLibraryState(initialTemplates, tools, initialViewState);

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
      />

      <section className="governance-layout">
        <WorkspaceStarterTemplateListPanel
          templates={templates}
          filteredTemplates={filteredTemplates}
          selectedTemplateId={selectedTemplateId}
          activeTrack={activeTrack}
          archiveFilter={archiveFilter}
          searchQuery={searchQuery}
          activeTemplateCount={activeTemplateCount}
          archivedTemplateCount={archivedTemplateCount}
          templateToolGovernanceById={templateToolGovernanceById}
          bulkPreview={bulkPreview}
          bulkPreviewNotice={bulkPreviewNotice}
          isBulkMutating={isBulkMutating}
          isLoadingBulkPreview={isLoadingBulkPreview}
          isLoadingSourceGovernanceScope={isLoadingSourceGovernanceScope}
          lastBulkResult={lastBulkResult}
          sourceGovernanceScope={sourceGovernanceScope}
          onTrackChange={setActiveTrack}
          onArchiveFilterChange={setArchiveFilter}
          onSearchQueryChange={setSearchQuery}
          onSelectTemplate={setSelectedTemplateId}
          onFocusTemplate={focusTemplateFromBulkResult}
          onBulkAction={handleBulkAction}
        />

        <div className="governance-sidebar">
          <WorkspaceStarterMetadataPanel
            selectedTemplate={selectedTemplate}
            formState={formState}
            selectedTrackPriority={selectedTrackMeta?.priority ?? null}
            hasPendingChanges={hasPendingChanges}
            isSaving={isSaving}
            isMutating={isMutating}
            message={message}
            messageTone={messageTone}
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
            onRefresh={handleRefreshFromSource}
            onRebase={handleRebaseFromSource}
          />

          <WorkspaceStarterHistoryPanel
            historyItems={historyItems}
            isLoading={isLoadingHistory}
          />
          <WorkspaceStarterSourceDiffPanel
            sourceDiff={sourceDiff}
            isLoading={isLoadingSourceDiff}
            isRebasing={isRebasing}
            onRebase={handleRebaseFromSource}
          />
        </div>
      </section>
    </main>
  );
}
