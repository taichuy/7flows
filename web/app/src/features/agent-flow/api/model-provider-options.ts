import {
  listConsoleModelProviderOptions,
  type ConsoleModelProviderOption,
  type ConsoleModelProviderOptions
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from '../../applications/api/applications';

export type AgentFlowModelProviderOption = ConsoleModelProviderOption;
export type AgentFlowModelProviderOptions = ConsoleModelProviderOptions;

export const modelProviderOptionsQueryKey = ['model-providers', 'options'] as const;

export function fetchModelProviderOptions() {
  return listConsoleModelProviderOptions(getApplicationsApiBaseUrl());
}
