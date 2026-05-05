import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';

import {
  buildFlowDebugRunInput,
  type AgentFlowRunContext,
  type AgentFlowVariableGroup,
  type AgentFlowVariableItem,
  type FlowDebugRunDetail,
  type NodeDebugPreviewVariableCache
} from '../../api/runtime';
import { getNodeVariableOutputs } from '../start-node-variables';
import { formatNodeVariablePathLabel } from '../variable-labels';

function flattenValue(
  keyPrefix: string,
  labelPrefix: string,
  value: unknown
): AgentFlowVariableItem[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: keyPrefix, label: labelPrefix, value: [] }];
    }

    return value.flatMap((entry, index) =>
      flattenValue(`${keyPrefix}[${index}]`, `${labelPrefix}[${index}]`, entry)
    );
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);

    if (entries.length === 0) {
      return [{ key: keyPrefix, label: labelPrefix, value: {} }];
    }

    return entries.flatMap(([key, entryValue]) =>
      flattenValue(`${keyPrefix}.${key}`, `${labelPrefix}.${key}`, entryValue)
    );
  }

  return [{ key: keyPrefix, label: labelPrefix, value }];
}

function flattenNodeVariables(
  nodeId: string,
  value: unknown
): AgentFlowVariableItem[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return flattenValue(nodeId, nodeId, value);
  }

  const entries = Object.entries(value as Record<string, unknown>);

  if (entries.length === 0) {
    return [{ key: nodeId, label: nodeId, value: {} }];
  }

  return entries.flatMap(([key, entryValue]) =>
    flattenValue(
      `${nodeId}.${key}`,
      formatNodeVariablePathLabel(nodeId, key),
      entryValue
    )
  );
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
    fields: (startNode ? getNodeVariableOutputs(startNode) : []).map((output) => ({
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
        label: formatNodeVariablePathLabel(field.nodeId, field.key),
        value: field.value
      }))
    },
    {
      title: 'Conversation / Session',
      items: [
        {
          key: 'session.remembered',
          label: 'session.remembered',
          value: runContext.remembered,
          isReadOnly: true
        }
      ]
    },
    {
      title: 'Environment',
      items: [
        {
          key: 'environment.label',
          label: 'environment.label',
          value: runContext.environmentLabel,
          isReadOnly: true
        },
        {
          key: 'environment.application_id',
          label: 'environment.application_id',
          value: options.applicationId,
          isReadOnly: true
        },
        {
          key: 'environment.draft_id',
          label: 'environment.draft_id',
          value: options.draftId,
          isReadOnly: true
        }
      ]
    }
  ];
}

export function mapVariableCacheToVariableGroup(
  variableCache: NodeDebugPreviewVariableCache
): AgentFlowVariableGroup | null {
  const items = Object.entries(variableCache).flatMap(([nodeId, value]) =>
    flattenNodeVariables(nodeId, value)
  );

  if (items.length === 0) {
    return null;
  }

  return {
    title: 'Variable Cache',
    items
  };
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
    ([nodeId, value]) => flattenNodeVariables(nodeId, value)
  );
  const nodeOutputItems = detail.node_runs.flatMap((nodeRun) =>
    flattenNodeVariables(nodeRun.node_id, nodeRun.output_payload)
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
        ...sessionItems.map((item) => ({
          ...item,
          isReadOnly: true
        })),
        {
          key: 'session.remembered',
          label: 'session.remembered',
          value: options.runContext.remembered,
          isReadOnly: true
        }
      ]
    },
    {
      title: 'Environment',
      items: [
        {
          key: 'environment.label',
          label: 'environment.label',
          value: options.runContext.environmentLabel,
          isReadOnly: true
        },
        {
          key: 'environment.application_id',
          label: 'environment.application_id',
          value: options.applicationId,
          isReadOnly: true
        },
        {
          key: 'environment.draft_id',
          label: 'environment.draft_id',
          value: options.draftId,
          isReadOnly: true
        },
        {
          key: 'environment.run_mode',
          label: 'environment.run_mode',
          value: detail.flow_run.run_mode,
          isReadOnly: true
        }
      ]
    }
  ];
}
