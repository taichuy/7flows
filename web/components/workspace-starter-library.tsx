"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  bulkUpdateWorkspaceStarters,
  updateWorkspaceStarterTemplate,
  type WorkspaceStarterBulkAction,
  type WorkspaceStarterBulkActionResult,
  type WorkspaceStarterValidationIssue,
  WorkspaceStarterValidationError,
  type WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";
import {
  getWorkflowBusinessTrack,
} from "@/lib/workflow-business-tracks";
import { summarizeWorkspaceStarterSourceStatus } from "@/lib/workspace-starter-source-status";
import {
  getWorkspaceStarterBulkActionConfirmationMessage,
  getWorkspaceStarterBulkActionLabel,
} from "@/components/workspace-starter-library/bulk-governance-card";
import { WorkspaceStarterDefinitionSnapshotPanel } from "@/components/workspace-starter-library/definition-snapshot-panel";
import { WorkspaceStarterHeroSection } from "@/components/workspace-starter-library/hero-section";
import { WorkspaceStarterHistoryPanel } from "@/components/workspace-starter-library/history-panel";
import { WorkspaceStarterMetadataPanel } from "@/components/workspace-starter-library/starter-metadata-panel";
import { WorkspaceStarterSourceDiffPanel } from "@/components/workspace-starter-library/source-diff-panel";
import { WorkspaceStarterTemplateListPanel } from "@/components/workspace-starter-library/template-list-panel";
import {
  buildBulkActionMessage,
  buildFormState,
  buildUpdatePayload,
  type ArchiveFilter,
  type TrackFilter,
  type WorkspaceStarterFormState,
  type WorkspaceStarterMessageTone
} from "@/components/workspace-starter-library/shared";
import { useWorkspaceStarterSource } from "@/components/workspace-starter-library/use-workspace-starter-source";

type WorkspaceStarterLibraryProps = {
  initialTemplates: WorkspaceStarterTemplateItem[];
};

