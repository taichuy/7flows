import type { FlowAuthoringDocument } from '@1flowse/flow-schema';

import { apiFetch } from './transport';

export interface ConsoleFlowVersionSummary {
  id: string;
  sequence: number;
  trigger: 'autosave' | 'restore';
  change_kind: 'logical';
  summary: string;
  created_at: string;
}

export interface ConsoleFlowDraftPayload {
  id: string;
  flow_id: string;
  document: FlowAuthoringDocument;
  updated_at: string;
}

export interface ConsoleApplicationOrchestrationState {
  flow_id: string;
  draft: ConsoleFlowDraftPayload;
  versions: ConsoleFlowVersionSummary[];
  autosave_interval_seconds: number;
}

export interface SaveConsoleApplicationDraftInput {
  document: FlowAuthoringDocument;
  change_kind: 'layout' | 'logical';
  summary: string;
}

export function getConsoleApplicationOrchestration(
  applicationId: string,
  baseUrl?: string
): Promise<ConsoleApplicationOrchestrationState> {
  return apiFetch<ConsoleApplicationOrchestrationState>({
    path: `/api/console/applications/${applicationId}/orchestration`,
    baseUrl
  });
}

export function saveConsoleApplicationDraft(
  applicationId: string,
  input: SaveConsoleApplicationDraftInput,
  csrfToken: string,
  baseUrl?: string
): Promise<ConsoleApplicationOrchestrationState> {
  return apiFetch<ConsoleApplicationOrchestrationState>({
    path: `/api/console/applications/${applicationId}/orchestration/draft`,
    method: 'PUT',
    body: input,
    csrfToken,
    baseUrl
  });
}

export function restoreConsoleApplicationVersion(
  applicationId: string,
  versionId: string,
  csrfToken: string,
  baseUrl?: string
): Promise<ConsoleApplicationOrchestrationState> {
  return apiFetch<ConsoleApplicationOrchestrationState>({
    path: `/api/console/applications/${applicationId}/orchestration/versions/${versionId}/restore`,
    method: 'POST',
    csrfToken,
    baseUrl
  });
}
