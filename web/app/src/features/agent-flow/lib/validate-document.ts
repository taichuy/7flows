import type { FlowAuthoringDocument } from '@1flowse/flow-schema';
import type { FlowBinding, FlowNodeDocument } from '@1flowse/flow-schema';

import type { InspectorSectionKey } from './node-definitions';
import { findInspectorSectionKey, nodeDefinitions } from './node-definitions';
import { isSelectorVisible } from './selector-options';

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
      return [];
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
  message: string
) {
  issues.push({
    id: `${node.id}-${fieldKey}-${issues.length}`,
    scope: 'field',
    level: 'error',
    nodeId: node.id,
    sectionKey: findInspectorSectionKey(node.type, fieldKey),
    fieldKey,
    title,
    message
  });
}

export function validateDocument(document: FlowAuthoringDocument): AgentFlowIssue[] {
  const issues: AgentFlowIssue[] = [];
  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  const startNodes = document.graph.nodes.filter((node) => node.type === 'start');
  const answerNodes = document.graph.nodes.filter((node) => node.type === 'answer');

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
            pushFieldIssue(
              issues,
              node,
              field.key,
              node.type === 'llm' && field.key === 'config.model'
                ? 'LLM 缺少模型'
                : `${field.label} 未配置`,
              `请先完善 ${field.label}。`
            );
          }
        }
      }
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