export function WorkspaceStarterLibrary({
  initialTemplates
}: WorkspaceStarterLibraryProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [activeTrack, setActiveTrack] = useState<TrackFilter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  );
  const [formState, setFormState] = useState<WorkspaceStarterFormState | null>(
    initialTemplates[0] ? buildFormState(initialTemplates[0]) : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkspaceStarterMessageTone>("idle");
  const [isSaving, startSavingTransition] = useTransition();
  const [isMutating, startMutatingTransition] = useTransition();
  const [isBulkMutating, startBulkMutatingTransition] = useTransition();
  const [lastBulkResult, setLastBulkResult] = useState<WorkspaceStarterBulkActionResult | null>(
    null
  );

  const summarizeValidationIssues = (issues: WorkspaceStarterValidationIssue[]) => {
    if (issues.length === 0) {
      return null;
    }

    const categoryLabels: Record<string, string> = {
      schema: "结构",
      node_support: "节点支持",
      tool_reference: "工具引用",
      tool_execution: "执行能力",
      publish_version: "发布版本"
    };
    return Object.entries(
      issues.reduce<Record<string, number>>((summary, issue) => {
        const category = issue.category || "unknown";
        summary[category] = (summary[category] ?? 0) + 1;
        return summary;
      }, {})
    )
      .map(([category, count]) => {
        const sample = issues
          .filter((issue) => issue.category === category)
          .slice(0, 2)
          .map((issue) => issue.path ?? issue.field ?? issue.message)
          .join("、");
        const prefix = `${categoryLabels[category] ?? category} ${count} 项`;
        return sample ? `${prefix}（${sample}）` : prefix;
      })
      .join("；");
  };

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      if (archiveFilter === "active" && template.archived) {
        return false;
      }
      if (archiveFilter === "archived" && !template.archived) {
        return false;
      }
      if (activeTrack !== "all" && template.business_track !== activeTrack) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        template.name,
        template.description,
        template.default_workflow_name,
        template.workflow_focus,
        template.recommended_next_step,
        template.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [activeTrack, archiveFilter, searchQuery, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const {
    clearSelectionArtifacts,
    clearSourceDiff,
    handleRebaseFromSource,
    handleRefreshFromSource,
    historyItems,
    isLoadingHistory,
    isLoadingSourceDiff,
    isLoadingSourceWorkflow,
    isRebasing,
    isRefreshing,
    reloadHistory,
    reloadSourceDiff,
    sourceDiff,
    sourceStatusMessage,
    sourceWorkflow
  } = useWorkspaceStarterSource({
    selectedTemplate,
    setMessage,
    setMessageTone,
    setSelectedTemplateId,
    setTemplates
  });
  const selectedTrackMeta = selectedTemplate
    ? getWorkflowBusinessTrack(selectedTemplate.business_track)
    : null;
  const activeTemplateCount = useMemo(
    () => templates.filter((template) => !template.archived).length,
    [templates]
  );
  const archivedTemplateCount = useMemo(
    () => templates.filter((template) => template.archived).length,
    [templates]
  );
  const hasPendingChanges =
    selectedTemplate !== null &&
    formState !== null &&
    JSON.stringify(buildUpdatePayload(formState)) ===
      JSON.stringify(buildUpdatePayload(buildFormState(selectedTemplate)))
      ? false
      : Boolean(selectedTemplate && formState);
  const sourceStatus = useMemo(
    () =>
      selectedTemplate
        ? summarizeWorkspaceStarterSourceStatus(selectedTemplate, sourceWorkflow)
        : null,
    [selectedTemplate, sourceWorkflow]
  );
  const bulkActionCandidates = useMemo(
    () => ({
      archive: filteredTemplates.filter((template) => !template.archived).map((template) => template.id),
      restore: filteredTemplates.filter((template) => template.archived).map((template) => template.id),
      refresh: filteredTemplates
        .filter((template) => Boolean(template.created_from_workflow_id))
        .map((template) => template.id),
      rebase: filteredTemplates
        .filter((template) => Boolean(template.created_from_workflow_id))
        .map((template) => template.id),
      delete: filteredTemplates.filter((template) => template.archived).map((template) => template.id)
    }),
    [filteredTemplates]
  );

  useEffect(() => {
    if (selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)) {
      return;
    }

    setSelectedTemplateId(templates[0]?.id ?? null);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      return;
    }

    if (
      selectedTemplateId &&
      filteredTemplates.some((template) => template.id === selectedTemplateId)
    ) {
      return;
    }

    setSelectedTemplateId(filteredTemplates[0].id);
  }, [filteredTemplates, selectedTemplateId]);

  useEffect(() => {
    setFormState(selectedTemplate ? buildFormState(selectedTemplate) : null);
  }, [selectedTemplate]);

  const handleSave = () => {
    if (!selectedTemplate || !formState) {
      return;
    }

    startSavingTransition(async () => {
      setMessage("正在更新 workspace starter...");
      setMessageTone("idle");

      try {
        const body = await updateWorkspaceStarterTemplate(
          selectedTemplate.id,
          buildUpdatePayload(formState)
        );

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        setMessage(`已更新 workspace starter：${body.name}。`);
        setMessageTone("success");
      } catch (error) {
        const validationSummary =
          error instanceof WorkspaceStarterValidationError
            ? summarizeValidationIssues(error.issues)
            : null;
        setMessage(
          error instanceof WorkspaceStarterValidationError
            ? validationSummary
              ? `${error.message}（${validationSummary}）`
              : error.message
            : "无法连接后端更新 workspace starter，请确认 API 已启动。"
        );
        setMessageTone("error");
      }
    });
  };

  const handleTemplateMutation = (action: "archive" | "restore" | "delete") => {
    if (!selectedTemplate) {
      return;
    }

    const actionLabel = {
      archive: "归档",
      restore: "恢复",
      delete: "永久删除"
    }[action];
    const shouldContinue =
      action !== "delete" ||
      window.confirm(`确认永久删除模板「${selectedTemplate.name}」吗？此操作不可撤销。`);
    if (!shouldContinue) {
      return;
    }

    startMutatingTransition(async () => {
      setMessage(`正在${actionLabel} workspace starter...`);
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}${
            action === "delete" ? "" : `/${action}`
          }`,
          {
            method: action === "delete" ? "DELETE" : "POST"
          }
        );
        if (action === "delete") {
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as
              | { detail?: string }
              | null;
            setMessage(body?.detail ?? "删除失败。");
            setMessageTone("error");
            return;
          }

          setTemplates((current) =>
            current.filter((template) => template.id !== selectedTemplate.id)
          );
          setMessage(`已永久删除 workspace starter：${selectedTemplate.name}。`);
          setMessageTone("success");
          return;
        }

        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;
        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? `${actionLabel}失败。` : `${actionLabel}失败。`);
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        setMessage(`已${actionLabel} workspace starter：${body.name}。`);
        setMessageTone("success");
      } catch {
        setMessage(`无法连接后端${actionLabel} workspace starter，请确认 API 已启动。`);
        setMessageTone("error");
      }
    });
  };

  const handleBulkAction = (action: WorkspaceStarterBulkAction) => {
    const templateIds = bulkActionCandidates[action];
    if (templateIds.length === 0) {
      return;
    }

    const actionLabel = getWorkspaceStarterBulkActionLabel(action);
    const requiresConfirmation = action === "rebase" || action === "delete";
    const shouldContinue =
      !requiresConfirmation ||
      window.confirm(getWorkspaceStarterBulkActionConfirmationMessage(action, templateIds.length));
    if (!shouldContinue) {
      return;
    }

    startBulkMutatingTransition(async () => {
      setMessage(`正在对当前筛选结果批量${actionLabel}...`);
      setMessageTone("idle");

      try {
        const result = await bulkUpdateWorkspaceStarters({
          action,
          templateIds
        });
        const deletedTemplateIds = new Set(
          result.deleted_items.map((item) => item.template_id)
        );
        const updatedTemplateMap = new Map(
          result.updated_items.map((item) => [item.id, item] as const)
        );
        setTemplates((current) =>
          current
            .filter((template) => !deletedTemplateIds.has(template.id))
            .map((template) => updatedTemplateMap.get(template.id) ?? template)
        );
        setLastBulkResult(result);

        const updatedSelected = selectedTemplateId
          ? result.updated_items.find((item) => item.id === selectedTemplateId) ?? null
          : null;
        const selectedWasDeleted =
          selectedTemplateId !== null && deletedTemplateIds.has(selectedTemplateId);
        if (selectedWasDeleted) {
          clearSelectionArtifacts();
        } else if (updatedSelected) {
          await reloadHistory(updatedSelected.id);
          if (updatedSelected.created_from_workflow_id) {
            await reloadSourceDiff(updatedSelected.id);
          } else {
            clearSourceDiff();
          }
        }

        setMessage(buildBulkActionMessage(result));
        setMessageTone(result.updated_count > 0 ? "success" : "idle");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `批量${actionLabel}失败。`);
        setMessageTone("error");
      }
    });
  };

  return (
    <main className="editor-shell">
      <WorkspaceStarterHeroSection
        activeTemplateCount={activeTemplateCount}
        archivedTemplateCount={archivedTemplateCount}
        filteredTemplateCount={filteredTemplates.length}
        selectedTemplateName={selectedTemplate?.name ?? null}
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
