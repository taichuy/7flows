import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import {
  buildFlowDebugRunInput,
  type AgentFlowRunContext,
  type AgentFlowVariableGroup,
  type AgentFlowVariableItem,
  type FlowDebugRunDetail
} from '../../api/runtime';

function flattenValue(
  labelPrefix: string,
  value: unknown
): AgentFlowVariableItem[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: labelPrefix, label: labelPrefix, value: [] }];
    }

    return value.flatMap((entry, index) =>
      flattenValue(`${labelPrefix}[${index}]`, entry)
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return [{ key: labelPrefix, label: labelPrefix, value: {} }];
    }

    return entries.flatMap(([key, entryValue]) =>
      flattenValue(`${labelPrefix}.${key}`, entryValue)
    );
  }

  return [{ key: labelPrefix, label: labelPrefix, value }];
}

export function getRunContextValues(
  runContext: AgentFlowRunContext
): Record<string, unknown> {
  return runContext.fields.reduce<Record<string, unknown>>((result, field) => {
    result[field.key] = field.value;
    return result;
  }, {});
}

export function buildRunContextFromDocument(
  document: FlowAuthoringDocument,
  rememberedInputs?: Record<string, unknown> | null
): AgentFlowRunContext {
  const startNode = document.graph.nodes.find((node) => node.type === 'start');
  const startPayload =
    buildFlowDebugRunInput(document, rememberedInputs ?? undefined).input_payload[
      startNode?.id ?? 'node-start'
    ] ?? {};

  return {
    environmentLabel: 'draft',
    remembered: Boolean(rememberedInputs && Object.keys(rememberedInputs).length > 0),
    fields: (startNode?.outputs ?? []).map((output) => ({
      nodeId: startNode?.id ?? 'node-start',
      key: output.key,
      title: output.title,
      valueType: output.valueType,
      value: startPayload[output.key]
    }))
  };
}

export function mapRunContextToVariableGroups(
  runContext: AgentFlowRunContext,
  options: {
    applicationId: string;
    draftId: string;
  }
): AgentFlowVariableGroup[] {
  return [
    {
      title: 'Input Variables',
      items: runContext.fields.map((field) => ({
        key: `${field.nodeId}.${field.key}`,
        label: `${field.nodeId}.${field.key}`,
        value: field.value
      }))
    },
    {
      title: 'Conversation / Session',
      items: [
        {
          key: 'session.remembered',
          label: 'session.remembered',
          value: runContext.remembered
        }
      ]
    },
    {
      title: 'Environment',
      items: [
        {
          key: 'environment.label',
          label: 'environment.label',
          value: runContext.environmentLabel
        },
        {
          key: 'environment.application_id',
          label: 'environment.application_id',
          value: options.applicationId
        },
        {
          key: 'environment.draft_id',
          label: 'environment.draft_id',
          value: options.draftId
        }
      ]
    }
  ];
}

export function mapRunDetailToVariableGroups(
  detail: FlowDebugRunDetail,
  options: {
    applicationId: string;
    draftId: string;
    runContext: AgentFlowRunContext;
  }
): AgentFlowVariableGroup[] {
  const inputItems = Object.entries(detail.flow_run.input_payload).flatMap(
    ([nodeId, value]) => flattenValue(nodeId, value)
  );
  const nodeOutputItems = detail.node_runs.flatMap((nodeRun) =>
    flattenValue(nodeRun.node_id, nodeRun.output_payload)
  );
  const sessionItems: AgentFlowVariableItem[] = [
    {
      key: 'flow_run.id',
      label: 'flow_run.id',
      value: detail.flow_run.id
    },
    {
      key: 'flow_run.status',
      label: 'flow_run.status',
      value: detail.flow_run.status
    },
    {
      key: 'flow_run.started_at',
      label: 'flow_run.started_at',
      value: detail.flow_run.started_at
    },
    {
      key: 'flow_run.finished_at',
      label: 'flow_run.finished_at',
      value: detail.flow_run.finished_at
    }
  ];

  return [
    {
      title: 'Input Variables',
      items: inputItems
    },
    {
      title: 'Node Outputs',
      items: nodeOutputItems
    },
    {
      title: 'Conversation / Session',
      items: [
        ...sessionItems,
        {
          key: 'session.remembered',
          label: 'session.remembered',
          value: options.runContext.remembered
        }
      ]
    },
    {
      title: 'Environment',
      items: [
        {
          key: 'environment.label',
          label: 'environment.label',
          value: options.runContext.environmentLabel
        },
        {
          key: 'environment.application_id',
          label: 'environment.application_id',
          value: options.applicationId
        },
        {
          key: 'environment.draft_id',
          label: 'environment.draft_id',
          value: options.draftId
        },
        {
          key: 'environment.run_mode',
          label: 'environment.run_mode',
          value: detail.flow_run.run_mode
        }
      ]
    }
  ];
}
