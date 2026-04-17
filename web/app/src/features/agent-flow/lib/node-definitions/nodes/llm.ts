import { basicFields } from '../base';
import type { NodeDefinition } from '../types';

export const llmNodeDefinition: NodeDefinition = {
  label: 'LLM',
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
        { key: 'config.model', label: '模型', editor: 'llm_model', required: true },
        {
          key: 'bindings.system_prompt',
          label: 'System Prompt',
          editor: 'templated_text'
        },
        {
          key: 'bindings.user_prompt',
          label: 'User Prompt',
          editor: 'templated_text',
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
};
