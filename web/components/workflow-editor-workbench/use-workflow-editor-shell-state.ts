"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { WorkflowDefinitionPreflightIssue } from "@/lib/get-workflows";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

import type { WorkflowEditorMessageKind, WorkflowEditorMessageTone } from "./shared";

const SIDEBAR_PREFERENCE_STORAGE_KEY = "sevenflows.editor.sidebarCollapsed";
const INSPECTOR_PREFERENCE_STORAGE_KEY = "sevenflows.editor.inspectorCollapsed";

export function resolveWorkflowEditorPanelCollapsedPreference(
  storedValue: string | null
) {
  return storedValue !== "false";
}

export type WorkflowEditorInspectorFocusState = {
  highlightedNodeSection: "config" | "contract" | "runtime" | null;
  highlightedNodeFieldPath: string | null;
  highlightedPublishEndpointIndex: number | null;
  highlightedPublishEndpointFieldPath: string | null;
  highlightedVariableIndex: number | null;
  highlightedVariableFieldPath: string | null;
};

type UseWorkflowEditorShellStateOptions = {
  persistedDefinitionSignature: string;
  initialServerValidationIssues?: WorkflowDefinitionPreflightIssue[] | null;
};

export function resolveWorkflowEditorInspectorFocusState(
  validationFocusItem: WorkflowValidationNavigatorItem | null,
  selectedNodeId: string | null
): WorkflowEditorInspectorFocusState {
  if (!validationFocusItem) {
    return {
      highlightedNodeSection: null,
      highlightedNodeFieldPath: null,
      highlightedPublishEndpointIndex: null,
      highlightedPublishEndpointFieldPath: null,
      highlightedVariableIndex: null,
      highlightedVariableFieldPath: null
    };
  }

  return {
    highlightedNodeSection:
      validationFocusItem.target.scope === "node" &&
      validationFocusItem.target.nodeId === selectedNodeId
        ? validationFocusItem.target.section
        : null,
    highlightedNodeFieldPath:
      validationFocusItem.target.scope === "node" &&
      validationFocusItem.target.nodeId === selectedNodeId
        ? validationFocusItem.target.fieldPath ?? null
        : null,
    highlightedPublishEndpointIndex:
      validationFocusItem.target.scope === "publish"
        ? validationFocusItem.target.endpointIndex
        : null,
    highlightedPublishEndpointFieldPath:
      validationFocusItem.target.scope === "publish"
        ? validationFocusItem.target.fieldPath ?? null
        : null,
    highlightedVariableIndex:
      validationFocusItem.target.scope === "variables"
        ? validationFocusItem.target.variableIndex
        : null,
    highlightedVariableFieldPath:
      validationFocusItem.target.scope === "variables"
        ? validationFocusItem.target.fieldPath ?? null
        : null
  };
}

export function useWorkflowEditorShellState({
  persistedDefinitionSignature,
  initialServerValidationIssues = []
}: UseWorkflowEditorShellStateOptions) {
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkflowEditorMessageTone>("idle");
  const [messageKind, setMessageKind] = useState<WorkflowEditorMessageKind>("default");
  const [savedWorkspaceStarter, setSavedWorkspaceStarter] =
    useState<WorkspaceStarterTemplateItem | null>(null);
  const [serverValidationIssues, setServerValidationIssues] = useState<
    WorkflowDefinitionPreflightIssue[]
  >(initialServerValidationIssues ?? []);
  const [serverValidationIssueSourceSignature, setServerValidationIssueSourceSignature] =
    useState<string>(persistedDefinitionSignature);
  const [validationFocusItem, setValidationFocusItem] =
    useState<WorkflowValidationNavigatorItem | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(true);
  const [assistantRequestSerial, setAssistantRequestSerial] = useState(0);
  const [hasLoadedPanelPreferences, setHasLoadedPanelPreferences] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sidebarPreference = window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY);
    const inspectorPreference = window.localStorage.getItem(INSPECTOR_PREFERENCE_STORAGE_KEY);

    // Default to collapsed if no preference is set, to reduce default noise
    setIsSidebarCollapsed(
      resolveWorkflowEditorPanelCollapsedPreference(sidebarPreference)
    );
    setIsInspectorCollapsed(
      resolveWorkflowEditorPanelCollapsedPreference(inspectorPreference)
    );

    setHasLoadedPanelPreferences(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedPanelPreferences || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_PREFERENCE_STORAGE_KEY,
      String(isSidebarCollapsed)
    );
    window.localStorage.setItem(
      INSPECTOR_PREFERENCE_STORAGE_KEY,
      String(isInspectorCollapsed)
    );
  }, [hasLoadedPanelPreferences, isInspectorCollapsed, isSidebarCollapsed]);

  useEffect(() => {
    if (messageKind !== "workspace_starter_saved") {
      return;
    }

    if (messageTone === "success" && message?.startsWith("已保存 workspace starter：")) {
      return;
    }

    setSavedWorkspaceStarter(null);
    setMessageKind("default");
  }, [message, messageKind, messageTone]);

  useEffect(() => {
    setServerValidationIssues(initialServerValidationIssues ?? []);
    setServerValidationIssueSourceSignature(persistedDefinitionSignature);
  }, [initialServerValidationIssues, persistedDefinitionSignature]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((current) => !current);
  }, []);

  const toggleInspector = useCallback(() => {
    setIsInspectorCollapsed((current) => !current);
  }, []);

  const openNodeAssistant = useCallback(() => {
    setIsSidebarCollapsed(true);
    setIsInspectorCollapsed(false);
    setAssistantRequestSerial((current) => current + 1);
  }, []);

  const getInspectorFocusState = useCallback(
    (selectedNodeId: string | null) =>
      resolveWorkflowEditorInspectorFocusState(validationFocusItem, selectedNodeId),
    [validationFocusItem]
  );

  return {
    message,
    setMessage,
    messageTone,
    setMessageTone,
    messageKind,
    setMessageKind,
    savedWorkspaceStarter,
    setSavedWorkspaceStarter,
    serverValidationIssues,
    setServerValidationIssues,
    setServerValidationIssueSourceSignature,
    validationFocusItem,
    setValidationFocusItem,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    isInspectorCollapsed,
    setIsInspectorCollapsed,
    assistantRequestSerial,
    toggleSidebar,
    toggleInspector,
    openNodeAssistant,
    getInspectorFocusState
  };
}

export type WorkflowEditorShellState = ReturnType<typeof useWorkflowEditorShellState>;

export type WorkflowEditorMessageDispatch = {
  setMessage: Dispatch<SetStateAction<string | null>>;
  setMessageTone: Dispatch<SetStateAction<WorkflowEditorMessageTone>>;
};
