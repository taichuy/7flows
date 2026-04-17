export interface LlmModelOption {
  value: string;
  label: string;
  provider: 'openai';
  tag?: string;
}

export const llmModelOptions: LlmModelOption[] = [
  { value: 'gpt-4', label: 'gpt-4', provider: 'openai', tag: 'CHAT' },
  { value: 'gpt-5-chat-latest', label: 'gpt-5-chat-latest', provider: 'openai' },
  { value: 'gpt-5.1', label: 'gpt-5.1', provider: 'openai' },
  { value: 'gpt-5.2', label: 'gpt-5.2', provider: 'openai' },
  { value: 'gpt-5', label: 'gpt-5', provider: 'openai' },
  { value: 'gpt-5-mini', label: 'gpt-5-mini', provider: 'openai' },
  { value: 'gpt-5-nano', label: 'gpt-5-nano', provider: 'openai' },
  { value: 'gpt-4.1', label: 'gpt-4.1', provider: 'openai' },
  { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'gpt-4o-mini', provider: 'openai', tag: 'CHAT' }
];

export function findLlmModelOption(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return llmModelOptions.find((option) => option.value === value) ?? {
    value,
    label: value,
    provider: 'openai' as const
  };
}
