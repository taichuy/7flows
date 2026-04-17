import type { FlowBinding, FlowNodeDocument } from '@1flowse/flow-schema';
import { Input, InputNumber, Typography } from 'antd';
import { useEffect, useMemo, useRef } from 'react';

import { ConditionGroupField } from '../bindings/ConditionGroupField';
import { NamedBindingsField } from '../bindings/NamedBindingsField';
import { SelectorField } from '../bindings/SelectorField';
import { StateWriteField } from '../bindings/StateWriteField';
import { TemplatedTextField } from '../bindings/TemplatedTextField';
import { OutputContractDefinitionField } from '../detail/fields/OutputContractDefinitionField';
import { useInspectorInteractions } from '../../hooks/interactions/use-inspector-interactions';
import type {
  InspectorSectionKey,
  NodeDefinitionField
} from '../../lib/node-definitions';
import { nodeDefinitions } from '../../lib/node-definitions';
import { listVisibleSelectorOptions } from '../../lib/selector-options';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectSelectedNodeId,
  selectWorkingDocument
} from '../../store/editor/selectors';

function getVisibleSections(
  sections: Array<{
    key: InspectorSectionKey;
    title: string;
    fields: NodeDefinitionField[];
  }>
) {
  return sections.filter(
    (section) => section.key !== 'basics' && section.key !== 'outputs'
  );
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

function isInlineField(field: NodeDefinitionField) {
  return (
    field.editor === 'text' ||
    field.editor === 'number' ||
    field.editor === 'selector'
  );
}

export function NodeInspector() {
  const rootRef = useRef<HTMLElement | null>(null);
  const document = useAgentFlowEditorStore(selectWorkingDocument);
  const selectedNodeId = useAgentFlowEditorStore(selectSelectedNodeId);
  const focusFieldKey = useAgentFlowEditorStore((state) => state.focusedFieldKey);
  const inspectorInteractions = useInspectorInteractions();
  const selectedNode = selectedNodeId
    ? document.graph.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const definition = selectedNode ? nodeDefinitions[selectedNode.type] ?? null : null;
  const visibleSections = definition ? getVisibleSections(definition.sections) : [];
  const selectorOptions = useMemo(
    () =>
      selectedNode ? listVisibleSelectorOptions(document, selectedNode.id) : [],
    [document, selectedNode]
  );

  useEffect(() => {
    if (!focusFieldKey || !rootRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      const focusTarget = rootRef.current?.querySelector<HTMLElement>(
        `[data-field-key="${focusFieldKey}"] [aria-label]`
      );
      focusTarget?.focus();
      inspectorInteractions.handleFocusComplete();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusFieldKey, inspectorInteractions, selectedNode?.id]);

  if (!selectedNode || !definition) {
    return null;
  }

  const activeNode = selectedNode;

  function updateField(fieldKey: string, value: unknown) {
    inspectorInteractions.updateField(fieldKey, value);
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
      case 'output_contract_definition':
        return (
          <OutputContractDefinitionField
            value={activeNode.outputs}
            onChange={(nextValue) =>
              updateField('config.output_contract', nextValue)
            }
          />
        );
    }
  }

  return (
    <section ref={rootRef} className="agent-flow-node-detail__inspector">
      {visibleSections.map((section) => (
        <div
          key={section.key}
          className="agent-flow-node-detail__section agent-flow-node-detail__inspector-section"
          data-section-key={section.key}
        >
          <div className="agent-flow-node-detail__section-header">
            <Typography.Title
              level={5}
              className="agent-flow-node-detail__section-title"
            >
              {section.title}
            </Typography.Title>
          </div>
          <div className="agent-flow-editor__inspector-fields">
            {section.fields.map((field) => (
              <div
                key={field.key}
                className={[
                  'agent-flow-editor__inspector-field',
                  isInlineField(field)
                    ? 'agent-flow-editor__inspector-field--inline'
                    : null
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-field-key={field.key}
                data-testid={`inspector-field-${field.key}`}
              >
                <Typography.Text
                  strong
                  className="agent-flow-editor__inspector-field-label"
                >
                  {field.label}
                </Typography.Text>
                <div className="agent-flow-editor__inspector-field-control">
                  {renderField(field)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
