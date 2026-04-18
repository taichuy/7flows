import type { SaveConsoleApplicationDraftInput } from '@1flowbase/api-client';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import { classifyDocumentChange } from './document/change-kind';
import { buildVersionSummary } from './history-change';

export function buildDraftSaveInput(
  lastSavedDocument: FlowAuthoringDocument,
  document: FlowAuthoringDocument
): SaveConsoleApplicationDraftInput {
  return {
    document,
    change_kind: classifyDocumentChange(lastSavedDocument, document),
    summary: buildVersionSummary(lastSavedDocument, document)
  };
}
