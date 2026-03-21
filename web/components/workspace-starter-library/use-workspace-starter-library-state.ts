import { useEffect, useMemo, useState, useTransition } from "react";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import {
  bulkUpdateWorkspaceStarters,
  updateWorkspaceStarterTemplate,
  type WorkspaceStarterBulkAction,
  type WorkspaceStarterBulkActionResult,
  WorkspaceStarterValidationError,
  type WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";
import {
  summarizeWorkflowDefinitionSandboxGovernance,
  type WorkflowDefinitionSandboxGovernance
} from "@/lib/workflow-definition-sandbox-governance";
import {
  summarizeWorkflowDefinitionToolGovernance,
  type WorkflowDefinitionToolGovernance
} from "@/lib/workflow-definition-tool-governance";
import { getWorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import { summarizeWorkspaceStarterSourceStatus } from "@/lib/workspace-starter-source-status";

import {
  buildWorkspaceStarterLibrarySearchParams,
  buildBulkActionMessage,
  buildFormState,
  buildUpdatePayload,
  filterWorkspaceStarterTemplates,
  getWorkspaceStarterBulkActionConfirmationMessage,
  getWorkspaceStarterBulkActionLabel,
  summarizeValidationIssues,
  type ArchiveFilter,
  type TrackFilter,
  type WorkspaceStarterFormState,
  type WorkspaceStarterLibraryViewState,
  type WorkspaceStarterMessageTone
} from "./shared";
import { useWorkspaceStarterSource } from "./use-workspace-starter-source";

const EMPTY_TEMPLATE_TOOL_GOVERNANCE: WorkflowDefinitionToolGovernance = {
  referencedToolIds: [],
  referencedTools: [],
  missingToolIds: [],
  governedToolCount: 0,
  strongIsolationToolCount: 0
};

const EMPTY_TEMPLATE_SANDBOX_GOVERNANCE: WorkflowDefinitionSandboxGovernance = {
  sandboxNodeCount: 0,
  explicitExecutionCount: 0,
  executionClasses: [],
  dependencyModes: [],
  dependencyModeCounts: {},
  builtinPackageSets: [],
  dependencyRefs: [],
  backendExtensionNodeCount: 0,
  backendExtensionKeys: [],
  nodes: []
};

export function useWorkspaceStarterLibraryState(
  initialTemplates: WorkspaceStarterTemplateItem[],
  tools: PluginToolRegistryItem[],
  initialViewState: WorkspaceStarterLibraryViewState
) {
  const resolvedInitialViewState = {
    ...initialViewState,
    selectedTemplateId: initialViewState.selectedTemplateId ?? initialTemplates[0]?.id ?? null
  } satisfies WorkspaceStarterLibraryViewState;
  const initialSelectedTemplate = resolvedInitialViewState.selectedTemplateId
    ? initialTemplates.find((template) => template.id === resolvedInitialViewState.selectedTemplateId) ??
      initialTemplates[0] ??
      null
    : initialTemplates[0] ?? null;
  const [templates, setTemplates] = useState(initialTemplates);
  const [activeTrack, setActiveTrack] = useState<TrackFilter>(resolvedInitialViewState.activeTrack);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>(
    resolvedInitialViewState.archiveFilter
  );
  const [searchQuery, setSearchQuery] = useState(resolvedInitialViewState.searchQuery);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    resolvedInitialViewState.selectedTemplateId
  );
  const [formState, setFormState] = useState<WorkspaceStarterFormState | null>(
    initialSelectedTemplate ? buildFormState(initialSelectedTemplate) : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] =
    useState<WorkspaceStarterMessageTone>("idle");
  const [isSaving, startSavingTransition] = useTransition();
  const [isMutating, startMutatingTransition] = useTransition();
  const [isBulkMutating, startBulkMutatingTransition] = useTransition();
  const [lastBulkResult, setLastBulkResult] =
    useState<WorkspaceStarterBulkActionResult | null>(null);

  const filteredTemplates = useMemo(() => {
    return filterWorkspaceStarterTemplates(templates, {
      activeTrack,
      archiveFilter,
      searchQuery
    });
  }, [activeTrack, archiveFilter, searchQuery, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const templateToolGovernanceById = useMemo(() => {
    const entries = templates.map((template) => [
      template.id,
      summarizeWorkflowDefinitionToolGovernance(template.definition, tools)
    ] as const);
    return new Map(entries);
  }, [templates, tools]);
  const selectedTemplateToolGovernance = selectedTemplate
    ? templateToolGovernanceById.get(selectedTemplate.id) ?? EMPTY_TEMPLATE_TOOL_GOVERNANCE
    : EMPTY_TEMPLATE_TOOL_GOVERNANCE;
  const selectedTemplateSandboxGovernance = useMemo(
    () =>
      selectedTemplate
        ? summarizeWorkflowDefinitionSandboxGovernance(selectedTemplate.definition)
        : EMPTY_TEMPLATE_SANDBOX_GOVERNANCE,
    [selectedTemplate]
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
  const governedTemplateCount = useMemo(
    () =>
      templates.filter(
        (template) => (templateToolGovernanceById.get(template.id)?.governedToolCount ?? 0) > 0
      ).length,
    [templateToolGovernanceById, templates]
  );
  const strongIsolationTemplateCount = useMemo(
    () =>
      templates.filter(
        (template) =>
          (templateToolGovernanceById.get(template.id)?.strongIsolationToolCount ?? 0) > 0
      ).length,
    [templateToolGovernanceById, templates]
  );
  const missingToolTemplateCount = useMemo(
    () =>
      templates.filter(
        (template) => (templateToolGovernanceById.get(template.id)?.missingToolIds.length ?? 0) > 0
      ).length,
    [templateToolGovernanceById, templates]
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
      archive: filteredTemplates
        .filter((template) => !template.archived)
        .map((template) => template.id),
      restore: filteredTemplates
        .filter((template) => template.archived)
        .map((template) => template.id),
      refresh: filteredTemplates
        .filter((template) => Boolean(template.created_from_workflow_id))
        .map((template) => template.id),
      rebase: filteredTemplates
        .filter((template) => Boolean(template.created_from_workflow_id))
        .map((template) => template.id),
      delete: filteredTemplates
        .filter((template) => template.archived)
        .map((template) => template.id)
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
    const nextSearchParams = buildWorkspaceStarterLibrarySearchParams({
      activeTrack,
      archiveFilter,
      searchQuery,
      selectedTemplateId
    });
    const nextSearch = nextSearchParams.toString();
    const currentSearch = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : window.location.search;
    if (nextSearch === currentSearch) {
      return;
    }

    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [activeTrack, archiveFilter, searchQuery, selectedTemplateId]);

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

  const focusTemplateFromBulkResult = (templateId: string) => {
    const targetTemplate = templates.find((template) => template.id === templateId);
    if (!targetTemplate) {
      return;
    }

    setSearchQuery("");
    setActiveTrack(targetTemplate.business_track);
    setArchiveFilter(targetTemplate.archived ? "archived" : "active");
    setSelectedTemplateId(targetTemplate.id);
  };

  return {
    activeTemplateCount,
    activeTrack,
    archiveFilter,
    archivedTemplateCount,
    bulkActionCandidates,
    filteredTemplates,
    formState,
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
    focusTemplateFromBulkResult,
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
  };
}
