import type { FlowNodeDocument } from '@1flowse/flow-schema';
import { Input, InputNumber } from 'antd';

import type {
  SchemaFieldRenderer,
  SchemaFieldRendererProps
} from '../../../shared/schema-ui/registry/create-renderer-registry';

import { ConditionGroupField } from '../components/bindings/ConditionGroupField';
import { NamedBindingsField } from '../components/bindings/NamedBindingsField';
import { SelectorField } from '../components/bindings/SelectorField';
import { StateWriteField } from '../components/bindings/StateWriteField';
import { TemplatedTextField } from '../components/bindings/TemplatedTextField';
import { OutputContractDefinitionField } from '../components/detail/fields/OutputContractDefinitionField';
import { LlmModelField } from '../components/detail/fields/LlmModelField';
import type { FlowSelectorOption } from '../lib/selector-options';
import { createTemplateSelectorToken } from '../lib/template-binding';

function getSelectorOptions(adapter: SchemaFieldRendererProps['adapter']) {
  return (adapter.getDerived('selectorOptions') as FlowSelectorOption[] | null | undefined) ?? [];
}

function hasBindingKind(
  value: unknown,
  kind: string
): value is { kind: string; value: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'value' in value &&
    (value as { kind?: unknown }).kind === kind
  );
}

function getBindingValue<T>(value: unknown, kind: string, fallback: T): T {
  return hasBindingKind(value, kind) ? (value.value as T) : fallback;
}

function renderTextField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);

  return (
    <Input
      aria-label={block.label}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => adapter.setValue(block.path, event.target.value)}
    />
  );
}

function renderNumberField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);

  return (
    <InputNumber
      aria-label={block.label}
      className="agent-flow-editor__number-field"
      value={typeof value === 'number' && Number.isFinite(value) ? value : null}
      onChange={(nextValue) => adapter.setValue(block.path, nextValue)}
    />
  );
}

function renderSelectorField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const binding = getBindingValue<string[]>(value, 'selector', []);

  return (
    <SelectorField
      ariaLabel={block.label}
      options={getSelectorOptions(adapter)}
      value={binding}
      onChange={(nextValue) =>
        adapter.setValue(block.path, { kind: 'selector', value: nextValue as string[] })
      }
    />
  );
}

function renderSelectorListField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const binding = getBindingValue<string[][]>(value, 'selector_list', []);

  return (
    <SelectorField
      ariaLabel={block.label}
      multiple
      options={getSelectorOptions(adapter)}
      value={binding}
      onChange={(nextValue) =>
        adapter.setValue(block.path, {
          kind: 'selector_list',
          value: nextValue as string[][]
        })
      }
    />
  );
}

function renderTemplatedTextField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const selectorOptions = getSelectorOptions(adapter);
  const isBindingPath = block.path.startsWith('bindings.');
  const stringValue = isBindingPath
    ? hasBindingKind(value, 'templated_text')
      ? getBindingValue<string>(value, 'templated_text', '')
      : hasBindingKind(value, 'selector')
          ? createTemplateSelectorToken(getBindingValue<string[]>(value, 'selector', []))
          : ''
    : typeof value === 'string'
      ? value
      : '';

  return (
    <TemplatedTextField
      ariaLabel={block.label}
      options={selectorOptions}
      value={stringValue}
      onChange={(nextValue) =>
        adapter.setValue(
          block.path,
          isBindingPath ? { kind: 'templated_text', value: nextValue } : nextValue
        )
      }
    />
  );
}

function renderNamedBindingsField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const binding = getBindingValue<Array<{ name: string; selector: string[] }>>(
    value,
    'named_bindings',
    []
  );

  return (
    <NamedBindingsField
      ariaLabel={block.label}
      options={getSelectorOptions(adapter)}
      value={binding}
      onChange={(nextValue) =>
        adapter.setValue(block.path, {
          kind: 'named_bindings',
          value: nextValue
        })
      }
    />
  );
}

function renderConditionGroupField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const binding = getBindingValue<{ operator: 'and' | 'or'; conditions: Array<unknown> }>(
    value,
    'condition_group',
    { operator: 'and', conditions: [] }
  );

  return (
    <ConditionGroupField
      ariaLabel={block.label}
      options={getSelectorOptions(adapter)}
      value={binding as never}
      onChange={(nextValue) =>
        adapter.setValue(block.path, {
          kind: 'condition_group',
          value: nextValue
        })
      }
    />
  );
}

function renderStateWriteField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const binding = getBindingValue<Array<{ path: string[]; operator: string; source: string[] | null }>>(
    value,
    'state_write',
    []
  );

  return (
    <StateWriteField
      ariaLabel={block.label}
      options={getSelectorOptions(adapter)}
      value={binding as never}
      onChange={(nextValue) =>
        adapter.setValue(block.path, {
          kind: 'state_write',
          value: nextValue
        })
      }
    />
  );
}

function renderOutputContractDefinitionField({ adapter, block }: SchemaFieldRendererProps) {
  const value = adapter.getValue(block.path);
  const outputs = Array.isArray(value) ? (value as FlowNodeDocument['outputs']) : [];

  return (
    <OutputContractDefinitionField
      value={outputs}
      onChange={(nextValue) => adapter.setValue(block.path, nextValue)}
    />
  );
}

export const agentFlowFieldRenderers = {
  text: renderTextField,
  llm_model: LlmModelField,
  number: renderNumberField,
  selector: renderSelectorField,
  selector_list: renderSelectorListField,
  templated_text: renderTemplatedTextField,
  named_bindings: renderNamedBindingsField,
  condition_group: renderConditionGroupField,
  state_write: renderStateWriteField,
  output_contract_definition: renderOutputContractDefinitionField,
  header_alias: ({ adapter, block }) => {
    const value = adapter.getValue(block.path);

    return (
      <Input
        aria-label={block.label}
        className="agent-flow-editor__inspector-title-input"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => adapter.setValue(block.path, event.target.value)}
      />
    );
  },
  header_description: ({ adapter, block }) => {
    const value = adapter.getValue(block.path);

    return (
      <Input.TextArea
        aria-label={block.label}
        autoSize={{ minRows: 1, maxRows: 3 }}
        className="agent-flow-editor__inspector-description-input"
        placeholder="添加描述..."
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => adapter.setValue(block.path, event.target.value)}
      />
    );
  }
} satisfies Record<string, SchemaFieldRenderer>;
