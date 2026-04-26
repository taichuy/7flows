import { describe, expect, test } from 'vitest';

import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

import { buildNodeDebugPreviewPlan } from '../api/runtime';

describe('node debug preview input', () => {
  test('builds node preview input from cached referenced variables', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    expect(
      buildNodeDebugPreviewPlan(document, 'node-llm', {
        'node-start': {
          query: '请总结退款政策'
        }
      })
    ).toEqual({
      input_payload: {
        'node-start': {
          query: '请总结退款政策'
        }
      },
      missing_fields: []
    });
  });

  test('reports missing node preview variables instead of using placeholders', () => {
    const document = createDefaultAgentFlowDocument({ flowId: 'flow-1' });

    expect(buildNodeDebugPreviewPlan(document, 'node-llm')).toEqual({
      input_payload: {},
      missing_fields: [
        expect.objectContaining({
          nodeId: 'node-start',
          key: 'query',
          title: 'userinput.query',
          valueType: 'string'
        })
      ]
    });
  });
});
