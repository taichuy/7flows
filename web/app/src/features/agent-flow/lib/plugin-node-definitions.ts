import type {
  BuiltinFlowNodeType,
  FlowNodeDocument,
  FlowPluginContributionRef
} from '@1flowbase/flow-schema';

import type { AgentFlowNodeContributionEntry } from '../api/node-contributions';
import type { NodeDefinition, NodeDefinitionMeta } from './node-definitions/types';

export interface BuiltinNodePickerOption {
  kind: 'builtin';
  type: BuiltinFlowNodeType;
  label: string;
}

export interface PluginContributionPickerOption {
  kind: 'plugin_contribution';
  label: string;
  contribution: AgentFlowNodeContributionEntry;
  disabled: boolean;
  disabledReason: string | null;
}

export type NodePickerOption =
  | BuiltinNodePickerOption
  | PluginContributionPickerOption;

export const BUILTIN_NODE_PICKER_OPTIONS: BuiltinNodePickerOption[] = [
  { kind: 'builtin', type: 'llm', label: 'LLM' },
  { kind: 'builtin', type: 'template_transform', label: 'Template Transform' },
  { kind: 'builtin', type: 'knowledge_retrieval', label: 'Knowledge Retrieval' },
  { kind: 'builtin', type: 'question_classifier', label: 'Question Classifier' },
  { kind: 'builtin', type: 'if_else', label: 'If / Else' },
  { kind: 'builtin', type: 'http_request', label: 'HTTP Request' },
  { kind: 'builtin', type: 'tool', label: 'Tool' },
  { kind: 'builtin', type: 'variable_assigner', label: 'Variable Assigner' },
  { kind: 'builtin', type: 'iteration', label: 'Iteration' },
  { kind: 'builtin', type: 'loop', label: 'Loop' }
];

const DEPENDENCY_STATUS_LABELS: Record<string, string> = {
  missing_plugin: '缺少依赖插件',
  version_mismatch: '依赖版本不匹配',
  disabled_plugin: '依赖插件未就绪'
};

export const pluginNodeDefinition: NodeDefinition = {
  label: 'Plugin Node',
  summary: '执行来自 capability plugin 的声明式节点贡献。',
  helpHref: null,
  sections: [
    {
      key: 'basics',
      title: '基础信息',
      fields: []
    },
    {
      key: 'outputs',
      title: '输出',
      fields: []
    }
  ]
};

export const pluginNodeDefinitionMeta: NodeDefinitionMeta = {
  summary: '来自 capability plugin 的声明式节点，可被工作流显式选择并执行。',
  helpHref: null
};

export function buildNodePickerOptions(
  contributions: AgentFlowNodeContributionEntry[]
): NodePickerOption[] {
  return [
    ...BUILTIN_NODE_PICKER_OPTIONS,
    ...contributions.map((contribution) => ({
      kind: 'plugin_contribution' as const,
      label: contribution.title,
      contribution,
      disabled: contribution.dependency_status !== 'ready',
      disabledReason:
        contribution.dependency_status === 'ready'
          ? null
          : DEPENDENCY_STATUS_LABELS[contribution.dependency_status] ??
            '当前插件节点不可用'
    }))
  ];
}

export function getNodePickerOptionKey(option: NodePickerOption) {
  return option.kind === 'builtin'
    ? option.type
    : `${option.contribution.plugin_id}:${option.contribution.contribution_code}`;
}

export function getNodePickerOptionNodeType(option: NodePickerOption) {
  return option.kind === 'builtin' ? option.type : 'plugin_node';
}

export function getNodePickerOptionDescription(option: NodePickerOption) {
  return option.kind === 'builtin'
    ? null
    : option.disabledReason ?? option.contribution.description ?? null;
}

export function toPluginContributionRef(
  contribution: AgentFlowNodeContributionEntry
): FlowPluginContributionRef {
  return {
    plugin_id: contribution.plugin_id,
    plugin_version: contribution.plugin_version,
    contribution_code: contribution.contribution_code,
    node_shell: contribution.node_shell,
    schema_version: contribution.schema_version
  };
}

export function hasPluginContributionRef(
  node: Partial<FlowPluginContributionRef>
): node is FlowPluginContributionRef {
  return [
    node.plugin_id,
    node.plugin_version,
    node.contribution_code,
    node.node_shell,
    node.schema_version
  ].every((value) => typeof value === 'string' && value.trim().length > 0);
}

export function createPluginNodeOutputs(
  contribution: AgentFlowNodeContributionEntry
): FlowNodeDocument['outputs'] {
  const schemaOutputs = contribution.output_schema.outputs;

  if (!Array.isArray(schemaOutputs)) {
    return [{ key: 'result', title: '节点输出', valueType: 'json' }];
  }

  const outputs = schemaOutputs
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const key =
        typeof entry.key === 'string' && entry.key.trim().length > 0
          ? entry.key
          : null;
      const title =
        typeof entry.title === 'string' && entry.title.trim().length > 0
          ? entry.title
          : key;
      const valueType =
        typeof entry.valueType === 'string' && entry.valueType.trim().length > 0
          ? entry.valueType
          : typeof entry.value_type === 'string' && entry.value_type.trim().length > 0
            ? entry.value_type
            : 'json';

      if (!key || !title) {
        return null;
      }

      return {
        key,
        title,
        valueType
      };
    })
    .filter((entry): entry is FlowNodeDocument['outputs'][number] => entry !== null);

  return outputs.length > 0
    ? outputs
    : [{ key: 'result', title: '节点输出', valueType: 'json' }];
}
