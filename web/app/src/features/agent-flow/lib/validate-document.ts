import {
  getLlmNodeOutputs,
  validatePublicOutputKey,
  type FlowAuthoringDocument
} from '@1flowbase/flow-schema';
import type { FlowBinding, FlowNodeDocument } from '@1flowbase/flow-schema';

import { evaluateSchemaRule } from '../../../shared/schema-ui/runtime/rule-evaluator';
import type { AgentFlowModelProviderOptions } from '../api/model-provider-options';
import {
  extractDataModelQuerySelectors,
  getActiveNodeBindings
} from './data-model-query-binding';
import { getLlmModelProvider } from './llm-node-config';
import { getBuiltinNodeRuntimeContract } from './node-definitions/contracts';
import type {
  InspectorSectionKey,
  NodeDefinitionField
} from './node-definitions';
import { findInspectorSectionKey, nodeDefinitions } from './node-definitions';
import { hasPluginContributionRef } from './plugin-node-definitions';
import { isSelectorVisible } from './selector-options';
import { parseTemplateSelectorTokens } from './template-binding';
import type { AgentFlowEnvironmentVariable } from './application-environment-variables';

export interface AgentFlowIssue {
  id: string;
  scope: 'field' | 'node' | 'global';
  level: 'error' | 'warning';
  nodeId: string | null;
  sectionKey: InspectorSectionKey | null;
  fieldKey?: string | null;
  title: string;
  message: string;
}

function isMissingRequiredField(
  node: FlowNodeDocument,
  fieldKey: string
): boolean {
  if (fieldKey === 'alias') {
    return node.alias.trim().length === 0;
  }

  if (fieldKey.startsWith('config.')) {
    if (fieldKey === 'config.model_provider') {
      const modelProvider = getLlmModelProvider(node.config);
      return (
        modelProvider.provider_code.trim().length === 0 ||
        modelProvider.source_instance_id.trim().length === 0 ||
        modelProvider.model_id.trim().length === 0
      );
    }

    const configValue = node.config[fieldKey.slice('config.'.length)];

    if (typeof configValue === 'string') {
      return configValue.trim().length === 0;
    }

    return configValue === undefined || configValue === null;
  }

  if (fieldKey.startsWith('outputs.')) {
    const outputKey = fieldKey.slice('outputs.'.length);
    const output = node.outputs.find((item) => item.key === outputKey);

    return !output || output.title.trim().length === 0;
  }

  if (!fieldKey.startsWith('bindings.')) {
    return false;
  }

  const binding = node.bindings[fieldKey.slice('bindings.'.length)];

  if (!binding) {
    return true;
  }

  switch (binding.kind) {
    case 'templated_text':
      return binding.value.trim().length === 0;
    case 'selector':
      return binding.value.length === 0;
    case 'selector_list':
      return binding.value.length === 0;
    case 'data_model_query':
      return false;
    case 'prompt_messages':
      return binding.value.length === 0;
    case 'named_bindings':
      return binding.value.length === 0;
    case 'condition_group':
      return binding.value.conditions.length === 0;
    case 'state_write':
      return binding.value.length === 0;
  }
}

function createNodeRuleValues(node: FlowNodeDocument): Record<string, unknown> {
  return {
    ...node,
    config: {
      ...node.config,
      output_contract: node.outputs
    }
  };
}

