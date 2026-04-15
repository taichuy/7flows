import type { SaveConsoleApplicationDraftInput } from '@1flowse/api-client';
import {
  classifyDocumentChange,
  type FlowAuthoringDocument
} from '@1flowse/flow-schema';

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
