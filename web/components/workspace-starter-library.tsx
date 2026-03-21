"use client";

import { WorkspaceStarterDefinitionSnapshotPanel } from "@/components/workspace-starter-library/definition-snapshot-panel";
import { WorkspaceStarterHeroSection } from "@/components/workspace-starter-library/hero-section";
import { WorkspaceStarterHistoryPanel } from "@/components/workspace-starter-library/history-panel";
import { WorkspaceStarterMetadataPanel } from "@/components/workspace-starter-library/starter-metadata-panel";
import { WorkspaceStarterSourceDiffPanel } from "@/components/workspace-starter-library/source-diff-panel";
import { WorkspaceStarterTemplateListPanel } from "@/components/workspace-starter-library/template-list-panel";
import { useWorkspaceStarterLibraryState } from "@/components/workspace-starter-library/use-workspace-starter-library-state";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";

type WorkspaceStarterLibraryProps = {
  initialTemplates: WorkspaceStarterTemplateItem[];
  tools: PluginToolRegistryItem[];
};

export function WorkspaceStarterLibrary({
  initialTemplates,
  tools
}: WorkspaceStarterLibraryProps) {
  const {
    activeTemplateCount,
    activeTrack,
    archiveFilter,
    archivedTemplateCount,
    bulkActionCandidates,
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
    isLoadingHistory,
    isLoadingSourceDiff,
    isLoadingSourceWorkflow,
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
    selectedTemplateSandboxGovernance,
    selectedTemplateToolGovernance,
    selectedTrackMeta,
    setActiveTrack,
    setArchiveFilter,
    setFormState,
    setSearchQuery,
    setSelectedTemplateId,
    sourceDiff,
    sourceStatus,
    sourceStatusMessage,
    strongIsolationTemplateCount,
    templateToolGovernanceById,
    templates
  } = useWorkspaceStarterLibraryState(initialTemplates, tools);

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
          bulkCandidateCounts={{
            archive: bulkActionCandidates.archive.length,
            restore: bulkActionCandidates.restore.length,
            refresh: bulkActionCandidates.refresh.length,
            rebase: bulkActionCandidates.rebase.length,
            delete: bulkActionCandidates.delete.length
          }}
          isBulkMutating={isBulkMutating}
          lastBulkResult={lastBulkResult}
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
            sourceStatus={sourceStatus}
            sourceStatusMessage={sourceStatusMessage}
            isLoadingSourceWorkflow={isLoadingSourceWorkflow}
            isRefreshing={isRefreshing}
            onRefresh={handleRefreshFromSource}
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
