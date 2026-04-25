import type { ConsoleApplicationOrchestrationState } from '@1flowbase/api-client';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { createStore } from 'zustand/vanilla';

import { NODE_DETAIL_DEFAULT_WIDTH } from '../../lib/detail-panel-width';
import type { DocumentSlice } from './slices/document-slice';
import type { InteractionSlice } from './slices/interaction-slice';
import type { PanelSlice } from './slices/panel-slice';
import type { SelectionSlice } from './slices/selection-slice';
import type { SyncSlice } from './slices/sync-slice';
import type { ViewportSlice } from './slices/viewport-slice';

const DEBUG_CONSOLE_DEFAULT_WIDTH = 420;

function getDefaultSelectedNodeId(
  state: ConsoleApplicationOrchestrationState
) {
  if (state.draft.document.graph.nodes.some((node) => node.id === 'node-llm')) {
    return 'node-llm';
  }

  return state.draft.document.graph.nodes.at(0)?.id ?? null;
}

function hasDocumentChanged(
  current: DocumentSlice['workingDocument'],
  lastSaved: DocumentSlice['lastSavedDocument']
) {
  return JSON.stringify(current) !== JSON.stringify(lastSaved);
}

function hasOwnProperty<Key extends PropertyKey>(
  value: object,
  key: Key
): value is object & Record<Key, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export interface AgentFlowEditorState
  extends DocumentSlice,
    SelectionSlice,
    ViewportSlice,
    PanelSlice,
    InteractionSlice,
    SyncSlice {
  autosaveIntervalMs: number;
  setWorkingDocument: (
    update:
      | FlowAuthoringDocument
      | ((document: FlowAuthoringDocument) => FlowAuthoringDocument)
  ) => void;
  setSelection: (payload: Partial<SelectionSlice>) => void;
  setViewportState: (payload: Partial<ViewportSlice>) => void;
  setPanelState: (
    payload: Partial<
      Pick<
        AgentFlowEditorState,
        | 'issuesOpen'
        | 'historyOpen'
        | 'publishConfigOpen'
        | 'debugConsoleOpen'
        | 'debugConsoleWidth'
        | 'debugConsoleActiveTab'
        | 'nodeDetailTab'
        | 'nodeDetailWidth'
        | 'nodePickerState'
      >
    >
  ) => void;
  setInteractionState: (payload: Partial<InteractionSlice>) => void;
  setAutosaveStatus: (status: SyncSlice['autosaveStatus']) => void;
  setSyncState: (payload: Partial<SyncSlice>) => void;
  focusIssueField: (payload: {
    nodeId: string;
    sectionKey: SelectionSlice['openInspectorSectionKey'];
    fieldKey: string | null;
  }) => void;
  replaceFromServerState: (state: ConsoleApplicationOrchestrationState) => void;
  resetTransientInteractionState: () => void;
}

