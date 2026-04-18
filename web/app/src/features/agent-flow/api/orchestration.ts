import {
  getConsoleApplicationOrchestration,
  restoreConsoleApplicationVersion,
  saveConsoleApplicationDraft,
  type SaveConsoleApplicationDraftInput
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from '../../applications/api/applications';

export const orchestrationQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'orchestration'] as const;

export function fetchOrchestrationState(applicationId: string) {
  return getConsoleApplicationOrchestration(
    applicationId,
    getApplicationsApiBaseUrl()
  );
}

export function saveDraft(
  applicationId: string,
  input: SaveConsoleApplicationDraftInput,
  csrfToken: string
) {
  return saveConsoleApplicationDraft(
    applicationId,
    input,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function restoreVersion(
  applicationId: string,
  versionId: string,
  csrfToken: string
) {
  return restoreConsoleApplicationVersion(
    applicationId,
    versionId,
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}
