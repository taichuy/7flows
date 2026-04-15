import { classifyDocumentChange } from '@1flowse/flow-schema';
import { useEffect, useRef, useState } from 'react';
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

import { buildVersionSummary } from '../lib/history-change';

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
  const currentSnapshot = JSON.stringify(document);
  const lastSavedSnapshot = JSON.stringify(lastSavedDocument);

  useEffect(() => {
    if (currentSnapshot === lastSavedSnapshot) {
      setStatus('idle');
      return;
    }

    const timer = window.setInterval(() => {
      if (savingRef.current) {
        return;
      }

      savingRef.current = true;
      setStatus('saving');

      void onSave({
        document,
        change_kind: classifyDocumentChange(lastSavedDocument, document),
        summary: buildVersionSummary(lastSavedDocument, document)
      })
        .then(() => {
          setStatus('saved');
        })
        .catch(() => {
          setStatus('error');
        })
        .finally(() => {
          savingRef.current = false;
        });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [currentSnapshot, document, intervalMs, lastSavedDocument, lastSavedSnapshot, onSave]);

  return status;
}
