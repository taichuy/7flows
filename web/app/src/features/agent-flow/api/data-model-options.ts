import {
  fetchConsoleDataModels,
  type ConsoleDataModel,
  type ConsoleDataModelStatus
} from '@1flowbase/api-client';

import { getApplicationsApiBaseUrl } from '../../applications/api/applications';

export type AgentFlowDataModelOptionState =
  | 'enabled'
  | 'unpublished'
  | 'disabled'
  | 'broken';

export interface AgentFlowDataModelFieldOption {
  code: string;
  title: string;
  valueType: string;
  required: boolean;
  writable: boolean;
}

export interface AgentFlowDataModelOption {
  value: string;
  label: string;
  state: AgentFlowDataModelOptionState;
  disabled: boolean;
  disabledReason: string | null;
  modelId: string;
  modelCode: string;
  fields: AgentFlowDataModelFieldOption[];
}

export const dataModelOptionsQueryKey = ['agent-flow', 'data-model-options'] as const;

function resolveOptionState(
  status: ConsoleDataModelStatus
): AgentFlowDataModelOptionState {
  switch (status) {
    case 'published':
      return 'enabled';
    case 'disabled':
      return 'disabled';
    case 'broken':
      return 'broken';
    case 'draft':
    default:
      return 'unpublished';
  }
}

function resolveDisabledReason(state: AgentFlowDataModelOptionState) {
  switch (state) {
    case 'enabled':
      return null;
    case 'disabled':
      return 'Data Model is disabled';
    case 'broken':
      return 'Data Model is broken';
    case 'unpublished':
    default:
      return 'Data Model is not published';
  }
}

export function listAgentFlowDataModelOptions(
  models: ConsoleDataModel[]
): AgentFlowDataModelOption[] {
  return models.map((model) => {
    const state = resolveOptionState(model.status);

    return {
      value: model.code,
      label: model.title || model.code,
      state,
      disabled: state !== 'enabled',
      disabledReason: resolveDisabledReason(state),
      modelId: model.id,
      modelCode: model.code,
      fields: [...model.fields]
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((field) => ({
          code: field.code,
          title: field.title || field.code,
          valueType: field.field_kind,
          required: field.is_required,
          writable: field.is_writable
        }))
    };
  });
}

export async function fetchDataModelOptions() {
  const models = await fetchConsoleDataModels(
    {},
    getApplicationsApiBaseUrl()
  );

  return listAgentFlowDataModelOptions(models);
}
