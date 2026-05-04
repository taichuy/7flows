export const FLOW_SCHEMA_VERSION = '1flowbase.flow/v1';

export type BuiltinFlowNodeType =
  | 'start'
  | 'answer'
  | 'llm'
  | 'knowledge_retrieval'
  | 'question_classifier'
  | 'if_else'
  | 'code'
  | 'template_transform'
  | 'http_request'
  | 'tool'
  | 'data_model_list'
  | 'data_model_get'
  | 'data_model_create'
  | 'data_model_update'
  | 'data_model_delete'
  | 'variable_assigner'
  | 'parameter_extractor'
  | 'iteration'
  | 'loop'
  | 'human_input';

export type FlowNodeType = BuiltinFlowNodeType | 'plugin_node';

export type FlowStartInputType =
  | 'text'
  | 'paragraph'
  | 'select'
  | 'number'
  | 'checkbox'
  | 'file'
  | 'file_list'
  | 'url';

export interface FlowStartInputField {
  key: string;
  label: string;
  inputType: FlowStartInputType;
  valueType: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  maxLength?: number;
  hidden?: boolean;
  options?: string[];
}

export interface FlowNodeOutputDocument {
  key: string;
  title: string;
  valueType: string;
}

export const DEFAULT_LLM_NODE_OUTPUTS = [
  { key: 'text', title: '模型输出', valueType: 'string' },
  { key: 'reasoning_content', title: '推理内容', valueType: 'string' },
  { key: 'usage', title: '模型用量', valueType: 'json' }
] satisfies FlowNodeOutputDocument[];

export interface FlowPluginContributionRef {
  plugin_id: string;
  plugin_version: string;
  contribution_code: string;
  node_shell: string;
  schema_version: string;
}

export type LlmPromptMessageRole = 'system' | 'user' | 'assistant';

export interface LlmPromptMessage {
  id: string;
  role: LlmPromptMessageRole;
  content: {
    kind: 'templated_text';
    value: string;
  };
}

export type DataModelQueryOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export type DataModelQueryValue =
  | { kind: 'constant'; value: unknown }
  | { kind: 'selector'; selector: string[] };

export interface DataModelQueryFilter {
  field_code: string;
  operator: DataModelQueryOperator;
  value: DataModelQueryValue;
}

export interface DataModelQuerySort {
  field_code: string;
  direction: 'asc' | 'desc';
}

export interface DataModelQueryBindingValue {
  filters: DataModelQueryFilter[];
  sorts: DataModelQuerySort[];
  expand_relations: string[];
  page: DataModelQueryValue;
  page_size: DataModelQueryValue;
}

export type FlowBinding =
  | { kind: 'templated_text'; value: string }
  | { kind: 'selector'; value: string[] }
  | { kind: 'selector_list'; value: string[][] }
  | {
      kind: 'data_model_query';
      value: DataModelQueryBindingValue;
    }
  | {
      kind: 'prompt_messages';
      value: LlmPromptMessage[];
    }
  | {
      kind: 'named_bindings';
      value: Array<{ name: string; selector: string[] }>;
    }
  | {
      kind: 'condition_group';
      value: {
        operator: 'and' | 'or';
        conditions: Array<{
          left: string[];
          comparator: 'exists' | 'equals' | 'contains';
          right?: string | string[];
        }>;
      };
    }
  | {
      kind: 'state_write';
      value: Array<{
        path: string[];
        operator: 'set' | 'append' | 'clear' | 'increment';
        source: string[] | null;
      }>;
    };

export interface FlowNodeDocument {
  id: string;
  type: FlowNodeType;
  plugin_id?: string;
  plugin_version?: string;
  contribution_code?: string;
  node_shell?: string;
  schema_version?: string;
  alias: string;
  description?: string;
  containerId: string | null;
  position: { x: number; y: number };
  configVersion: number;
  config: Record<string, unknown>;
  bindings: Record<string, FlowBinding>;
  outputs: FlowNodeOutputDocument[];
}

