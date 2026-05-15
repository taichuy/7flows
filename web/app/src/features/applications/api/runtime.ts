import {
  completeConsoleCallbackTask,
  getConsoleApplicationRunDetail,
  getConsoleApplicationRuns,
  getConsoleRuntimeDebugStream,
  type ConsoleApplicationRunsPage,
  resumeConsoleFlowRun,
  type ConsoleApplicationRunDetail,
  type ConsoleApplicationRunSummary,
  type RuntimeDebugStreamPart
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from './applications';

export type ApplicationRunSummary = ConsoleApplicationRunSummary;
export type ApplicationRunsPage = ConsoleApplicationRunsPage;
export type ApplicationRunDetail = ConsoleApplicationRunDetail;
export type ApplicationRuntimeDebugStreamPart = RuntimeDebugStreamPart;
export type { RuntimeDebugStreamPart };
export type ApplicationRunSortField =
  | 'created_at'
  | 'started_at'
  | 'finished_at'
  | 'updated_at';
export type ApplicationRunSortOrder = 'asc' | 'desc';

export interface FetchApplicationRunsInput {
  page?: number;
  pageSize?: number;
  timeRangeDays?: number | null;
  sortBy?: ApplicationRunSortField;
  sortOrder?: ApplicationRunSortOrder;
}

export const applicationRunsQueryKey = (
  applicationId: string,
  input: FetchApplicationRunsInput = {}
) =>
  [
    'applications',
    applicationId,
    'runtime',
    'runs',
    input.page ?? 1,
    input.pageSize ?? 20,
    input.timeRangeDays ?? 'all',
    input.sortBy ?? 'started_at',
    input.sortOrder ?? 'desc'
  ] as const;

export const applicationRunDetailQueryKey = (
  applicationId: string,
  runId: string
) => ['applications', applicationId, 'runtime', 'runs', runId] as const;

export const applicationRuntimeDebugStreamQueryKey = (
  applicationId: string,
  runId: string
) =>
  [
    'applications',
    applicationId,
    'runtime',
    'runs',
    runId,
    'debug-stream'
  ] as const;

export function fetchApplicationRuns(
  applicationId: string,
  input: FetchApplicationRunsInput = {}
) {
  return getConsoleApplicationRuns(
    applicationId,
    {
      page: input.page ?? 1,
      page_size: input.pageSize ?? 20,
      time_range_days: input.timeRangeDays ?? undefined,
      sort_by: input.sortBy ?? 'started_at',
      sort_order: input.sortOrder ?? 'desc'
    },
    getApplicationsApiBaseUrl()
  );
}

export function fetchApplicationRunDetail(applicationId: string, runId: string) {
  return getConsoleApplicationRunDetail(
    applicationId,
    runId,
    getApplicationsApiBaseUrl()
  );
}

export function fetchRuntimeDebugStream(applicationId: string, runId: string) {
  return getConsoleRuntimeDebugStream(
    applicationId,
    runId,
    getApplicationsApiBaseUrl()
  );
}

export { getConsoleRuntimeDebugStream };

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
