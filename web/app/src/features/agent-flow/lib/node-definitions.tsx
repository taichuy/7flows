import type { FlowNodeType } from '@1flowse/flow-schema';

export type InspectorSectionKey =
  | 'basics'
  | 'inputs'
  | 'outputs'
  | 'policy'
  | 'advanced';

export type NodeEditorKind =
  | 'text'
  | 'number'
  | 'selector'
  | 'selector_list'
  | 'templated_text'
  | 'named_bindings'
  | 'condition_group'
  | 'state_write';

export interface NodeDefinitionField {
  key: string;
  label: string;
  editor: NodeEditorKind;
  required?: boolean;
}

export interface NodeDefinition {
  label: string;
  sections: Array<{
    key: InspectorSectionKey;
    title: string;
    fields: NodeDefinitionField[];
  }>;
}

export const nodeDefinitions: Partial<Record<FlowNodeType, NodeDefinition>> = {
  start: {
    label: 'Start',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.query', label: '用户输入', editor: 'text', required: true }]
      }
    ]
  },
  answer: {
    label: 'Answer',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.answer_template',
            label: '回复内容',
            editor: 'selector',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.answer', label: '对话输出', editor: 'text', required: true }]
      }
    ]
  },
  llm: {
    label: 'LLM',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          { key: 'config.model', label: '模型', editor: 'text', required: true },
          {
            key: 'bindings.system_prompt',
            label: 'System Prompt',
            editor: 'templated_text'
          },
          {
            key: 'bindings.user_prompt',
            label: 'User Prompt',
            editor: 'selector',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.text', label: '模型输出', editor: 'text', required: true }]
      },
      {
        key: 'policy',
        title: 'Policy',
        fields: [{ key: 'config.temperature', label: '温度', editor: 'number' }]
      },
      {
        key: 'advanced',
        title: 'Advanced',
        fields: [{ key: 'config.max_tokens', label: '最大输出', editor: 'number' }]
      }
    ]
  },
  knowledge_retrieval: {
    label: 'Knowledge Retrieval',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          { key: 'bindings.query', label: '检索问题', editor: 'selector', required: true }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [
          {
            key: 'outputs.documents',
            label: '知识结果',
            editor: 'text',
            required: true
          }
        ]
      },
      {
        key: 'policy',
        title: 'Policy',
        fields: [{ key: 'config.top_k', label: 'Top K', editor: 'number' }]
      }
    ]
  },
  question_classifier: {
    label: 'Question Classifier',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.question',
            label: '待分类问题',
            editor: 'selector',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.label', label: '分类标签', editor: 'text', required: true }]
      }
    ]
  },
  if_else: {
    label: 'IfElse',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.condition_group',
            label: '条件组',
            editor: 'condition_group',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.result', label: '条件结果', editor: 'text', required: true }]
      }
    ]
  },
  code: {
    label: 'Code',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.named_bindings',
            label: '输入变量',
            editor: 'named_bindings'
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.result', label: '代码结果', editor: 'text', required: true }]
      },
      {
        key: 'advanced',
        title: 'Advanced',
        fields: [{ key: 'config.language', label: '运行语言', editor: 'text' }]
      }
    ]
  },
  template_transform: {
    label: 'Template Transform',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.template',
            label: '模板',
            editor: 'templated_text',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.text', label: '转换结果', editor: 'text', required: true }]
      }
    ]
  },
  http_request: {
    label: 'HTTP Request',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          { key: 'config.url', label: 'URL', editor: 'templated_text', required: true },
          { key: 'bindings.body', label: '请求体', editor: 'templated_text' }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.body', label: '响应正文', editor: 'text', required: true }]
      },
      {
        key: 'policy',
        title: 'Policy',
        fields: [{ key: 'config.method', label: 'Method', editor: 'text' }]
      }
    ]
  },
  tool: {
    label: 'Tool',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          { key: 'config.tool_name', label: '工具名称', editor: 'text', required: true },
          { key: 'bindings.parameters', label: '工具入参', editor: 'named_bindings' }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.result', label: '工具输出', editor: 'text', required: true }]
      }
    ]
  },
  variable_assigner: {
    label: 'Variable Assigner',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.operations',
            label: '变量操作',
            editor: 'state_write',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.state', label: '状态结果', editor: 'text', required: true }]
      }
    ]
  },
  parameter_extractor: {
    label: 'Parameter Extractor',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'bindings.source_text',
            label: '源文本',
            editor: 'selector',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [
          {
            key: 'outputs.parameters',
            label: '提取参数',
            editor: 'text',
            required: true
          }
        ]
      }
    ]
  },
  human_input: {
    label: 'Human Input',
    sections: [
      {
        key: 'basics',
        title: 'Basics',
        fields: [{ key: 'alias', label: '节点名称', editor: 'text', required: true }]
      },
      {
        key: 'inputs',
        title: 'Inputs',
        fields: [
          {
            key: 'config.prompt',
            label: '等待问题',
            editor: 'templated_text',
            required: true
          }
        ]
      },
      {
        key: 'outputs',
        title: 'Outputs',
        fields: [{ key: 'outputs.input', label: '人工输入', editor: 'text', required: true }]
      }
    ]
  }
};

export function findInspectorSectionKey(
  nodeType: FlowNodeType,
  fieldKey: string
): InspectorSectionKey | null {
  const definition = nodeDefinitions[nodeType];

  if (!definition) {
    return null;
  }

  for (const section of definition.sections) {
    if (section.fields.some((field) => field.key === fieldKey)) {
      return section.key;
    }
  }

  return null;
}
