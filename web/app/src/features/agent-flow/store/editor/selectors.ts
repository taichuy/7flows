import type { AgentFlowEditorState } from './index';

export const selectWorkingDocument = (state: AgentFlowEditorState) =>
  state.workingDocument;

export const selectLastSavedDocument = (state: AgentFlowEditorState) =>
  state.lastSavedDocument;

export const selectSelectedNodeId = (state: AgentFlowEditorState) =>
  state.selectedNodeId;

export const selectActiveContainerId = (state: AgentFlowEditorState) =>
  state.activeContainerPath.at(-1) ?? null;

export const selectAutosaveStatus = (state: AgentFlowEditorState) =>
  state.autosaveStatus;

export const selectVersions = (state: AgentFlowEditorState) => state.versions;

export const selectDebugConsoleOpen = (state: AgentFlowEditorState) =>
  state.debugConsoleOpen;

export const selectDebugConsoleWidth = (state: AgentFlowEditorState) =>
  state.debugConsoleWidth;
