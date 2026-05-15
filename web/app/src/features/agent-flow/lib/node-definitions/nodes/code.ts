import { basicFields } from '../base';
import type { NodeDefinition } from '../types';

export const codeNodeDefinition: NodeDefinition = {
  label: 'Code',
  sections: [
    {
      key: 'basics',
      title: 'Basics',
      fields: basicFields
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
      key: 'advanced',
      title: 'Advanced',
      fields: [
        {
          key: 'config.language',
          label: '运行语言',
          editor: 'static_select',
          required: true,
          options: [{ label: 'JavaScript', value: 'javascript' }]
        },
        {
          key: 'config.output_contract',
          label: '输出契约',
          editor: 'output_contract_definition'
        }
      ]
    }
  ]
};
