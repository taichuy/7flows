import type {
  FlowNodeDocument,
  FlowNodeOutputDocument,
  FlowStartInputField,
  FlowStartInputType
} from '@1flowbase/flow-schema';

export const startInputTypeOptions = [
  { value: 'text', label: '文本', valueType: 'string' },
  { value: 'paragraph', label: '段落', valueType: 'string' },
  { value: 'select', label: '下拉选项', valueType: 'string' },
  { value: 'number', label: '数字', valueType: 'number' },
  { value: 'checkbox', label: '复选框', valueType: 'boolean' },
  { value: 'file', label: '文件', valueType: 'json' },
  { value: 'file_list', label: '文件列表', valueType: 'array' },
  { value: 'url', label: 'URL', valueType: 'string' }
] satisfies Array<{
  value: FlowStartInputType;
  label: string;
  valueType: FlowNodeOutputDocument['valueType'];
}>;

export const startSystemVariables = [
  {
    key: 'query',
    title: 'userinput.query',
    valueType: 'string'
  },
  {
    key: 'files',
    title: 'userinput.files',
    valueType: 'array'
  }
] satisfies FlowNodeOutputDocument[];

function isStartInputType(value: unknown): value is FlowStartInputType {
  return startInputTypeOptions.some((option) => option.value === value);
}

export function getStartInputValueType(inputType: FlowStartInputType) {
  return (
    startInputTypeOptions.find((option) => option.value === inputType)
      ?.valueType ?? 'string'
  );
}

function normalizeString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : fallback;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function normalizeDefaultValue(value: unknown, inputType: FlowStartInputType) {
  switch (inputType) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
    case 'checkbox':
      return typeof value === 'boolean' ? value : undefined;
    case 'file':
    case 'file_list':
      return undefined;
    case 'text':
    case 'paragraph':
    case 'select':
    case 'url':
      return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}

function normalizeMaxLength(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function normalizeOptions(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((option): option is string => typeof option === 'string')
        .map((option) => option.trim())
        .filter(Boolean)
    : undefined;
}

export function normalizeStartInputField(
  value: unknown,
  index: number
): FlowStartInputField {
  const source =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const inputType = isStartInputType(source.inputType)
    ? source.inputType
    : 'text';
  const key = normalizeString(source.key, `input_${index + 1}`);

  return {
    key,
    label: normalizeString(source.label, key),
    inputType,
    valueType: getStartInputValueType(inputType),
    required: Boolean(source.required),
    placeholder: normalizeOptionalString(source.placeholder),
    defaultValue: normalizeDefaultValue(source.defaultValue, inputType),
    maxLength: normalizeMaxLength(source.maxLength),
    hidden: Boolean(source.hidden),
    options: normalizeOptions(source.options)
  };
}

export function getStartInputFields(
  node: Pick<FlowNodeDocument, 'config'> | null | undefined
) {
  const rawFields = node?.config.input_fields;

  return Array.isArray(rawFields)
    ? rawFields.map((field, index) => normalizeStartInputField(field, index))
    : [];
}

export function getStartNodeVariableOutputs(
  node: Pick<FlowNodeDocument, 'config' | 'outputs'>
): FlowNodeOutputDocument[] {
  if (node.outputs.length > 0) {
    throw new Error('Start node outputs must be empty');
  }

  const fields = getStartInputFields(node).map((field) => ({
    key: field.key,
    title: `userinput.${field.key}`,
    valueType: field.valueType
  }));
  const usedKeys = new Set(fields.map((field) => field.key));

  return [
    ...fields,
    ...startSystemVariables.filter((variable) => !usedKeys.has(variable.key))
  ];
}

export function getNodeVariableOutputs(
  node: FlowNodeDocument
): FlowNodeOutputDocument[] {
  return node.type === 'start'
    ? getStartNodeVariableOutputs(node)
    : node.outputs;
}
