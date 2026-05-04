import type { FlowNodeDocument } from '@1flowbase/flow-schema';

import { basicFields } from '../../base';
import type { NodeDefinition } from '../../types';

export type DataModelNodeAction = 'list' | 'get' | 'create' | 'update' | 'delete';
export type DataModelFlowNodeType =
  | 'data_model_list'
  | 'data_model_get'
  | 'data_model_create'
  | 'data_model_update'
  | 'data_model_delete';

export const DATA_MODEL_NODE_TYPES: DataModelFlowNodeType[] = [
  'data_model_list',
  'data_model_get',
  'data_model_create',
  'data_model_update',
  'data_model_delete'
];

const DATA_MODEL_ACTION_BY_NODE_TYPE = {
  data_model_list: 'list',
  data_model_get: 'get',
  data_model_create: 'create',
  data_model_update: 'update',
  data_model_delete: 'delete'
} satisfies Record<DataModelFlowNodeType, DataModelNodeAction>;

export const DATA_MODEL_NODE_LABELS = {
  data_model_list: 'Data Model List',
  data_model_get: 'Data Model Get',
  data_model_create: 'Data Model Create',
  data_model_update: 'Data Model Update',
  data_model_delete: 'Data Model Delete'
} satisfies Record<DataModelFlowNodeType, string>;

export const defaultDataModelNodeConfig = { data_model_code: '' } as const;

const dataModelActionOutputs = {
  list: [
    { key: 'records', title: 'Records', valueType: 'array' },
    { key: 'total', title: 'Total', valueType: 'number' }
  ],
  get: [{ key: 'record', title: 'Record', valueType: 'json' }],
  create: [{ key: 'record', title: 'Record', valueType: 'json' }],
  update: [{ key: 'record', title: 'Record', valueType: 'json' }],
  delete: [{ key: 'deleted_id', title: 'Deleted ID', valueType: 'string' }]
} satisfies Record<DataModelNodeAction, FlowNodeDocument['outputs']>;

export function isDataModelFlowNodeType(
  nodeType: string
): nodeType is DataModelFlowNodeType {
  return Object.prototype.hasOwnProperty.call(
    DATA_MODEL_ACTION_BY_NODE_TYPE,
    nodeType
  );
}

export function getDataModelActionForNodeType(
  nodeType: string
): DataModelNodeAction | null {
  return isDataModelFlowNodeType(nodeType)
    ? DATA_MODEL_ACTION_BY_NODE_TYPE[nodeType]
    : null;
}

export function getDataModelNodeOutputs(
  action: DataModelNodeAction
): FlowNodeDocument['outputs'] {
  return dataModelActionOutputs[action].map((output) => ({ ...output }));
}

const dataModelField = {
  key: 'config.data_model_code',
  label: 'Data Model',
  editor: 'data_model',
  required: true
} as const;

function createDataModelNodeDefinition({
  label,
  fields
}: {
  label: string;
  fields: NodeDefinition['sections'][number]['fields'];
}): NodeDefinition {
  return {
    label,
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: basicFields
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [dataModelField, ...fields]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: []
      }
    ]
  };
}

export const dataModelListNodeDefinition = createDataModelNodeDefinition({
  label: DATA_MODEL_NODE_LABELS.data_model_list,
  fields: [
    {
      key: 'bindings.query',
      label: 'Query',
      editor: 'data_model_query'
    }
  ]
});

export const dataModelGetNodeDefinition = createDataModelNodeDefinition({
  label: DATA_MODEL_NODE_LABELS.data_model_get,
  fields: [
    {
      key: 'bindings.record_id',
      label: 'Record ID',
      editor: 'templated_text',
      required: true
    }
  ]
});

export const dataModelCreateNodeDefinition = createDataModelNodeDefinition({
  label: DATA_MODEL_NODE_LABELS.data_model_create,
  fields: [
    {
      key: 'bindings.payload',
      label: 'Payload',
      editor: 'named_bindings',
      required: true
    }
  ]
});

export const dataModelUpdateNodeDefinition = createDataModelNodeDefinition({
  label: DATA_MODEL_NODE_LABELS.data_model_update,
  fields: [
    {
      key: 'bindings.record_id',
      label: 'Record ID',
      editor: 'templated_text',
      required: true
    },
    {
      key: 'bindings.payload',
      label: 'Payload',
      editor: 'named_bindings',
      required: true
    }
  ]
});

export const dataModelDeleteNodeDefinition = createDataModelNodeDefinition({
  label: DATA_MODEL_NODE_LABELS.data_model_delete,
  fields: [
    {
      key: 'bindings.record_id',
      label: 'Record ID',
      editor: 'templated_text',
      required: true
    }
  ]
});

export const dataModelNodeDefinitions = {
  data_model_list: dataModelListNodeDefinition,
  data_model_get: dataModelGetNodeDefinition,
  data_model_create: dataModelCreateNodeDefinition,
  data_model_update: dataModelUpdateNodeDefinition,
  data_model_delete: dataModelDeleteNodeDefinition
} satisfies Record<DataModelFlowNodeType, NodeDefinition>;

export const dataModelNodeMeta = {
  data_model_list: {
    summary: 'List records from a Data Model runtime.',
    helpHref: '/docs/agentflow/nodes/data-model-list'
  },
  data_model_get: {
    summary: 'Get one record from a Data Model runtime.',
    helpHref: '/docs/agentflow/nodes/data-model-get'
  },
  data_model_create: {
    summary: 'Create a record through a Data Model runtime.',
    helpHref: '/docs/agentflow/nodes/data-model-create'
  },
  data_model_update: {
    summary: 'Update a record through a Data Model runtime.',
    helpHref: '/docs/agentflow/nodes/data-model-update'
  },
  data_model_delete: {
    summary: 'Delete a record through a Data Model runtime.',
    helpHref: '/docs/agentflow/nodes/data-model-delete'
  }
} as const;
