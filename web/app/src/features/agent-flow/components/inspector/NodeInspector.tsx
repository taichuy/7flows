import type {
  FlowAuthoringDocument,
  FlowBinding,
  FlowNodeDocument
} from '@1flowse/flow-schema';
import { Collapse, Input, InputNumber, Typography } from 'antd';

import { ConditionGroupField } from '../bindings/ConditionGroupField';
import { NamedBindingsField } from '../bindings/NamedBindingsField';
import { SelectorField } from '../bindings/SelectorField';
import { StateWriteField } from '../bindings/StateWriteField';
import { TemplatedTextField } from '../bindings/TemplatedTextField';
import type { NodeDefinitionField } from '../../lib/node-definitions';
import { nodeDefinitions } from '../../lib/node-definitions';
import { listVisibleSelectorOptions } from '../../lib/selector-options';

interface NodeInspectorProps {
  document: FlowAuthoringDocument;
  selectedNodeId: string | null;
  onDocumentChange: (document: FlowAuthoringDocument) => void;
}

function updateNode(
  document: FlowAuthoringDocument,
  nodeId: string,
  updater: (node: FlowNodeDocument) => FlowNodeDocument
): FlowAuthoringDocument {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) =>
        node.id === nodeId ? updater(node) : node
      )
    }
  };
}

function getOutputValue(node: FlowNodeDocument, outputKey: string): string {
  return node.outputs.find((output) => output.key === outputKey)?.title ?? '';
}

function getFieldValue(node: FlowNodeDocument, fieldKey: string) {
  if (fieldKey === 'alias') {
    return node.alias;
  }

  if (fieldKey.startsWith('config.')) {
    return node.config[fieldKey.slice('config.'.length)];
  }

  if (fieldKey.startsWith('bindings.')) {
    return node.bindings[fieldKey.slice('bindings.'.length)];
  }

  if (fieldKey.startsWith('outputs.')) {
    return getOutputValue(node, fieldKey.slice('outputs.'.length));
  }

  return undefined;
}

