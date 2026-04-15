import type {
  FlowAuthoringDocument,
  FlowBinding,
  FlowNodeDocument
} from '@1flowse/flow-schema';
import { Collapse, Input, InputNumber, Typography, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';

import { ConditionGroupField } from '../bindings/ConditionGroupField';
import { NamedBindingsField } from '../bindings/NamedBindingsField';
import { SelectorField } from '../bindings/SelectorField';
import { StateWriteField } from '../bindings/StateWriteField';
import { TemplatedTextField } from '../bindings/TemplatedTextField';
import type {
  InspectorSectionKey,
  NodeDefinitionField
} from '../../lib/node-definitions';
import { nodeDefinitions } from '../../lib/node-definitions';
import { listVisibleSelectorOptions } from '../../lib/selector-options';

interface NodeInspectorProps {
  document: FlowAuthoringDocument;
  selectedNodeId: string | null;
  focusFieldKey?: string | null;
  openSectionKey?: InspectorSectionKey | null;
  onDocumentChange: (document: FlowAuthoringDocument) => void;
  onFocusHandled?: () => void;
  onClose?: () => void;
}

function getVisibleSections(
  sections: Array<{
    key: InspectorSectionKey;
    title: string;
    fields: NodeDefinitionField[];
  }>
) {
  return sections.filter((section) => section.key !== 'basics');
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

  if (fieldKey === 'description') {
    return node.description ?? '';
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

  if (fieldKey === 'description' && typeof value === 'string') {
    return {
      ...node,
      description: value
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
  focusFieldKey = null,
  openSectionKey = null,
  onDocumentChange,
  onFocusHandled,
  onClose
}: NodeInspectorProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;
  const visibleSections = definition ? getVisibleSections(definition.sections) : [];
  const selectorOptions = selectedNode
    ? listVisibleSelectorOptions(document, selectedNode.id)
    : [];
  const [activeSectionKeys, setActiveSectionKeys] = useState<InspectorSectionKey[]>([]);

  useEffect(() => {
    setActiveSectionKeys(
      definition ? getVisibleSections(definition.sections).map((section) => section.key) : []
    );
  }, [definition]);

  useEffect(() => {
    if (!openSectionKey) {
      return;
    }

    setActiveSectionKeys((previous) =>
      previous.includes(openSectionKey) ? previous : [...previous, openSectionKey]
    );
  }, [openSectionKey]);

  useEffect(() => {
    if (!focusFieldKey || !rootRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      const focusTarget = rootRef.current?.querySelector<HTMLElement>(
        `[data-field-key="${focusFieldKey}"] [aria-label]`
      );
      focusTarget?.focus();
      onFocusHandled?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusFieldKey, onFocusHandled, selectedNode?.id]);

  if (!selectedNode || !definition) {
    return null;
  }

  const activeNode = selectedNode;
  const activeDefinition = definition;

  function updateField(fieldKey: string, value: unknown) {
    onDocumentChange(
      updateNode(document, activeNode.id, (node) => setFieldValue(node, fieldKey, value))
    );
  }

  function renderField(field: NodeDefinitionField) {
    const fieldValue = getFieldValue(activeNode, field.key);

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
    <aside ref={rootRef} className="agent-flow-editor__inspector">
      <div className="agent-flow-editor__inspector-header">
        <div className="agent-flow-editor__inspector-header-main">
          <Typography.Text
            className="agent-flow-editor__inspector-node-type"
            type="secondary"
          >
            {activeDefinition.label}
          </Typography.Text>
          <div data-field-key="alias">
            <Input
              aria-label="节点别名"
              className="agent-flow-editor__inspector-title-input"
              placeholder="输入节点别名"
              value={activeNode.alias}
              onChange={(event) => updateField('alias', event.target.value)}
            />
          </div>
          <div data-field-key="description">
            <Input.TextArea
              aria-label="节点简介"
              autoSize={{ minRows: 1, maxRows: 3 }}
              className="agent-flow-editor__inspector-description-input"
              placeholder="添加节点简介..."
              value={activeNode.description ?? ''}
              onChange={(event) => updateField('description', event.target.value)}
            />
          </div>
        </div>
        {onClose && (
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label="Close Inspector"
          />
        )}
      </div>
      <Collapse
        activeKey={activeSectionKeys}
        className="agent-flow-editor__inspector-sections"
        onChange={(nextActiveKeys) =>
          setActiveSectionKeys(
            Array.isArray(nextActiveKeys) ? nextActiveKeys.map(String) as InspectorSectionKey[] : []
          )
        }
        items={visibleSections.map((section) => ({
          key: section.key,
          label: section.title,
          children: (
            <div className="agent-flow-editor__inspector-fields">
              {section.fields.map((field) => (
                <div
                  key={field.key}
                  className="agent-flow-editor__inspector-field"
                  data-field-key={field.key}
                >
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