export function createAgentFlowEditorStore(
  state: ConsoleApplicationOrchestrationState
) {
  const selectedNodeId = getDefaultSelectedNodeId(state);

  return createStore<AgentFlowEditorState>((set) => ({
    workingDocument: state.draft.document,
    lastSavedDocument: state.draft.document,
    draftMeta: {
      draftId: state.draft.id,
      flowId: state.flow_id,
      updatedAt: state.draft.updated_at
    },
    versions: state.versions,
    selectedNodeId,
    selectedEdgeId: null,
    selectedNodeIds: selectedNodeId ? [selectedNodeId] : [],
    selectionMode: 'single',
    focusedFieldKey: null,
    openInspectorSectionKey: null,
    viewport: state.draft.document.editor.viewport,
    controlMode: 'pointer',
    isFittingView: false,
    issuesOpen: false,
    historyOpen: false,
    publishConfigOpen: false,
    debugConsoleOpen: false,
    debugConsoleWidth: DEBUG_CONSOLE_DEFAULT_WIDTH,
    debugConsoleActiveTab: 'conversation',
    nodeDetailTab: 'config',
    nodeDetailWidth: NODE_DETAIL_DEFAULT_WIDTH,
    nodePickerState: {
      open: false,
      anchorNodeId: null,
      anchorEdgeId: null,
      anchorCanvasPosition: null
    },
    activeContainerPath: [],
    connectingPayload: {
      sourceNodeId: null,
      sourceHandleId: null,
      sourceNodeType: null
    },
    hoveredNodeId: null,
    hoveredEdgeId: null,
    highlightedIssueId: null,
    pendingLocateNodeId: null,
    autosaveStatus: 'idle',
    isRestoringVersion: false,
    isDirty: false,
    lastChangeKind: null,
    lastChangeSummary: null,
    autosaveIntervalMs: state.autosave_interval_seconds * 1000,
    setWorkingDocument: (update) =>
      set((current) => {
        const workingDocument =
          typeof update === 'function' ? update(current.workingDocument) : update;

        return {
          workingDocument,
          viewport: workingDocument.editor.viewport,
          isDirty: hasDocumentChanged(workingDocument, current.lastSavedDocument)
        };
      }),
    setSelection: (payload) =>
      set((current) => ({
        ...current,
        ...payload
      })),
    setViewportState: (payload) =>
      set((current) => ({
        viewport: payload.viewport ?? current.viewport,
        controlMode: payload.controlMode ?? current.controlMode,
        isFittingView: payload.isFittingView ?? current.isFittingView
      })),
    setPanelState: (payload) =>
      set((current) => ({
        issuesOpen: payload.issuesOpen ?? current.issuesOpen,
        historyOpen: payload.historyOpen ?? current.historyOpen,
        publishConfigOpen:
          payload.publishConfigOpen ?? current.publishConfigOpen,
        debugConsoleOpen:
          payload.debugConsoleOpen ?? current.debugConsoleOpen,
        debugConsoleWidth:
          payload.debugConsoleWidth ?? current.debugConsoleWidth,
        debugConsoleActiveTab:
          payload.debugConsoleActiveTab ?? current.debugConsoleActiveTab,
        nodeDetailTab: payload.nodeDetailTab ?? current.nodeDetailTab,
        nodeDetailWidth: payload.nodeDetailWidth ?? current.nodeDetailWidth,
        nodePickerState: payload.nodePickerState
          ? {
              ...current.nodePickerState,
              ...payload.nodePickerState
            }
          : current.nodePickerState
      })),
    setInteractionState: (payload) =>
      set((current) => ({
        activeContainerPath:
          payload.activeContainerPath ?? current.activeContainerPath,
        connectingPayload: payload.connectingPayload
          ? {
              ...current.connectingPayload,
              ...payload.connectingPayload
            }
          : current.connectingPayload,
        hoveredNodeId: hasOwnProperty(payload, 'hoveredNodeId')
          ? payload.hoveredNodeId ?? null
          : current.hoveredNodeId,
        hoveredEdgeId: hasOwnProperty(payload, 'hoveredEdgeId')
          ? payload.hoveredEdgeId ?? null
          : current.hoveredEdgeId,
        highlightedIssueId: hasOwnProperty(payload, 'highlightedIssueId')
          ? payload.highlightedIssueId ?? null
          : current.highlightedIssueId,
        pendingLocateNodeId: hasOwnProperty(payload, 'pendingLocateNodeId')
          ? payload.pendingLocateNodeId ?? null
          : current.pendingLocateNodeId
      })),
    setAutosaveStatus: (autosaveStatus) => set({ autosaveStatus }),
    setSyncState: (payload) =>
      set((current) => ({
        autosaveStatus: payload.autosaveStatus ?? current.autosaveStatus,
        isRestoringVersion:
          payload.isRestoringVersion ?? current.isRestoringVersion,
        isDirty: payload.isDirty ?? current.isDirty,
        lastChangeKind: payload.lastChangeKind ?? current.lastChangeKind,
        lastChangeSummary:
          payload.lastChangeSummary ?? current.lastChangeSummary
      })),
    focusIssueField: ({ nodeId, sectionKey, fieldKey }) =>
      set({
        selectedNodeId: nodeId,
        selectedNodeIds: [nodeId],
        selectionMode: 'single',
        openInspectorSectionKey: sectionKey,
        focusedFieldKey: fieldKey,
        issuesOpen: false
      }),
    replaceFromServerState: (nextState) => {
      const nextSelectedNodeId = getDefaultSelectedNodeId(nextState);

      set((current) => ({
        workingDocument: nextState.draft.document,
        lastSavedDocument: nextState.draft.document,
        draftMeta: {
          draftId: nextState.draft.id,
          flowId: nextState.flow_id,
          updatedAt: nextState.draft.updated_at
        },
        versions: nextState.versions,
        selectedNodeId: nextSelectedNodeId,
        selectedEdgeId: null,
        selectedNodeIds: nextSelectedNodeId ? [nextSelectedNodeId] : [],
        selectionMode: 'single',
        focusedFieldKey: null,
        openInspectorSectionKey: null,
        viewport: nextState.draft.document.editor.viewport,
        issuesOpen: false,
        historyOpen: false,
        publishConfigOpen: false,
        debugConsoleOpen: false,
        debugConsoleWidth: current.debugConsoleWidth,
        debugConsoleActiveTab: 'conversation',
        nodeDetailTab: 'config',
        nodeDetailWidth: current.nodeDetailWidth,
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null,
          anchorCanvasPosition: null
        },
        activeContainerPath: [],
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        },
        hoveredNodeId: null,
        hoveredEdgeId: null,
        highlightedIssueId: null,
        pendingLocateNodeId: null,
        autosaveStatus: 'idle',
        isRestoringVersion: false,
        isDirty: false,
        lastChangeKind: null,
        lastChangeSummary: null,
        autosaveIntervalMs: nextState.autosave_interval_seconds * 1000
      }));
    },
    resetTransientInteractionState: () =>
      set((current) => ({
        selectedEdgeId: null,
        focusedFieldKey: null,
        openInspectorSectionKey: null,
        nodePickerState: {
          open: false,
          anchorNodeId: null,
          anchorEdgeId: null,
          anchorCanvasPosition: null
        },
        activeContainerPath: [],
        connectingPayload: {
          sourceNodeId: null,
          sourceHandleId: null,
          sourceNodeType: null
        },
        hoveredNodeId: null,
        hoveredEdgeId: null,
        highlightedIssueId: null,
        pendingLocateNodeId: null,
        issuesOpen: false,
        historyOpen: false,
        nodeDetailTab: 'config',
        nodeDetailWidth: current.nodeDetailWidth
      }))
  }));
}