function setFieldValue(
  node: FlowNodeDocument,
  fieldKey: string,
  value: unknown
): FlowNodeDocument {
  if (fieldKey === 'alias' && typeof value === 'string') {
    return {
      ...node,
      alias: value
    };
  }

  if (fieldKey.startsWith('config.')) {
    const configKey = fieldKey.slice('config.'.length);

    return {
      ...node,
      config: {
        ...node.config,
        [configKey]: value
      }
    };
  }

  if (fieldKey.startsWith('bindings.')) {
    const bindingKey = fieldKey.slice('bindings.'.length);

    return {
      ...node,
      bindings: {
        ...node.bindings,
        [bindingKey]: value as FlowBinding
      }
    };
  }

  if (fieldKey.startsWith('outputs.') && typeof value === 'string') {
    const outputKey = fieldKey.slice('outputs.'.length);

    return {
      ...node,
      outputs: node.outputs.map((output) =>
        output.key === outputKey ? { ...output, title: value } : output
      )
    };
  }

  return node;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBinding<T extends FlowBinding['kind']>(
  value: unknown,
  kind: T
): Extract<FlowBinding, { kind: T }> | null {
  return value &&
    typeof value === 'object' &&
    'kind' in (value as FlowBinding) &&
    (value as FlowBinding).kind === kind
    ? (value as Extract<FlowBinding, { kind: T }>)
    : null;
}

export function NodeInspector({
  document,
  selectedNodeId,
  onDocumentChange
}: NodeInspectorProps) {
  if (!selectedNodeId) {
    return null;
  }

  const selectedNode =
    document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null;

  if (!selectedNode) {
    return null;
  }

  const definition = nodeDefinitions[selectedNode.type];

  if (!definition) {
    return null;
  }

  const selectorOptions = listVisibleSelectorOptions(document, selectedNode.id);

  function updateField(fieldKey: string, value: unknown) {
    onDocumentChange(
      updateNode(document, selectedNode.id, (node) => setFieldValue(node, fieldKey, value))
    );
  }

  function renderField(field: NodeDefinitionField) {
    const fieldValue = getFieldValue(selectedNode, field.key);

    switch (field.editor) {
      case 'text':
        return (
          <Input
            aria-label={field.label}
            value={asString(fieldValue)}
            onChange={(event) => updateField(field.key, event.target.value)}
          />
        );
      case 'number':
        return (
          <InputNumber
            aria-label={field.label}
            className="agent-flow-editor__number-field"
            value={asNumber(fieldValue)}
            onChange={(nextValue) => updateField(field.key, nextValue)}
          />
        );
      case 'selector':
        return (
          <SelectorField
            ariaLabel={field.label}
            options={selectorOptions}
            value={asBinding(fieldValue, 'selector')?.value ?? []}
            onChange={(nextValue) =>
              updateField(field.key, {
                kind: 'selector',
                value: nextValue as string[]
              })
            }
          />
        );
      case 'selector_list':
        return (
          <SelectorField
            ariaLabel={field.label}
            multiple
            options={selectorOptions}
            value={asBinding(fieldValue, 'selector_list')?.value ?? []}
            onChange={(nextValue) =>
              updateField(field.key, {
                kind: 'selector_list',
                value: nextValue as string[][]
              })
            }
          />
        );
      case 'templated_text':
        return (
          <TemplatedTextField
            ariaLabel={field.label}
            value={
              field.key.startsWith('bindings.')
                ? asBinding(fieldValue, 'templated_text')?.value ?? ''
                : asString(fieldValue)
            }
            onChange={(nextValue) =>
              updateField(
                field.key,
                field.key.startsWith('bindings.')
                  ? {
                      kind: 'templated_text',
                      value: nextValue
                    }
                  : nextValue
              )
            }
          />
        );
      case 'named_bindings':
        return (
          <NamedBindingsField
            ariaLabel={field.label}
            options={selectorOptions}
            value={asBinding(fieldValue, 'named_bindings')?.value ?? []}
            onChange={(nextValue) =>
              updateField(field.key, {
                kind: 'named_bindings',
                value: nextValue
              })
            }
          />
        );
      case 'condition_group':
        return (
          <ConditionGroupField
            ariaLabel={field.label}
            options={selectorOptions}
            value={
              asBinding(fieldValue, 'condition_group')?.value ?? {
                operator: 'and',
                conditions: []
              }
            }
            onChange={(nextValue) =>
              updateField(field.key, {
                kind: 'condition_group',
                value: nextValue
              })
            }
          />
        );
      case 'state_write':
        return (
          <StateWriteField
            ariaLabel={field.label}
            options={selectorOptions}
            value={asBinding(fieldValue, 'state_write')?.value ?? []}
            onChange={(nextValue) =>
              updateField(field.key, {
                kind: 'state_write',
                value: nextValue
              })
            }
          />
        );
    }
  }

  return (
    <aside className="agent-flow-editor__inspector">
      <div className="agent-flow-editor__inspector-header">
        <Typography.Text type="secondary">节点配置</Typography.Text>
        <Typography.Title className="agent-flow-editor__inspector-title" level={5}>
          {selectedNode.alias}
        </Typography.Title>
      </div>
      <Collapse
        className="agent-flow-editor__inspector-sections"
        defaultActiveKey={definition.sections.map((section) => section.key)}
        items={definition.sections.map((section) => ({
          key: section.key,
          label: section.title,
          children: (
            <div className="agent-flow-editor__inspector-fields">
              {section.fields.map((field) => (
                <div key={field.key} className="agent-flow-editor__inspector-field">
                  <Typography.Text strong>{field.label}</Typography.Text>
                  {renderField(field)}
                </div>
              ))}
            </div>
          )
        }))}
      />
    </aside>
  );
}
