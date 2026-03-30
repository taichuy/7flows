import { useCallback, useMemo, useState, useTransition } from "react";

import type { PluginToolRegistryItem } from "@/lib/get-plugin-registry";
import type {
  WorkflowLibraryStarterItem,
  WorkflowNodeCatalogItem
} from "@/lib/get-workflow-library";
import {
  getWorkflowBusinessTrackCreateSurface,
  WORKFLOW_BUSINESS_TRACKS,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
import {
  pickWorkspaceStarterGovernanceQueryScope,
  type WorkspaceStarterGovernanceQueryScope
} from "@/lib/workspace-starter-governance-query";
import {
  buildWorkflowStarterTemplates,
  buildWorkflowStarterTracks,
  type WorkflowStarterTemplate,
  type WorkflowStarterTrackItem,
  WorkflowStarterTemplateId
} from "@/lib/workflow-starters";

export type WorkflowCreateMessageTone = "idle" | "success" | "error";

type UseWorkflowCreateShellStateOptions = {
  governanceQueryScope: WorkspaceStarterGovernanceQueryScope;
  nodeCatalog: WorkflowNodeCatalogItem[];
  starters: WorkflowLibraryStarterItem[];
  tools: PluginToolRegistryItem[];
  workflowsCount: number;
};

export function resolveWorkflowCreateSelectedStarter({
  fallbackStarter = null,
  selectedStarterId,
  starterTemplates
}: {
  fallbackStarter?: WorkflowStarterTemplate | null;
  selectedStarterId?: WorkflowStarterTemplateId | null;
  starterTemplates: WorkflowStarterTemplate[];
}) {
  return (
    (selectedStarterId
      ? starterTemplates.find((starter) => starter.id === selectedStarterId)
      : null) ?? fallbackStarter
  );
}

export function resolveWorkflowCreateNameAfterStarterChange({
  currentStarter,
  nextStarter,
  workflowName
}: {
  currentStarter: WorkflowStarterTemplate | null;
  nextStarter: WorkflowStarterTemplate | null;
  workflowName: string;
}) {
  if (!nextStarter) {
    return workflowName;
  }

  const normalizedName = workflowName.trim();
  if (!normalizedName) {
    return nextStarter.defaultWorkflowName;
  }

  if (currentStarter && normalizedName === currentStarter.defaultWorkflowName) {
    return nextStarter.defaultWorkflowName;
  }

  return workflowName;
}

export function useWorkflowCreateShellState({
  governanceQueryScope,
  nodeCatalog,
  starters,
  tools,
  workflowsCount
}: UseWorkflowCreateShellStateOptions) {
  const starterTemplates = useMemo(
    () => buildWorkflowStarterTemplates(starters, nodeCatalog, tools),
    [nodeCatalog, starters, tools]
  );
  const starterTracks = useMemo<WorkflowStarterTrackItem[]>(
    () => buildWorkflowStarterTracks(starterTemplates),
    [starterTemplates]
  );
  const preferredStarterId = governanceQueryScope.selectedTemplateId ?? undefined;
  const defaultStarter = useMemo(
    () =>
      resolveWorkflowCreateSelectedStarter({
        selectedStarterId: preferredStarterId,
        starterTemplates,
        fallbackStarter: starterTemplates[0] ?? null
      }),
    [preferredStarterId, starterTemplates]
  );
  const [activeTrack, setActiveTrack] = useState<WorkflowBusinessTrack>(
    governanceQueryScope.activeTrack === "all"
      ? (defaultStarter?.businessTrack ?? WORKFLOW_BUSINESS_TRACKS[0].id)
      : governanceQueryScope.activeTrack
  );
  const [governanceActiveTrack, setGovernanceActiveTrack] = useState(
    governanceQueryScope.activeTrack
  );
  const [selectedStarterId, setSelectedStarterId] =
    useState<WorkflowStarterTemplateId | null>(defaultStarter?.id ?? null);
  const [workflowName, setWorkflowName] = useState(
    defaultStarter?.defaultWorkflowName ?? ""
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkflowCreateMessageTone>("idle");
  const [isCreating, startCreateTransition] = useTransition();

  const selectedStarter = useMemo(
    () =>
      resolveWorkflowCreateSelectedStarter({
        selectedStarterId,
        starterTemplates,
        fallbackStarter: defaultStarter
      }),
    [defaultStarter, selectedStarterId, starterTemplates]
  );
  const activeTrackPresentation = useMemo(
    () => getWorkflowBusinessTrackCreateSurface(activeTrack),
    [activeTrack]
  );
  const selectedStarterTrackPresentation = useMemo(
    () => getWorkflowBusinessTrackCreateSurface(selectedStarter?.businessTrack ?? activeTrack),
    [activeTrack, selectedStarter?.businessTrack]
  );
  const visibleStarters = useMemo(
    () => starterTemplates.filter((starter) => starter.businessTrack === activeTrack),
    [activeTrack, starterTemplates]
  );
  const createSignalItems = useMemo(
    () => [
      { label: "模式", value: activeTrackPresentation.label },
      { label: "模板", value: `${visibleStarters.length} 个` },
      { label: "草稿", value: `${workflowsCount} 个` }
    ],
    [activeTrackPresentation.label, visibleStarters.length, workflowsCount]
  );
  const workspaceStarterGovernanceScope = useMemo(
    () =>
      pickWorkspaceStarterGovernanceQueryScope({
        activeTrack: governanceActiveTrack,
        sourceGovernanceKind: governanceQueryScope.sourceGovernanceKind,
        needsFollowUp: governanceQueryScope.needsFollowUp,
        searchQuery: governanceQueryScope.searchQuery,
        selectedTemplateId:
          selectedStarter?.origin === "workspace"
            ? selectedStarter.id
            : governanceQueryScope.selectedTemplateId
      }),
    [
      governanceActiveTrack,
      governanceQueryScope.needsFollowUp,
      governanceQueryScope.searchQuery,
      governanceQueryScope.selectedTemplateId,
      governanceQueryScope.sourceGovernanceKind,
      selectedStarter
    ]
  );

  const setFeedback = useCallback(
    (nextMessage: string | null, nextTone: WorkflowCreateMessageTone = "idle") => {
      setMessage(nextMessage);
      setMessageTone(nextTone);
    },
    []
  );

  const clearFeedback = useCallback(() => {
    setFeedback(null, "idle");
  }, [setFeedback]);

  const applyStarterSelection = useCallback(
    (
      nextStarterId: WorkflowStarterTemplateId,
      currentStarterId: WorkflowStarterTemplateId | null = selectedStarterId
    ) => {
      const currentStarter = resolveWorkflowCreateSelectedStarter({
        selectedStarterId: currentStarterId,
        starterTemplates,
        fallbackStarter: defaultStarter
      });
      const nextStarter = resolveWorkflowCreateSelectedStarter({
        selectedStarterId: nextStarterId,
        starterTemplates,
        fallbackStarter: defaultStarter
      });

      if (!nextStarter) {
        return;
      }

      setWorkflowName(
        resolveWorkflowCreateNameAfterStarterChange({
          currentStarter,
          nextStarter,
          workflowName
        })
      );
      setSelectedStarterId(nextStarterId);
      setActiveTrack(nextStarter.businessTrack);
      setGovernanceActiveTrack(nextStarter.businessTrack);
      clearFeedback();
    },
    [clearFeedback, defaultStarter, selectedStarterId, starterTemplates, workflowName]
  );

  const handleTrackSelect = useCallback(
    (trackId: WorkflowBusinessTrack) => {
      setActiveTrack(trackId);
      setGovernanceActiveTrack(trackId);

      const nextVisibleStarters = starterTemplates.filter(
        (starter) => starter.businessTrack === trackId
      );

      if (nextVisibleStarters.some((starter) => starter.id === selectedStarterId)) {
        clearFeedback();
        return;
      }

      if (nextVisibleStarters[0]) {
        applyStarterSelection(nextVisibleStarters[0].id);
        return;
      }

      clearFeedback();
    },
    [applyStarterSelection, clearFeedback, selectedStarterId, starterTemplates]
  );

  const runCreateTransition = useCallback(
    (task: () => Promise<void>) => {
      startCreateTransition(async () => {
        await task();
      });
    },
    [startCreateTransition]
  );

  return {
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
  };
}
