import { useEffect, useMemo, useState, useTransition } from "react";

import { fetchConsoleApiPath } from "@/lib/console-session-client";
import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import {
  bulkUpdateWorkspaceStarters,
  getWorkspaceStarterSourceGovernanceScopeSummary,
  previewWorkspaceStarterBulkActions,
  updateWorkspaceStarterTemplate,
  type WorkspaceStarterBulkAction,
  type WorkspaceStarterBulkPreview,
  type WorkspaceStarterBulkActionResult,
  type WorkspaceStarterSourceGovernanceScopeSummary,
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

import {
  buildWorkspaceStarterBulkActionErrorMessage,
  buildWorkspaceStarterBulkActionPendingMessage,
  buildWorkspaceStarterMutationFallbackErrorMessage,
  buildWorkspaceStarterMutationNetworkErrorMessage,
  buildWorkspaceStarterMutationPendingMessage,
  buildWorkspaceStarterMutationSuccessMessage,
  getWorkspaceStarterBulkActionConfirmationMessage,
  type WorkspaceStarterMessageTone
} from "@/lib/workspace-starter-mutation-presenters";
import {
  buildWorkspaceStarterLibrarySearchParams,
  buildBulkActionMessage,
  buildFormState,
  buildUpdatePayload,
  filterWorkspaceStarterTemplates,
  summarizeValidationIssues,
  type ArchiveFilter,
  type SourceGovernanceFilter,
  type TrackFilter,
  type WorkspaceStarterFormState,
  type WorkspaceStarterLibraryViewState
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

const WORKSPACE_STARTER_BULK_MAX_TEMPLATES = 100;

export function useWorkspaceStarterLibraryState(
  initialTemplates: WorkspaceStarterTemplateItem[],
  tools: PluginToolRegistryItem[],
  initialViewState: WorkspaceStarterLibraryViewState
) {
  const resolvedInitialViewState = initialViewState satisfies WorkspaceStarterLibraryViewState;
  const initialSelectedTemplate = resolvedInitialViewState.selectedTemplateId
    ? initialTemplates.find((template) => template.id === resolvedInitialViewState.selectedTemplateId) ??
      null
    : null;
  const [templates, setTemplates] = useState(initialTemplates);
  const [bulkPreview, setBulkPreview] = useState<WorkspaceStarterBulkPreview | null>(null);
  const [bulkPreviewNotice, setBulkPreviewNotice] = useState<string | null>(null);
  const [activeTrack, setActiveTrack] = useState<TrackFilter>(resolvedInitialViewState.activeTrack);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>(
    resolvedInitialViewState.archiveFilter
  );
  const [sourceGovernanceKind, setSourceGovernanceKind] = useState<SourceGovernanceFilter>(
    resolvedInitialViewState.sourceGovernanceKind
  );
  const [needsFollowUp, setNeedsFollowUp] = useState(resolvedInitialViewState.needsFollowUp);
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
  const [isLoadingBulkPreview, setIsLoadingBulkPreview] = useState(false);
  const [sourceGovernanceScope, setSourceGovernanceScope] =
    useState<WorkspaceStarterSourceGovernanceScopeSummary | null>(null);
  const [isLoadingSourceGovernanceScope, setIsLoadingSourceGovernanceScope] =
    useState(false);

  const filteredTemplates = useMemo(() => {
    return filterWorkspaceStarterTemplates(templates, {
      activeTrack,
      archiveFilter,
      sourceGovernanceKind,
      needsFollowUp,
      searchQuery
    });
  }, [activeTrack, archiveFilter, sourceGovernanceKind, needsFollowUp, searchQuery, templates]);

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
    isRebasing,
    isRefreshing,
    reloadHistory,
    reloadSourceDiff,
    sourceDiff
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
  const sourceGovernance = selectedTemplate?.source_governance ?? null;

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSourceGovernanceScope(true);

    void getWorkspaceStarterSourceGovernanceScopeSummary({
      businessTrack: activeTrack === "all" ? undefined : activeTrack,
      search: searchQuery,
      includeArchived: archiveFilter === "all",
      archivedOnly: archiveFilter === "archived",
      sourceGovernanceKind:
        sourceGovernanceKind === "all" ? undefined : sourceGovernanceKind,
      needsFollowUp
    })
      .then((summary) => {
        if (!cancelled) {
          setSourceGovernanceScope(summary);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSourceGovernanceScope(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTrack, archiveFilter, sourceGovernanceKind, needsFollowUp, searchQuery, templates]);

  useEffect(() => {
    const templateIds = filteredTemplates.map((template) => template.id);
    if (templateIds.length === 0) {
      setBulkPreview(null);
      setBulkPreviewNotice(null);
      setIsLoadingBulkPreview(false);
      return;
    }

    if (templateIds.length > WORKSPACE_STARTER_BULK_MAX_TEMPLATES) {
      setBulkPreview(null);
      setBulkPreviewNotice(
        `当前筛选结果有 ${templateIds.length} 个 starter，超过批量治理上限 ${WORKSPACE_STARTER_BULK_MAX_TEMPLATES}，请继续收窄范围。`
      );
      setIsLoadingBulkPreview(false);
      return;
    }

    let cancelled = false;
    setIsLoadingBulkPreview(true);
    setBulkPreviewNotice(null);

    void previewWorkspaceStarterBulkActions({ templateIds })
      .then((preview) => {
        if (cancelled) {
          return;
        }

        setBulkPreview(preview);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setBulkPreview(null);
        setBulkPreviewNotice(error instanceof Error ? error.message : "批量预检失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBulkPreview(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filteredTemplates]);

  const bulkActionCandidates = useMemo(
    () => ({
      archive: bulkPreview?.previews.archive.candidate_items.map((item) => item.template_id) ?? [],
      restore: bulkPreview?.previews.restore.candidate_items.map((item) => item.template_id) ?? [],
      refresh: bulkPreview?.previews.refresh.candidate_items.map((item) => item.template_id) ?? [],
      rebase: bulkPreview?.previews.rebase.candidate_items.map((item) => item.template_id) ?? [],
      delete: bulkPreview?.previews.delete.candidate_items.map((item) => item.template_id) ?? []
    }),
    [bulkPreview]
  );

  useEffect(() => {
    if (selectedTemplateId === null) {
      return;
    }

    if (templates.some((template) => template.id === selectedTemplateId)) {
      return;
    }

    setSelectedTemplateId(templates[0]?.id ?? null);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      if (selectedTemplateId !== null) {
        setSelectedTemplateId(null);
      }
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
      sourceGovernanceKind,
      needsFollowUp,
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
  }, [activeTrack, archiveFilter, sourceGovernanceKind, needsFollowUp, searchQuery, selectedTemplateId]);

  useEffect(() => {
    setFormState(selectedTemplate ? buildFormState(selectedTemplate) : null);
  }, [selectedTemplate]);

  const handleSave = () => {
    if (!selectedTemplate || !formState) {
      return;
    }

    startSavingTransition(async () => {
      setMessage(buildWorkspaceStarterMutationPendingMessage("update"));
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
        setMessage(
          buildWorkspaceStarterMutationSuccessMessage({
            action: "update",
            templateName: body.name
          })
        );
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
            : buildWorkspaceStarterMutationNetworkErrorMessage("update")
        );
        setMessageTone("error");
      }
    });
  };

  const handleTemplateMutation = (action: "archive" | "restore" | "delete") => {
    if (!selectedTemplate) {
      return;
    }

    const shouldContinue =
      action !== "delete" ||
      window.confirm(`确认永久删除模板「${selectedTemplate.name}」吗？此操作不可撤销。`);
    if (!shouldContinue) {
      return;
    }

    startMutatingTransition(async () => {
      setMessage(buildWorkspaceStarterMutationPendingMessage(action));
      setMessageTone("idle");

      try {
        const response = await fetchConsoleApiPath(
          `/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}${
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
            setMessage(body?.detail ?? buildWorkspaceStarterMutationFallbackErrorMessage("delete"));
            setMessageTone("error");
            return;
          }

          setTemplates((current) =>
            current.filter((template) => template.id !== selectedTemplate.id)
          );
          setMessage(
            buildWorkspaceStarterMutationSuccessMessage({
              action: "delete",
              templateName: selectedTemplate.name
            })
          );
          setMessageTone("success");
          return;
        }

        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;
        if (!response.ok || !body || !("id" in body)) {
          setMessage(
            body && "detail" in body
              ? body.detail ?? buildWorkspaceStarterMutationFallbackErrorMessage(action)
              : buildWorkspaceStarterMutationFallbackErrorMessage(action)
          );
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        setMessage(
          buildWorkspaceStarterMutationSuccessMessage({
            action,
            templateName: body.name
          })
        );
        setMessageTone("success");
      } catch {
        setMessage(buildWorkspaceStarterMutationNetworkErrorMessage(action));
        setMessageTone("error");
      }
    });
  };

  const handleBulkAction = (action: WorkspaceStarterBulkAction) => {
    const templateIds = bulkActionCandidates[action];
    if (templateIds.length === 0) {
      return;
    }

    const requiresConfirmation = action === "rebase" || action === "delete";
    const shouldContinue =
      !requiresConfirmation ||
      window.confirm(getWorkspaceStarterBulkActionConfirmationMessage(action, templateIds.length));
    if (!shouldContinue) {
      return;
    }

    startBulkMutatingTransition(async () => {
      setMessage(buildWorkspaceStarterBulkActionPendingMessage(action));
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
        setMessage(
          error instanceof Error ? error.message : buildWorkspaceStarterBulkActionErrorMessage(action)
        );
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
    setSourceGovernanceKind("all");
    setNeedsFollowUp(false);
    setSelectedTemplateId(targetTemplate.id);
  };

  return {
    activeTemplateCount,
    activeTrack,
    archiveFilter,
    archivedTemplateCount,
    bulkActionCandidates,
    bulkPreview,
    bulkPreviewNotice,
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
    focusTemplateFromBulkResult,
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
  };
}
