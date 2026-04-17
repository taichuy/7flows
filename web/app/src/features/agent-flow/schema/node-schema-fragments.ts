import type { FlowNodeType } from '@1flowse/flow-schema';

import type {
  SchemaBlock,
  SchemaFieldBlock,
  SchemaSectionBlock
} from '../../../shared/schema-ui/contracts/canvas-node-schema';
import {
  getNodeDefinitionSections,
  type NodeDefinitionField,
  type NodeEditorKind
} from '../lib/node-definitions';

const FIELD_RENDERER_BY_EDITOR: Record<NodeEditorKind, string> = {
  text: 'text',
  number: 'number',
  selector: 'selector',
  selector_list: 'selector_list',
  templated_text: 'templated_text',
  named_bindings: 'named_bindings',
  condition_group: 'condition_group',
  state_write: 'state_write',
  output_contract_definition: 'output_contract_definition'
};

function createFieldBlock(field: NodeDefinitionField): SchemaFieldBlock {
  return {
    kind: 'field',
    renderer: FIELD_RENDERER_BY_EDITOR[field.editor],
    path: field.key,
    label: field.label
  };
}

function createSectionBlock(title: string, fields: NodeDefinitionField[]): SchemaSectionBlock {
  return {
    kind: 'section',
    title,
    blocks: fields.map(createFieldBlock)
  };
}

export function buildNodeDetailHeaderBlocks(): SchemaBlock[] {
  return [
    { kind: 'field', renderer: 'header_alias', path: 'alias', label: '节点别名' },
    {
      kind: 'field',
      renderer: 'header_description',
      path: 'description',
      label: '节点简介'
    }
  ];
}

export function buildNodeCardBlocks(nodeType: FlowNodeType): SchemaBlock[] {
  return [
    {
      kind: 'view',
      renderer: 'card_eyebrow',
      key: `${nodeType}-eyebrow`
    },
    {
      kind: 'view',
      renderer: 'card_title',
      key: `${nodeType}-title`
    },
    {
      kind: 'view',
      renderer: 'card_description',
      key: `${nodeType}-description`
    }
  ];
}

export function buildCommonConfigBlocks(nodeType: FlowNodeType): SchemaBlock[] {
  const definitionSections = getNodeDefinitionSections(nodeType)
    .filter((section) => section.key !== 'basics' && section.key !== 'outputs')
    .map((section) => createSectionBlock(section.title, section.fields));
  const policyBlocks: SchemaBlock[] =
    nodeType === 'start'
      ? []
      : [{ kind: 'view', renderer: 'policy_group', title: '策略' }];

  return [
    ...definitionSections,
    { kind: 'view', renderer: 'output_contract', title: '输出契约' },
    ...policyBlocks,
    { kind: 'view', renderer: 'relations', title: '关系' }
  ];
}

export function buildCommonLastRunBlocks(): SchemaBlock[] {
  return [
    { kind: 'view', renderer: 'runtime_summary', title: '运行摘要' },
    { kind: 'view', renderer: 'runtime_io', title: '运行输入输出' },
    { kind: 'view', renderer: 'runtime_metadata', title: '运行元数据' }
  ];
}

export function buildNodeRuntimeSlots() {
  return {
    summary: 'summary',
    output_contract: 'output_contract',
    policy_group: 'policy_group',
    relations: 'relations',
    runtime_summary: 'runtime_summary',
    runtime_io: 'runtime_io',
    runtime_metadata: 'runtime_metadata'
  } as const;
}