function isFieldVisibleForNode(
  node: FlowNodeDocument,
  field: NodeDefinitionField
) {
  return evaluateSchemaRule(field.visibleWhen, {
    values: createNodeRuleValues(node),
    capabilities: []
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAllowedPluginNodeOutputKeys(
  node: FlowNodeDocument
): Set<string> | null {
  const rawSnapshot = node.output_schema_snapshot;

  if (!isRecord(rawSnapshot) || !Array.isArray(rawSnapshot.outputs)) {
    return null;
  }

  const allowed = rawSnapshot.outputs
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      if (typeof entry.key !== 'string') {
        return null;
      }

      const outputKey = entry.key.trim();

      return outputKey.length > 0 ? outputKey : null;
    })
    .filter((key): key is string => key !== null);

  return new Set(allowed);
}

function collectBindingSelectors(binding: FlowBinding): string[][] {
  switch (binding.kind) {
    case 'templated_text':
      return parseTemplateSelectorTokens(binding.value);
    case 'selector':
      return [binding.value];
    case 'selector_list':
      return binding.value;
    case 'prompt_messages':
      return binding.value.flatMap((message) =>
        parseTemplateSelectorTokens(message.content.value)
      );
    case 'named_bindings':
      return binding.value.map((entry) => entry.selector);
    case 'condition_group':
      return binding.value.conditions.flatMap((condition) => {
        const selectors = [condition.left];

        if (Array.isArray(condition.right)) {
          selectors.push(condition.right);
        }

        return selectors;
      });
    case 'state_write':
      return binding.value.flatMap((entry) =>
        entry.source ? [entry.source] : []
      );
    case 'data_model_query':
      return extractDataModelQuerySelectors(binding.value);
  }
}

function pushFieldIssue(
  issues: AgentFlowIssue[],
  node: FlowNodeDocument,
  fieldKey: string,
  title: string,
  message: string,
  sectionKey?: InspectorSectionKey | null
) {
  issues.push({
    id: `${node.id}-${fieldKey}-${issues.length}`,
    scope: 'field',
    level: 'error',
    nodeId: node.id,
    sectionKey: sectionKey ?? findInspectorSectionKey(node.type, fieldKey),
    fieldKey,
    title,
    message
  });
}

function getAllowedPublicOutputKeysForNode(
  node: FlowNodeDocument
): Set<string> | null {
  if (node.type === 'plugin_node' && hasPluginContributionRef(node)) {
    return getAllowedPluginNodeOutputKeys(node);
  }

  if (node.type === 'llm') {
    return new Set(getLlmNodeOutputs(node.config).map((output) => output.key));
  }

  if (node.type === 'code') {
    return new Set(node.outputs.map((output) => output.key));
  }

  const contract = getBuiltinNodeRuntimeContract(node.type);

  if (!contract) {
    return null;
  }

  return new Set(contract.defaults.outputs.map((output) => output.key));
}

export function validateDocument(
  document: FlowAuthoringDocument,
  providerOptions?: AgentFlowModelProviderOptions | null,
  environmentVariables: AgentFlowEnvironmentVariable[] = []
): AgentFlowIssue[] {
  const issues: AgentFlowIssue[] = [];
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const startNodes = document.graph.nodes.filter(
    (node) => node.type === 'start'
  );
  const answerNodes = document.graph.nodes.filter(
    (node) => node.type === 'answer'
  );
  const providerMap = new Map(
    (providerOptions?.providers ?? []).map((provider) => [
      provider.provider_code,
      provider
    ])
  );

  if (startNodes.length !== 1) {
    issues.push({
      id: 'global-start-count',
      scope: 'global',
      level: 'error',
      nodeId: null,
      sectionKey: null,
      fieldKey: null,
      title: 'Start 节点数量非法',
      message: '每个草稿必须保留且只保留一个 Start 节点。'
    });
  }

  if (answerNodes.length === 0) {
    issues.push({
      id: 'global-answer-missing',
      scope: 'global',
      level: 'error',
      nodeId: null,
      sectionKey: null,
      fieldKey: null,
      title: '缺少 Answer 节点',
      message: '第一版 agentFlow 至少需要一个 Answer 节点作为对话输出。'
    });
  }

  for (const edge of document.graph.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      continue;
    }

    if (nodeIds.has(edge.source)) {
      issues.push({
        id: `${edge.id}-dangling`,
        scope: 'node',
        level: 'warning',
        nodeId: edge.source,
        sectionKey: 'basics',
        fieldKey: null,
        title: '节点连线指向无效目标',
        message: '当前节点存在一条指向已删除节点的连线。'
      });
    }
  }

  for (const node of document.graph.nodes) {
    const definition = nodeDefinitions[node.type];

    if (definition) {
      for (const section of definition.sections) {
        for (const field of section.fields) {
          if (
            field.required &&
            isFieldVisibleForNode(node, field) &&
            isMissingRequiredField(node, field.key)
          ) {
            if (node.type === 'llm' && field.key === 'config.model_provider') {
              const modelProvider = getLlmModelProvider(node.config);
              const providerMissing =
                modelProvider.provider_code.trim().length === 0;
              const sourceInstanceMissing =
                modelProvider.source_instance_id.trim().length === 0;

              pushFieldIssue(
                issues,
                node,
                field.key,
                providerMissing
                  ? 'LLM 缺少模型供应商'
                  : sourceInstanceMissing
                    ? 'LLM 缺少模型来源实例'
                    : 'LLM 缺少模型',
                providerMissing
                  ? '请先选择模型供应商。'
                  : sourceInstanceMissing
                    ? '请先选择来源实例。'
                    : '请先选择模型。'
              );
              continue;
            }

            pushFieldIssue(
              issues,
              node,
              field.key,
              `${field.label} 未配置`,
              `请先完善 ${field.label}。`
            );
          }
        }
      }
    }

    if (node.type === 'llm') {
      const modelProvider = getLlmModelProvider(node.config);
      const providerCode = modelProvider.provider_code.trim();
      const sourceInstanceId = modelProvider.source_instance_id.trim();
      const model = modelProvider.model_id.trim();

      if (providerOptions && providerCode.length > 0) {
        const provider = providerMap.get(providerCode);

        if (!provider) {
          pushFieldIssue(
            issues,
            node,
            'config.model_provider',
            'LLM 模型供应商不可用',
            '当前模型供应商不存在、未就绪或你无权访问。',
            'inputs'
          );
        } else if (sourceInstanceId.length > 0) {
          const modelGroup = provider.model_groups.find(
            (group) => group.source_instance_id === sourceInstanceId
          );

          if (!modelGroup) {
            pushFieldIssue(
              issues,
              node,
              'config.model_provider',
              'LLM 模型来源实例不可用',
              '当前模型来源实例不存在、已移出主实例或你无权访问。',
              'inputs'
            );
          } else if (
            model.length > 0 &&
            !modelGroup.models.some((entry) => entry.model_id === model)
          ) {
            pushFieldIssue(
              issues,
              node,
              'config.model_provider',
              'LLM 模型不可用',
              '当前模型不属于所选模型来源实例。'
            );
          }
        }
      }
    }

    if (node.type === 'plugin_node' && !hasPluginContributionRef(node)) {
      issues.push({
        id: `${node.id}-plugin-ref-missing`,
        scope: 'node',
        level: 'error',
        nodeId: node.id,
        sectionKey: 'basics',
        fieldKey: null,
        title: '插件节点缺少贡献身份',
        message:
          '当前 plugin_node 缺少 plugin_id / plugin_version / contribution_code / node_shell / schema_version / plugin_unique_identifier / package_id / contribution_checksum / compiled_contribution_hash / output_schema_snapshot。'
      });
    }

    for (const [bindingKey, bindingValue] of getActiveNodeBindings(node)) {
      const selectors = collectBindingSelectors(bindingValue);

      for (const selector of selectors) {
        if (
          selector.length === 0 ||
          isSelectorVisible(document, node.id, selector, environmentVariables)
        ) {
          continue;
        }

        pushFieldIssue(
          issues,
          node,
          `bindings.${bindingKey}`,
          '绑定引用不可见',
          '当前 binding 引用了未接入上游链路的输出。'
        );
      }
    }

    const seenOutputKeys = new Set<string>();
    const allowedPublicOutputKeys = getAllowedPublicOutputKeysForNode(node);

    if (node.type === 'code') {
      const language = typeof node.config.language === 'string'
        ? node.config.language.trim()
        : '';

      if (language.length > 0 && language !== 'javascript') {
        pushFieldIssue(
          issues,
          node,
          'config.language',
          '不支持的运行语言',
          '当前版本仅支持 JavaScript。'
        );
      }
    }

    if (node.type === 'code' && node.outputs.length === 0) {
      pushFieldIssue(
        issues,
        node,
        'config.output_contract',
        '代码输出契约不能为空',
        'Code 节点至少需要保留 1 个输出变量用于下游引用。'
      );
    }

    for (const output of node.outputs) {
      const outputKey = output.key.trim();

      if (outputKey.length === 0) {
        pushFieldIssue(
          issues,
          node,
          'config.output_contract',
          '输出变量名未配置',
          '输出契约中的变量名不能为空。'
        );
        continue;
      }

      if (seenOutputKeys.has(outputKey)) {
        pushFieldIssue(
          issues,
          node,
          'config.output_contract',
          '输出契约重复',
          '输出契约中的变量名必须唯一'
        );
        continue;
      }

      seenOutputKeys.add(outputKey);

      const publicOutputKeyValidation = validatePublicOutputKey(outputKey);

      if (!publicOutputKeyValidation.ok) {
        pushFieldIssue(
          issues,
          node,
          'config.output_contract',
          '输出变量名保留',
          '输出契约中的变量名是系统保留字段，请改用业务字段名。'
        );
        continue;
      }

      if (allowedPublicOutputKeys && !allowedPublicOutputKeys.has(outputKey)) {
        pushFieldIssue(
          issues,
          node,
          'config.output_contract',
          '输出变量名未知',
          '输出契约中的变量名不属于当前节点运行时契约。'
        );
      }
    }

    if (
      node.type !== 'start' &&
      !document.graph.edges.some(
        (edge) => edge.target === node.id && nodeIds.has(edge.source)
      )
    ) {
      issues.push({
        id: `${node.id}-orphan`,
        scope: 'node',
        level: 'warning',
        nodeId: node.id,
        sectionKey: 'basics',
        fieldKey: null,
        title: `${node.alias} 尚未接入主链路`,
        message: '当前节点没有任何有效入边。'
      });
    }
  }

  return issues;
}
