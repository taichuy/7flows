import type { FlowNodeType } from '@1flowse/flow-schema';

export type InspectorSectionKey =
  | 'basics'
  | 'inputs'
  | 'outputs'
  | 'policy'
  | 'advanced';

export type NodeEditorKind =
  | 'text'
  | 'llm_model'
  | 'number'
  | 'selector'
  | 'selector_list'
  | 'templated_text'
  | 'named_bindings'
  | 'condition_group'
  | 'state_write'
  | 'output_contract_definition';

export interface NodeDefinitionField {
  key: string;
  label: string;
  editor: NodeEditorKind;
  required?: boolean;
}

export interface NodeDefinitionSection {
  key: InspectorSectionKey;
  title: string;
  fields: NodeDefinitionField[];
}

export interface NodeDefinition {
  label: string;
  summary?: string;
  helpHref?: string | null;
  canEnterContainer?: boolean;
  sections: NodeDefinitionSection[];
}

export interface NodeDefinitionMeta {
  summary: string;
  helpHref: string | null;
  canEnterContainer?: boolean;
}

export type NodeDefinitionMap = Partial<Record<FlowNodeType, NodeDefinition>>;
export type NodeDefinitionMetaMap = Record<FlowNodeType, NodeDefinitionMeta>;
