import { describe, expect, test } from 'vitest';

import {
  DEFAULT_LLM_PARAMETERS,
  getLlmModelProvider,
  getLlmParameters
} from '../lib/llm-node-config';

describe('llm-node-config', () => {
  test('getLlmModelProvider only reads the current model_provider contract', () => {
    expect(
      getLlmModelProvider({
        provider_code: 'legacy_provider',
        model: 'legacy-model',
        protocol: 'legacy'
      })
    ).toEqual({
      provider_code: '',
      model_id: '',
      protocol: undefined,
      provider_label: undefined,
      model_label: undefined,
      schema_fetched_at: undefined
    });
  });

  test('getLlmParameters ignores legacy flat parameter fields', () => {
    expect(
      getLlmParameters({
        temperature: 0.7,
        top_p_enabled: true,
        top_p: 0.9,
        max_tokens_enabled: true,
        max_tokens: 1024
      })
    ).toEqual(DEFAULT_LLM_PARAMETERS);
  });
});
