import type {
  FlowBinding,
  FlowNodeOutputDocument,
  FlowNodeType,
  NodeRuntimePanelFieldDocument,
  NodeRuntimePanelSectionDocument,
  NodeRuntimeUiContract
} from '@1flowbase/flow-schema';
import {
  NODE_CONTRIBUTION_SCHEMA_VERSION,
  getLlmNodeOutputs
} from '@1flowbase/flow-schema';

import {
  getDataModelNodeDefaultConfig,
  getDataModelNodeOutputs,
  getDataModelActionForNodeType
} from './nodes/data-model';

type BuiltinNodeRuntimeContractType = FlowNodeType;
type ContractCategory = 'io' | 'generation' | 'control' | 'data' | 'external';

const DEFAULT_RUNTIME_POLICY = {
  sideEffect: 'none' as const
};

const COMMON_RUNTIME_INPUTS = [
  { key: 'input_payload', title: 'Input Payload', valueType: 'json' }
];

function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

function duplicateOutput(
  output: FlowNodeOutputDocument
): FlowNodeOutputDocument {
  return { ...output };
}

function duplicateOutputs(outputs: FlowNodeOutputDocument[]) {
  return outputs.map(duplicateOutput);
}

function duplicateContractDefaults(contract: NodeRuntimeUiContract['defaults']) {
  return {
    ...contract,
    config: cloneJsonValue(contract.config),
    bindings: cloneJsonValue(contract.bindings),
    outputs: duplicateOutputs(contract.outputs)
  };
}

function duplicateContract(contract: NodeRuntimeUiContract): NodeRuntimeUiContract {
  return {
    ...contract,
    meta: { ...contract.meta },
    defaults: duplicateContractDefaults(contract.defaults),
    ports: {
      inputs: contract.ports.inputs.map((port) => ({ ...port })),
      outputs: contract.ports.outputs.map((port) => ({ ...port }))
    },
    card: { ...contract.card },
    panel: {
      sections: cloneJsonValue(contract.panel.sections)
    },
    runtime: {
      inputs: contract.runtime.inputs?.map((item) => ({ ...item })),
      processData: contract.runtime.processData?.map((item) => ({ ...item })),
      outputs: duplicateOutputs(contract.runtime.outputs)
    },
    policies: cloneJsonValue(contract.policies)
  };
}

function createContractDefaults({
  alias,
  description,
  config,
  bindings,
  outputs
}: {
  alias: string;
  description: string;
  config: Record<string, unknown>;
  bindings: Record<string, FlowBinding>;
  outputs: FlowNodeOutputDocument[];
}) {
  return {
    alias,
    description,
    configVersion: 1,
    config,
    bindings,
    outputs
  };
}

function createContractPorts(outputs: FlowNodeOutputDocument[]) {
  return {
    inputs: [],
    outputs: outputs.map((output) => ({
      key: output.key,
      title: output.title,
      valueType: output.valueType
    }))
  };
}

function panelField({
  key,
  title,
  renderer,
  valueType = 'string',
  required,
  description,
  options
}: Omit<NodeRuntimePanelFieldDocument, 'valueType'> & {
  valueType?: string;
}) {
  return {
    key,
    title,
    renderer,
    valueType,
    required,
    description,
    options
  } satisfies NodeRuntimePanelFieldDocument;
}

function panelSection(
  key: string,
  title: string,
  fields: NodeRuntimePanelFieldDocument[]
): NodeRuntimePanelSectionDocument {
  return {
    key,
    title,
    fields
  };
}

const basicsPanelSection = panelSection('basics', 'Basics', [
  panelField({ key: 'alias', title: '节点别名', renderer: 'text', required: true }),
  panelField({ key: 'description', title: '节点简介', renderer: 'text' })
]);

function outputsPanelSection(outputs: FlowNodeOutputDocument[]) {
  return panelSection(
    'outputs',
    'Outputs',
    outputs.map((output) =>
      panelField({
        key: `outputs.${output.key}`,
        title: output.title,
        renderer: 'text',
        valueType: output.valueType,
        required: true
      })
    )
  );
}

