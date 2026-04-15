import { useEffect, useRef, useState } from 'react';
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

import { buildDraftSaveInput } from '../lib/draft-save';

export function useEditorAutosave({
  document,
  lastSavedDocument,
  onSave,
  intervalMs = 30_000
}: {
  document: FlowAuthoringDocument;
  lastSavedDocument: FlowAuthoringDocument;
  onSave: (input: {
    document: FlowAuthoringDocument;
    change_kind: 'layout' | 'logical';
    summary: string;
  }) => Promise<void>;
  intervalMs?: number;
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const savingRef = useRef(false);
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);
  const currentSnapshot = JSON.stringify(document);
  const lastSavedSnapshot = JSON.stringify(lastSavedDocument);
  const hasPendingChanges = currentSnapshot !== lastSavedSnapshot;

  saveNowRef.current = async () => {
    if (savingRef.current) {
      return false;
    }

    savingRef.current = true;
    setStatus('saving');

    try {
      await onSave(buildDraftSaveInput(lastSavedDocument, document));
      setStatus('saved');
      return true;
    } catch {
      setStatus('error');
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  function saveNow() {
    return saveNowRef.current();
  }

  useEffect(() => {
    if (!hasPendingChanges) {
      if (!savingRef.current) {
        setStatus('idle');
      }
      return;
    }

    const timer = window.setInterval(() => {
      void saveNowRef.current();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [hasPendingChanges, intervalMs]);

  return {
    hasPendingChanges,
    saveNow,
    status
  };
}
