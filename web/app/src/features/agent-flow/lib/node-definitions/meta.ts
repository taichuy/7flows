import type { NodeDefinitionMetaMap } from './types';

export const nodeDefinitionMeta: NodeDefinitionMetaMap = {
  start: {
    summary: '定义工作流入口并产出初始用户输入。',
    helpHref: '/docs/agentflow/nodes/start'
  },
  answer: {
    summary: '向最终用户输出本轮工作流的回复结果。',
    helpHref: '/docs/agentflow/nodes/answer'
  },
  llm: {
    summary: '调用大语言模型生成文本结果。',
    helpHref: '/docs/agentflow/nodes/llm'
  },
  knowledge_retrieval: {
    summary: '根据输入问题检索知识库并返回文档结果。',
    helpHref: '/docs/agentflow/nodes/knowledge-retrieval'
  },
  question_classifier: {
    summary: '对问题进行分类并输出命中的标签。',
    helpHref: '/docs/agentflow/nodes/question-classifier'
  },
  if_else: {
    summary: '根据条件判断决定当前节点输出结果。',
    helpHref: '/docs/agentflow/nodes/if-else'
  },
  code: {
    summary: '执行自定义代码并返回结构化结果。',
    helpHref: '/docs/agentflow/nodes/code'
  },
  template_transform: {
    summary: '基于模板和输入变量生成转换结果。',
    helpHref: '/docs/agentflow/nodes/template-transform'
  },
  http_request: {
    summary: '请求外部 HTTP 服务并读取响应数据。',
    helpHref: '/docs/agentflow/nodes/http-request'
  },
  tool: {
    summary: '调用外部工具能力并返回工具执行结果。',
    helpHref: '/docs/agentflow/nodes/tool'
  },
  variable_assigner: {
    summary: '把上游数据写入或更新到工作流状态。',
    helpHref: '/docs/agentflow/nodes/variable-assigner'
  },
  parameter_extractor: {
    summary: '从文本中提取结构化参数结果。',
    helpHref: '/docs/agentflow/nodes/parameter-extractor'
  },
  iteration: {
    summary: '对输入集合执行逐项迭代并汇总结果。',
    helpHref: '/docs/agentflow/nodes/iteration',
    canEnterContainer: true
  },
  loop: {
    summary: '按条件循环执行容器内子流程。',
    helpHref: '/docs/agentflow/nodes/loop',
    canEnterContainer: true
  },
  human_input: {
    summary: '等待人工补充输入后继续流程。',
    helpHref: '/docs/agentflow/nodes/human-input'
  },
  plugin_node: {
    summary: '执行来自 capability plugin 的声明式节点贡献。',
    helpHref: null
  }
};
