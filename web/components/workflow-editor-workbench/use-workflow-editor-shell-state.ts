"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

import type { WorkflowDefinitionPreflightIssue } from "@/lib/get-workflows";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

import type { WorkflowEditorMessageKind, WorkflowEditorMessageTone } from "./shared";

const SIDEBAR_PREFERENCE_STORAGE_KEY = "sevenflows.editor.sidebarCollapsed";
const INSPECTOR_PREFERENCE_STORAGE_KEY = "sevenflows.editor.inspectorCollapsed";
const PANEL_PREFERENCE_VERSION_STORAGE_KEY = "sevenflows.editor.panelPreferenceVersion";
const PANEL_PREFERENCE_VERSION = "phase49-fixed-rails-default";
const DEFAULT_PANEL_COLLAPSED = false;
const EMPTY_SERVER_VALIDATION_ISSUES: WorkflowDefinitionPreflightIssue[] = [];

export function resolveWorkflowEditorPanelCollapsedPreference(
  storedValue: string | null,
  storedVersion: string | null = PANEL_PREFERENCE_VERSION
) {
  if (storedVersion !== PANEL_PREFERENCE_VERSION) {
    return DEFAULT_PANEL_COLLAPSED;
  }

  if (storedValue === null) {
    return DEFAULT_PANEL_COLLAPSED;
  }

  return storedValue === "true";
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

export function areWorkflowDefinitionPreflightIssuesEqual(
  left: WorkflowDefinitionPreflightIssue[] | null | undefined,
  right: WorkflowDefinitionPreflightIssue[] | null | undefined
) {
  if (left === right) {
    return true;
  }

  if (!left?.length && !right?.length) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((issue, index) => {
    const other = right[index];
    return (
      issue.category === other?.category &&
      issue.message === other?.message &&
      issue.path === other?.path &&
      issue.field === other?.field
    );
  });
}

export function useWorkflowEditorShellState({
  persistedDefinitionSignature,
  initialServerValidationIssues = EMPTY_SERVER_VALIDATION_ISSUES
}: UseWorkflowEditorShellStateOptions) {
  const normalizedInitialServerValidationIssues =
    initialServerValidationIssues ?? EMPTY_SERVER_VALIDATION_ISSUES;
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<WorkflowEditorMessageTone>("idle");
  const [messageKind, setMessageKind] = useState<WorkflowEditorMessageKind>("default");
  const [savedWorkspaceStarter, setSavedWorkspaceStarter] =
    useState<WorkspaceStarterTemplateItem | null>(null);
  const [serverValidationIssues, setServerValidationIssues] = useState<
    WorkflowDefinitionPreflightIssue[]
  >(normalizedInitialServerValidationIssues);
  const [serverValidationIssueSourceSignature, setServerValidationIssueSourceSignature] =
    useState<string>(persistedDefinitionSignature);
  const [validationFocusItem, setValidationFocusItem] =
    useState<WorkflowValidationNavigatorItem | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(DEFAULT_PANEL_COLLAPSED);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(DEFAULT_PANEL_COLLAPSED);
  const [assistantRequestSerial, setAssistantRequestSerial] = useState(0);
  const [hasLoadedPanelPreferences, setHasLoadedPanelPreferences] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedPreferenceVersion = window.localStorage.getItem(
      PANEL_PREFERENCE_VERSION_STORAGE_KEY
    );
    const sidebarPreference = window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY);
    const inspectorPreference = window.localStorage.getItem(INSPECTOR_PREFERENCE_STORAGE_KEY);

    setIsSidebarCollapsed(
      resolveWorkflowEditorPanelCollapsedPreference(sidebarPreference, storedPreferenceVersion)
    );
    setIsInspectorCollapsed(
      resolveWorkflowEditorPanelCollapsedPreference(inspectorPreference, storedPreferenceVersion)
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
    window.localStorage.setItem(
      PANEL_PREFERENCE_VERSION_STORAGE_KEY,
      PANEL_PREFERENCE_VERSION
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
    setServerValidationIssues((current) =>
      areWorkflowDefinitionPreflightIssuesEqual(
        current,
        normalizedInitialServerValidationIssues
      )
        ? current
        : normalizedInitialServerValidationIssues
    );
    setServerValidationIssueSourceSignature((current) =>
      current === persistedDefinitionSignature ? current : persistedDefinitionSignature
    );
  }, [normalizedInitialServerValidationIssues, persistedDefinitionSignature]);

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
