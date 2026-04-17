import {
  completeConsoleCallbackTask,
  getConsoleApplicationRunDetail,
  getConsoleApplicationRuns,
  resumeConsoleFlowRun,
  type ConsoleApplicationRunDetail,
  type ConsoleApplicationRunSummary
} from '@1flowse/api-client';

import { getApplicationsApiBaseUrl } from './applications';

export type ApplicationRunSummary = ConsoleApplicationRunSummary;
export type ApplicationRunDetail = ConsoleApplicationRunDetail;

export const applicationRunsQueryKey = (applicationId: string) =>
  ['applications', applicationId, 'runtime', 'runs'] as const;

export const applicationRunDetailQueryKey = (
  applicationId: string,
  runId: string
) => ['applications', applicationId, 'runtime', 'runs', runId] as const;

export function fetchApplicationRuns(applicationId: string) {
  return getConsoleApplicationRuns(applicationId, getApplicationsApiBaseUrl());
}

export function fetchApplicationRunDetail(applicationId: string, runId: string) {
  return getConsoleApplicationRunDetail(
    applicationId,
    runId,
    getApplicationsApiBaseUrl()
  );
}

export function resumeFlowRun(
  applicationId: string,
  runId: string,
  checkpointId: string,
  inputPayload: Record<string, unknown>,
  csrfToken: string
) {
  return resumeConsoleFlowRun(
    applicationId,
    runId,
    {
      checkpoint_id: checkpointId,
      input_payload: inputPayload
    },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}

export function completeCallbackTask(
  applicationId: string,
  callbackTaskId: string,
  responsePayload: Record<string, unknown>,
  csrfToken: string
) {
  return completeConsoleCallbackTask(
    applicationId,
    callbackTaskId,
    {
      response_payload: responsePayload
    },
    csrfToken,
    getApplicationsApiBaseUrl()
  );
}
