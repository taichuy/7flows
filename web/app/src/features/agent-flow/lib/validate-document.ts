import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import type { FlowBinding, FlowNodeDocument } from '@1flowbase/flow-schema';

import type { AgentFlowModelProviderOptions } from '../api/model-provider-options';
import { getLlmModelProvider } from './llm-node-config';
import type { InspectorSectionKey } from './node-definitions';
import { findInspectorSectionKey, nodeDefinitions } from './node-definitions';
import { hasPluginContributionRef } from './plugin-node-definitions';
import { isSelectorVisible } from './selector-options';
import { parseTemplateSelectorTokens } from './template-binding';

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
        modelProvider.provider_instance_id.trim().length === 0 ||
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
    case 'named_bindings':
      return binding.value.length === 0;
    case 'condition_group':
      return binding.value.conditions.length === 0;
    case 'state_write':
      return binding.value.length === 0;
  }
}

function collectBindingSelectors(binding: FlowBinding): string[][] {
  switch (binding.kind) {
    case 'templated_text':
      return parseTemplateSelectorTokens(binding.value);
    case 'selector':
      return [binding.value];
    case 'selector_list':
      return binding.value;
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
      return binding.value.flatMap((entry) => (entry.source ? [entry.source] : []));
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

export function validateDocument(
  document: FlowAuthoringDocument,
  providerOptions?: AgentFlowModelProviderOptions | null
): AgentFlowIssue[] {
  const issues: AgentFlowIssue[] = [];
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const startNodes = document.graph.nodes.filter((node) => node.type === 'start');
  const answerNodes = document.graph.nodes.filter((node) => node.type === 'answer');
  const providerInstanceMap = new Map(
    (providerOptions?.instances ?? []).map((instance) => [
      instance.provider_instance_id,
      instance
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
          if (field.required && isMissingRequiredField(node, field.key)) {
            if (node.type === 'llm' && field.key === 'config.model_provider') {
              const modelProvider = getLlmModelProvider(node.config);
              const providerMissing = modelProvider.provider_instance_id.trim().length === 0;

              pushFieldIssue(
                issues,
                node,
                field.key,
                providerMissing ? 'LLM 缺少模型供应商实例' : 'LLM 缺少模型',
                providerMissing ? '请先选择模型供应商实例。' : '请先选择模型。'
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
      const providerInstanceId = modelProvider.provider_instance_id.trim();
      const model = modelProvider.model_id.trim();

      if (providerOptions && providerInstanceId.length > 0) {
        const providerInstance = providerInstanceMap.get(providerInstanceId);

        if (!providerInstance) {
          pushFieldIssue(
            issues,
            node,
            'config.model_provider',
            'LLM 模型供应商实例不可用',
            '当前模型供应商实例不存在、未就绪或你无权访问。',
            'inputs'
          );
        } else if (
          model.length > 0 &&
          !providerInstance.models.some((entry) => entry.model_id === model)
        ) {
          pushFieldIssue(
            issues,
            node,
            'config.model_provider',
            'LLM 模型不可用',
            '当前模型不属于所选模型供应商实例。'
          );
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
          '当前 plugin_node 缺少 plugin_id / plugin_version / contribution_code / node_shell / schema_version。'
      });
    }

    for (const [bindingKey, bindingValue] of Object.entries(node.bindings)) {
      const selectors = collectBindingSelectors(bindingValue);

      for (const selector of selectors) {
        if (selector.length === 0 || isSelectorVisible(document, node.id, selector)) {
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

    for (const output of node.outputs) {
      if (output.key.trim().length === 0) {
        pushFieldIssue(
          issues,
          node,
          'config.output_contract',
          '输出变量名未配置',
          '输出契约中的变量名不能为空。'
        );
        continue;
      }

      if (seenOutputKeys.has(output.key)) {
        pushFieldIssue(
          issues,
          node,
          'config.output_contract',
          '输出契约重复',
          '输出契约中的变量名必须唯一'
        );
        continue;
      }

      seenOutputKeys.add(output.key);
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