export interface FlowEdgeDocument {
  id: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  containerId: string | null;
  points: Array<{ x: number; y: number }>;
}

export interface FlowAnnotationDocument {
  id: string;
  kind: 'note';
  text: string;
  position: { x: number; y: number };
}

export interface FlowAuthoringDocument {
  schemaVersion: typeof FLOW_SCHEMA_VERSION;
  meta: {
    flowId: string;
    name: string;
    description: string;
    tags: string[];
  };
  graph: {
    nodes: FlowNodeDocument[];
    edges: FlowEdgeDocument[];
  };
  editor: {
    viewport: { x: number; y: number; zoom: number };
    annotations: FlowAnnotationDocument[];
    activeContainerPath: string[];
  };
}

export function createDefaultAgentFlowDocument({
  flowId
}: {
  flowId: string;
}): FlowAuthoringDocument {
  return {
    schemaVersion: FLOW_SCHEMA_VERSION,
    meta: {
      flowId,
      name: 'Untitled agentFlow',
      description: '',
      tags: []
    },
    graph: {
      nodes: [
        {
          id: 'node-start',
          type: 'start',
          alias: 'Start',
          description: '',
          containerId: null,
          position: { x: 80, y: 220 },
          configVersion: 1,
          config: { input_fields: [] },
          bindings: {},
          outputs: []
        },
        {
          id: 'node-llm',
          type: 'llm',
          alias: 'LLM',
          description: '',
          containerId: null,
          position: { x: 360, y: 220 },
          configVersion: 1,
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
                },
                {
                  id: 'user-1',
                  role: 'user',
                  content: {
                    kind: 'templated_text',
                    value: '{{node-start.query}}'
                  }
                }
              ]
            }
          },
          outputs: DEFAULT_LLM_NODE_OUTPUTS.map((output) => ({ ...output }))
        },
        {
          id: 'node-answer',
          type: 'answer',
          alias: 'Answer',
          description: '',
          containerId: null,
          position: { x: 640, y: 220 },
          configVersion: 1,
          config: {},
          bindings: {
            answer_template: {
              kind: 'templated_text',
              value: '{{node-llm.text}}'
            }
          },
          outputs: [{ key: 'answer', title: '对话输出', valueType: 'string' }]
        }
      ],
      edges: [
        {
          id: 'edge-start-llm',
          source: 'node-start',
          target: 'node-llm',
          sourceHandle: null,
          targetHandle: null,
          containerId: null,
          points: []
        },
        {
          id: 'edge-llm-answer',
          source: 'node-llm',
          target: 'node-answer',
          sourceHandle: null,
          targetHandle: null,
          containerId: null,
          points: []
        }
      ]
    },
    editor: {
      viewport: { x: 0, y: 0, zoom: 1 },
      annotations: [],
      activeContainerPath: []
    }
  };
}

function omitKey<T extends object, K extends keyof T>(
  value: T,
  key: K
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([entryKey]) => entryKey !== String(key))
  ) as Omit<T, K>;
}

function stripLayout(document: FlowAuthoringDocument) {
  return {
    ...document,
    graph: {
      nodes: document.graph.nodes.map((node) => omitKey(node, 'position')),
      edges: document.graph.edges.map((edge) => omitKey(edge, 'points'))
    },
    editor: {
      ...document.editor,
      viewport: { x: 0, y: 0, zoom: 1 },
      annotations: document.editor.annotations.map((annotation) =>
        omitKey(annotation, 'position')
      )
    }
  };
}

export function classifyDocumentChange(
  before: FlowAuthoringDocument,
  after: FlowAuthoringDocument
): 'layout' | 'logical' {
  return JSON.stringify(stripLayout(before)) ===
    JSON.stringify(stripLayout(after))
    ? 'layout'
    : 'logical';
}
