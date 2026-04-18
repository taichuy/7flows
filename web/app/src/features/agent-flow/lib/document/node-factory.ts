import type {
  FlowAuthoringDocument,
  FlowNodeDocument,
  FlowNodeType
} from '@1flowbase/flow-schema';

function humanizeNodeType(nodeType: FlowNodeType) {
  if (nodeType === 'llm') {
    return 'LLM';
  }

  return nodeType
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function defaultOutputs(nodeType: FlowNodeType): FlowNodeDocument['outputs'] {
  switch (nodeType) {
    case 'start':
      return [{ key: 'query', title: '用户输入', valueType: 'string' }];
    case 'llm':
      return [{ key: 'text', title: '模型输出', valueType: 'string' }];
    case 'answer':
      return [{ key: 'answer', title: '对话输出', valueType: 'string' }];
    case 'template_transform':
      return [{ key: 'text', title: '转换结果', valueType: 'string' }];
    case 'knowledge_retrieval':
      return [{ key: 'documents', title: '知识结果', valueType: 'array' }];
    case 'question_classifier':
      return [{ key: 'label', title: '分类标签', valueType: 'string' }];
    case 'if_else':
      return [{ key: 'result', title: '条件结果', valueType: 'boolean' }];
    case 'code':
      return [{ key: 'result', title: '代码结果', valueType: 'unknown' }];
    case 'http_request':
      return [{ key: 'body', title: '响应正文', valueType: 'json' }];
    case 'tool':
      return [{ key: 'result', title: '工具输出', valueType: 'unknown' }];
    case 'variable_assigner':
      return [{ key: 'state', title: '状态结果', valueType: 'json' }];
    case 'parameter_extractor':
      return [{ key: 'parameters', title: '提取参数', valueType: 'json' }];
    case 'iteration':
    case 'loop':
      return [{ key: 'result', title: '聚合输出', valueType: 'array' }];
    case 'human_input':
      return [{ key: 'input', title: '人工输入', valueType: 'string' }];
  }
}

function defaultConfig(nodeType: FlowNodeType): Record<string, unknown> {
  switch (nodeType) {
    case 'llm':
      return { model: '', temperature: 0.7 };
    case 'template_transform':
      return { template: '' };
    case 'knowledge_retrieval':
      return { top_k: 4 };
    case 'question_classifier':
      return { classes: [] };
    case 'if_else':
      return { mode: 'all' };
    case 'code':
      return { language: 'javascript' };
    case 'http_request':
      return { method: 'GET', url: '' };
    case 'tool':
      return { tool_name: '' };
    case 'variable_assigner':
      return { writes: [] };
    case 'parameter_extractor':
      return { schema: [] };
    case 'iteration':
      return { max_steps: 10 };
    case 'loop':
      return { max_rounds: 10 };
    default:
      return {};
  }
}

export function createNodeDocument(
  nodeType: FlowNodeType,
  id: string,
  x = 0,
  y = 0
): FlowNodeDocument {
  return {
    id,
    type: nodeType,
    alias: humanizeNodeType(nodeType),
    description: '',
    containerId: null,
    position: { x, y },
    configVersion: 1,
    config: defaultConfig(nodeType),
    bindings: {},
    outputs: defaultOutputs(nodeType)
  };
}

export function createNextNodeId(
  documentOrIds: FlowAuthoringDocument | string[],
  nodeType: FlowNodeType
) {
  const ids = Array.isArray(documentOrIds)
    ? documentOrIds
    : documentOrIds.graph.nodes.map((node) => node.id);
  const prefix = `node-${nodeType.replaceAll('_', '-')}`;
  let nextIndex = 1;

  while (ids.includes(`${prefix}-${nextIndex}`)) {
    nextIndex += 1;
  }

  return `${prefix}-${nextIndex}`;
}