function createNodeRuntimeContract({
  type,
  title,
  description,
  category,
  config,
  bindings = {},
  outputs,
  panelSections,
  runtimeOutputs
}: {
  type: BuiltinNodeRuntimeContractType;
  title: string;
  description: string;
  category: ContractCategory;
  config: Record<string, unknown>;
  bindings?: Record<string, FlowBinding>;
  outputs: FlowNodeOutputDocument[];
  panelSections: NodeRuntimePanelSectionDocument[];
  runtimeOutputs?: FlowNodeOutputDocument[];
}): NodeRuntimeUiContract {
  return {
    meta: {
      type,
      title,
      schemaVersion: NODE_CONTRIBUTION_SCHEMA_VERSION
    },
    defaults: createContractDefaults({
      alias: title,
      description,
      config,
      bindings,
      outputs: duplicateOutputs(outputs)
    }),
    ports: createContractPorts(outputs),
    card: {
      title,
      description,
      category
    },
    panel: {
      sections: cloneJsonValue(panelSections)
    },
    runtime: {
      inputs: COMMON_RUNTIME_INPUTS.map((item) => ({ ...item })),
      outputs: duplicateOutputs(runtimeOutputs ?? outputs)
    },
    policies: DEFAULT_RUNTIME_POLICY
  };
}

function createStartContract(): NodeRuntimeUiContract {
  return createNodeRuntimeContract({
    type: 'start',
    title: 'Start',
    description: '工作流入口。',
    category: 'io',
    config: { input_fields: [], model_list: [] },
    outputs: [],
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', '输入字段', [
        panelField({
          key: 'config.input_fields',
          title: '输入字段',
          renderer: 'start_input_fields',
          valueType: 'array'
        })
      ]),
      panelSection('advanced', '模型列表', [
        panelField({
          key: 'config.model_list',
          title: '模型列表',
          renderer: 'start_model_list',
          valueType: 'array'
        })
      ])
    ]
  });
}

function createLlmContract(): NodeRuntimeUiContract {
  const outputs = getLlmNodeOutputs({ response_format: { mode: 'text' } });

  return createNodeRuntimeContract({
    type: 'llm',
    title: 'LLM',
    description: '调用语言模型生成文本。',
    category: 'generation',
    config: {
      model_provider: {
        provider_code: '',
        source_instance_id: '',
        model_id: ''
      },
      llm_parameters: {
        schema_version: '1.0.0',
        items: {}
      },
      response_format: {
        mode: 'text'
      }
    },
    bindings: {
      prompt_messages: {
        kind: 'prompt_messages',
        value: [
          {
            id: 'system-1',
            role: 'system',
            content: { kind: 'templated_text', value: '' }
          }
        ]
      }
    },
    outputs,
    runtimeOutputs: outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'config.model_provider',
          title: '模型',
          renderer: 'llm_model',
          valueType: 'json',
          required: true
        }),
        panelField({
          key: 'bindings.prompt_messages',
          title: '上下文',
          renderer: 'llm_prompt_messages',
          valueType: 'array'
        })
      ]),
      outputsPanelSection(outputs),
      panelSection('advanced', 'Advanced', [
        panelField({
          key: 'config.response_format',
          title: '返回格式',
          renderer: 'llm_response_format',
          valueType: 'json'
        })
      ])
    ]
  });
}

function createAnswerContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'answer', title: '对话输出', valueType: 'string' }];

  return createNodeRuntimeContract({
    type: 'answer',
    title: 'Answer',
    description: '向用户返回最终文本结果。',
    category: 'io',
    config: {},
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.answer_template',
          title: '回复内容',
          renderer: 'templated_text',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createKnowledgeRetrievalContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'documents', title: '知识结果', valueType: 'array' }];

  return createNodeRuntimeContract({
    type: 'knowledge_retrieval',
    title: 'Knowledge Retrieval',
    description: '根据输入问题检索知识库并返回文档结果。',
    category: 'generation',
    config: { top_k: 4 },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.query',
          title: '检索问题',
          renderer: 'selector',
          required: true
        })
      ]),
      outputsPanelSection(outputs),
      panelSection('policy', 'Policy', [
        panelField({
          key: 'config.top_k',
          title: 'Top K',
          renderer: 'number',
          valueType: 'number'
        })
      ])
    ]
  });
}

function createQuestionClassifierContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'label', title: '分类标签', valueType: 'string' }];

  return createNodeRuntimeContract({
    type: 'question_classifier',
    title: 'Question Classifier',
    description: '对问题进行分类并输出命中的标签。',
    category: 'control',
    config: { classes: [] },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.question',
          title: '待分类问题',
          renderer: 'selector',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createIfElseContract(): NodeRuntimeUiContract {
  return createNodeRuntimeContract({
    type: 'if_else',
    title: 'If / Else',
    description: '按条件判断选择路径。',
    category: 'control',
    config: { mode: 'all' },
    outputs: [],
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.condition_group',
          title: '条件组',
          renderer: 'condition_group',
          valueType: 'json',
          required: true
        })
      ]),
      outputsPanelSection([])
    ]
  });
}

function createCodeContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'result', title: '代码结果', valueType: 'unknown' }];

  return createNodeRuntimeContract({
    type: 'code',
    title: 'Code',
    description: '执行自定义代码并返回结构化结果。',
    category: 'data',
    config: { language: 'javascript' },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.named_bindings',
          title: '输入变量',
          renderer: 'named_bindings',
          valueType: 'json'
        })
      ]),
      panelSection('advanced', 'Advanced', [
        panelField({
          key: 'config.language',
          title: '运行语言',
          renderer: 'static_select',
          options: [
            {
              value: 'javascript',
              label: 'JavaScript'
            }
          ],
          required: true
        }),
        panelField({
          key: 'config.output_contract',
          title: '输出契约',
          renderer: 'output_contract_definition',
          valueType: 'array'
        })
      ])
    ]
  });
}

function createTemplateTransformContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'text', title: '转换结果', valueType: 'string' }];

  return createNodeRuntimeContract({
    type: 'template_transform',
    title: 'Template Transform',
    description: '模板输出转换。',
    category: 'generation',
    config: { template: '' },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.template',
          title: '模板',
          renderer: 'templated_text',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createHttpRequestContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'body', title: '响应正文', valueType: 'json' }];

  return createNodeRuntimeContract({
    type: 'http_request',
    title: 'HTTP Request',
    description: '请求外部 HTTP 服务。',
    category: 'external',
    config: { method: 'GET', url: '' },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'config.url',
          title: 'URL',
          renderer: 'templated_text',
          required: true
        }),
        panelField({
          key: 'bindings.body',
          title: '请求体',
          renderer: 'templated_text'
        })
      ]),
      outputsPanelSection(outputs),
      panelSection('policy', 'Policy', [
        panelField({
          key: 'config.method',
          title: 'Method',
          renderer: 'text'
        })
      ])
    ]
  });
}

function createToolContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'result', title: '工具输出', valueType: 'unknown' }];

  return createNodeRuntimeContract({
    type: 'tool',
    title: 'Tool',
    description: '调用已接入的工具能力。',
    category: 'external',
    config: { tool_name: '' },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'config.tool_name',
          title: '工具名称',
          renderer: 'text',
          required: true
        }),
        panelField({
          key: 'bindings.parameters',
          title: '工具入参',
          renderer: 'named_bindings',
          valueType: 'json'
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createPluginNodeContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'result', title: '节点输出', valueType: 'json' }];

  return createNodeRuntimeContract({
    type: 'plugin_node',
    title: 'Plugin Node',
    description: '来自插件的声明式节点占位。',
    category: 'external',
    config: {},
    outputs,
    panelSections: [
      basicsPanelSection,
      outputsPanelSection(outputs)
    ]
  });
}

function createVariableAssignerContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'state', title: '状态结果', valueType: 'json' }];

  return createNodeRuntimeContract({
    type: 'variable_assigner',
    title: 'Variable Assigner',
    description: '设置或更新流程变量。',
    category: 'data',
    config: { writes: [] },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.operations',
          title: '变量操作',
          renderer: 'state_write',
          valueType: 'array',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createParameterExtractorContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'parameters', title: '提取参数', valueType: 'json' }];

  return createNodeRuntimeContract({
    type: 'parameter_extractor',
    title: 'Parameter Extractor',
    description: '从文本中提取结构化参数结果。',
    category: 'data',
    config: { schema: [] },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.source_text',
          title: '源文本',
          renderer: 'selector',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createIterationContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'result', title: '聚合输出', valueType: 'array' }];

  return createNodeRuntimeContract({
    type: 'iteration',
    title: 'Iteration',
    description: '遍历列表并处理每一项。',
    category: 'control',
    config: { max_steps: 10 },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.items',
          title: '循环列表',
          renderer: 'selector',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createLoopContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'result', title: '聚合输出', valueType: 'array' }];

  return createNodeRuntimeContract({
    type: 'loop',
    title: 'Loop',
    description: '按条件重复执行节点。',
    category: 'control',
    config: { max_rounds: 10 },
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'bindings.entry_condition',
          title: '入口条件',
          renderer: 'condition_group',
          valueType: 'json',
          required: true
        })
      ]),
      panelSection('policy', 'Policy', [
        panelField({
          key: 'config.max_rounds',
          title: '最大轮数',
          renderer: 'number',
          valueType: 'number'
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

function createHumanInputContract(): NodeRuntimeUiContract {
  const outputs = [{ key: 'input', title: '人工输入', valueType: 'string' }];

  return createNodeRuntimeContract({
    type: 'human_input',
    title: 'Human Input',
    description: '等待人工输入。',
    category: 'io',
    config: {},
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', [
        panelField({
          key: 'config.prompt',
          title: '等待问题',
          renderer: 'templated_text',
          required: true
        })
      ]),
      outputsPanelSection(outputs)
    ]
  });
}

type BuiltinDataModelRuntimeContractType =
  | 'data_model_list'
  | 'data_model_get'
  | 'data_model_create'
  | 'data_model_update'
  | 'data_model_delete';

const DATA_MODEL_NODE_TITLES = {
  data_model_list: 'Data Model List',
  data_model_get: 'Data Model Get',
  data_model_create: 'Data Model Create',
  data_model_update: 'Data Model Update',
  data_model_delete: 'Data Model Delete'
} satisfies Record<BuiltinDataModelRuntimeContractType, string>;

function createDataModelContract(
  nodeType: BuiltinDataModelRuntimeContractType
): NodeRuntimeUiContract {
  const action = getDataModelActionForNodeType(nodeType);

  if (!action) {
    throw new Error(`Unsupported Data Model node type: ${nodeType}`);
  }

  const outputs = getDataModelNodeOutputs(action);
  const inputFields: NodeRuntimePanelFieldDocument[] = [
    panelField({
      key: 'config.data_model_code',
      title: 'Data Model',
      renderer: 'data_model',
      required: true
    })
  ];

  if (action === 'list') {
    inputFields.push(
      panelField({
        key: 'bindings.query',
        title: 'Query',
        renderer: 'data_model_query',
        valueType: 'json'
      })
    );
  }

  if (action === 'get' || action === 'update' || action === 'delete') {
    inputFields.push(
      panelField({
        key: 'bindings.record_id',
        title: 'Record ID',
        renderer: 'selector',
        required: true
      })
    );
  }

  if (action === 'create' || action === 'update') {
    inputFields.push(
      panelField({
        key: 'bindings.payload',
        title: 'Payload',
        renderer: 'named_bindings',
        valueType: 'json',
        required: true
      })
    );
  }

  if (action === 'create' || action === 'update' || action === 'delete') {
    inputFields.push(
      panelField({
        key: 'config.side_effect_policy',
        title: 'Side Effect Policy',
        renderer: 'static_select',
        required: true,
        options: [
          { label: 'Disabled', value: 'disabled' },
          { label: 'Confirm Each Run', value: 'confirm_each_run' },
          { label: 'Allow With Idempotency', value: 'allow_with_idempotency' }
        ]
      })
    );
  }

  return createNodeRuntimeContract({
    type: nodeType,
    title: DATA_MODEL_NODE_TITLES[nodeType],
    description: '数据模型操作节点。',
    category: 'data',
    config: getDataModelNodeDefaultConfig(nodeType),
    outputs,
    panelSections: [
      basicsPanelSection,
      panelSection('inputs', 'Inputs', inputFields),
      outputsPanelSection(outputs)
    ]
  });
}

export const builtinNodeRuntimeContractTypes = [
  'start',
  'answer',
  'llm',
  'knowledge_retrieval',
  'question_classifier',
  'if_else',
  'code',
  'template_transform',
  'http_request',
  'tool',
  'data_model_list',
  'data_model_get',
  'data_model_create',
  'data_model_update',
  'data_model_delete',
  'variable_assigner',
  'parameter_extractor',
  'iteration',
  'loop',
  'human_input',
  'plugin_node'
] as const;

export const BUILTIN_NODE_RUNTIME_CONTRACTS: Record<
  BuiltinNodeRuntimeContractType,
  NodeRuntimeUiContract
> = {
  start: createStartContract(),
  answer: createAnswerContract(),
  llm: createLlmContract(),
  knowledge_retrieval: createKnowledgeRetrievalContract(),
  question_classifier: createQuestionClassifierContract(),
  if_else: createIfElseContract(),
  code: createCodeContract(),
  template_transform: createTemplateTransformContract(),
  http_request: createHttpRequestContract(),
  tool: createToolContract(),
  data_model_list: createDataModelContract('data_model_list'),
  data_model_get: createDataModelContract('data_model_get'),
  data_model_create: createDataModelContract('data_model_create'),
  data_model_update: createDataModelContract('data_model_update'),
  data_model_delete: createDataModelContract('data_model_delete'),
  variable_assigner: createVariableAssignerContract(),
  parameter_extractor: createParameterExtractorContract(),
  iteration: createIterationContract(),
  loop: createLoopContract(),
  human_input: createHumanInputContract(),
  plugin_node: createPluginNodeContract()
};

export function getBuiltinNodeRuntimeContract(
  nodeType: FlowNodeType
): NodeRuntimeUiContract | null {
  const contract =
    BUILTIN_NODE_RUNTIME_CONTRACTS[nodeType as BuiltinNodeRuntimeContractType];

  return contract ? duplicateContract(contract) : null;
}

export type { BuiltinNodeRuntimeContractType };
