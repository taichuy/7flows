import type {
  ConsoleApplicationOrchestrationState,
  SaveConsoleApplicationDraftInput
} from '@1flowbase/api-client';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '../../../../state/auth-store';
import { restoreVersion, saveDraft } from '../../api/orchestration';
import { buildDraftSaveInput } from '../../lib/draft-save';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectLastSavedDocument,
  selectWorkingDocument
} from '../../store/editor/selectors';

interface UseDraftSyncOptions {
  applicationId: string;
  saveDraftOverride?: (
    input: SaveConsoleApplicationDraftInput
  ) => Promise<ConsoleApplicationOrchestrationState>;
  restoreVersionOverride?: (
    versionId: string
  ) => Promise<ConsoleApplicationOrchestrationState>;
  getCurrentDocument?: () => FlowAuthoringDocument;
  getLastSavedDocument?: () => FlowAuthoringDocument;
}

export function useDraftSync({
  applicationId,
  saveDraftOverride,
  restoreVersionOverride,
  getCurrentDocument,
  getLastSavedDocument
}: UseDraftSyncOptions) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const workingDocument = useAgentFlowEditorStore(selectWorkingDocument);
  const lastSavedDocument = useAgentFlowEditorStore(selectLastSavedDocument);
  const autosaveIntervalMs = useAgentFlowEditorStore(
    (state) => state.autosaveIntervalMs
  );
  const autosaveStatus = useAgentFlowEditorStore((state) => state.autosaveStatus);
  const setAutosaveStatus = useAgentFlowEditorStore(
    (state) => state.setAutosaveStatus
  );
  const setSyncState = useAgentFlowEditorStore((state) => state.setSyncState);
  const replaceFromServerState = useAgentFlowEditorStore(
    (state) => state.replaceFromServerState
  );
  const saveInFlightRef = useRef(false);
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);
  const hasPendingChanges =
    JSON.stringify(workingDocument) !== JSON.stringify(lastSavedDocument);

  useEffect(() => {
    setSyncState({ isDirty: hasPendingChanges });
  }, [hasPendingChanges, setSyncState]);

  async function saveNow() {
    if (saveInFlightRef.current) {
      return false;
    }

    if (!saveDraftOverride && !csrfToken) {
      return false;
    }

    saveInFlightRef.current = true;
    setAutosaveStatus('saving');

    try {
      const currentDocument = getCurrentDocument
        ? getCurrentDocument()
        : workingDocument;
      const currentLastSavedDocument = getLastSavedDocument
        ? getLastSavedDocument()
        : lastSavedDocument;
      const input = buildDraftSaveInput(
        currentLastSavedDocument,
        currentDocument
      );
      const nextState = saveDraftOverride
        ? await saveDraftOverride(input)
        : await saveDraft(applicationId, input, csrfToken!);

      replaceFromServerState(nextState);
      setSyncState({
        autosaveStatus: 'saved',
        isDirty: false,
        lastChangeKind: input.change_kind,
        lastChangeSummary: input.summary
      });
      return true;
    } catch {
      setSyncState({ autosaveStatus: 'error' });
      return false;
    } finally {
      saveInFlightRef.current = false;
    }
  }

  saveNowRef.current = saveNow;

  async function restoreVersionById(versionId: string) {
    if (!restoreVersionOverride && !csrfToken) {
      return;
    }

    setSyncState({
      autosaveStatus: 'saving',
      isRestoringVersion: true
    });

    try {
      const nextState = restoreVersionOverride
        ? await restoreVersionOverride(versionId)
        : await restoreVersion(applicationId, versionId, csrfToken!);

      replaceFromServerState(nextState);
      setSyncState({
        autosaveStatus: 'idle',
        isRestoringVersion: false,
        isDirty: false
      });
    } catch {
      setSyncState({
        autosaveStatus: 'error',
        isRestoringVersion: false
      });
    }
  }

  useEffect(() => {
    if (!hasPendingChanges) {
      if (!saveInFlightRef.current) {
        setAutosaveStatus('idle');
      }
      return;
    }

    const timer = window.setInterval(() => {
      void saveNowRef.current();
    }, autosaveIntervalMs);

    return () => window.clearInterval(timer);
  }, [autosaveIntervalMs, hasPendingChanges, setAutosaveStatus]);

  return {
    hasPendingChanges,
    restoreVersion: restoreVersionById,
    saveNow,
    status: autosaveStatus
  };
}
