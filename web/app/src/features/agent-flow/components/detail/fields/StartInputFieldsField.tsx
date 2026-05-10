import {
  DownOutlined,
  DeleteOutlined,
  HolderOutlined,
  PlusOutlined,
  RightOutlined
} from '@ant-design/icons';
import { Button, Empty, Typography } from 'antd';
import { useRef, useState } from 'react';

import type { FlowStartInputField } from '@1flowbase/flow-schema';

import { JsonPreviewBlock } from '../../../../../shared/ui/json-preview/JsonPreviewBlock';
import {
  normalizeStartInputField,
  startSystemVariables
} from '../../../lib/start-node-variables';
import { StartInputFieldSettingsPanel } from './StartInputFieldSettingsPanel';

function normalizeList(value: unknown): FlowStartInputField[] {
  return Array.isArray(value)
    ? value.map((field, index) => normalizeStartInputField(field, index))
    : [];
}

function createNextField(index: number): FlowStartInputField {
  const key = `input_${index + 1}`;

  return {
    key,
    label: key,
    inputType: 'text',
    valueType: 'string',
    required: false
  };
}

function replaceAt(
  fields: FlowStartInputField[],
  index: number,
  patch: Partial<FlowStartInputField>
) {
  return fields.map((field, fieldIndex) =>
    fieldIndex === index ? { ...field, ...patch } : field
  );
}

function moveItem(fields: FlowStartInputField[], from: number, to: number) {
  if (to < 0 || to >= fields.length) {
    return fields;
  }

  const nextFields = [...fields];
  const [item] = nextFields.splice(from, 1);

  if (!item) {
    return fields;
  }

  nextFields.splice(to, 0, item);
  return nextFields;
}

function formatSystemVariableType(variable: {
  key: string;
  valueType: string;
}) {
  return formatValueType(variable.valueType);
}

function formatValueType(valueType: string) {
  if (valueType === 'string') {
    return 'String';
  }
  if (valueType === 'number') {
    return 'Number';
  }
  if (valueType === 'boolean') {
    return 'Boolean';
  }
  if (valueType === 'json') {
    return 'JSON';
  }
  return valueType;
}

function systemVariableExample(variableKey: string) {
  switch (variableKey) {
    case 'history':
      return [
        {
          role: 'user',
          content: '上一轮用户消息'
        },
        {
          role: 'assistant',
          content: '上一轮助手回复'
        }
      ];
    case 'files':
      return [
        {
          id: 'file-1',
          title: 'example.pdf',
          filename: 'example.pdf',
          extname: 'pdf',
          size: 245760,
          mimetype: 'application/pdf',
          path: 'attachments/2026/05/file-1.pdf',
          url: 'https://files.example.com/attachments/2026/05/file-1.pdf',
          storage_id: 'storage-1',
          meta: {}
        }
      ];
    default:
      return null;
  }
}

type EditingInputField = {
  index: number | null;
  field: FlowStartInputField;
};

export function StartInputFieldsField({
  value,
  onChange
}: {
  value: unknown;
  onChange: (value: FlowStartInputField[]) => void;
}) {
  const fields = normalizeList(value);
  const [editing, setEditing] = useState<EditingInputField | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [expandedSystemKeys, setExpandedSystemKeys] = useState<Set<string>>(
    () => new Set()
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function openAddPanel() {
    setEditing({
      index: null,
      field: createNextField(fields.length)
    });
  }

  function openEditPanel(field: FlowStartInputField, index: number) {
    setEditing({
      index,
      field: normalizeStartInputField(field, index)
    });
  }

  function closePanel() {
    setEditing(null);
  }

  function updateDraft(patch: Partial<FlowStartInputField>) {
    setEditing((current) =>
      current
        ? {
            ...current,
            field: {
              ...current.field,
              ...patch
            }
          }
        : current
    );
  }

  function saveDraft() {
    if (!editing) {
      return;
    }

    const nextField = normalizeStartInputField(
      editing.field,
      editing.index ?? fields.length
    );

    if (editing.index === null) {
      onChange([...fields, nextField]);
    } else {
      onChange(replaceAt(fields, editing.index, nextField));
    }

    closePanel();
  }

  function handleDragStart(index: number) {
    setDraggingIndex(index);
  }

  function handleDrop(targetIndex: number) {
    if (draggingIndex === null || draggingIndex === targetIndex) {
      setDraggingIndex(null);
      return;
    }

    onChange(moveItem(fields, draggingIndex, targetIndex));
    setDraggingIndex(null);
  }

  function toggleSystemVariable(key: string) {
    setExpandedSystemKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const floatingPanel = editing ? (
    <StartInputFieldSettingsPanel
      mode={editing.index === null ? 'create' : 'edit'}
      field={editing.field}
      triggerRef={triggerRef}
      onChange={updateDraft}
      onClose={closePanel}
      onSave={saveDraft}
    />
  ) : null;

  return (
    <div className="agent-flow-start-input-fields">
      <div className="agent-flow-start-input-fields__header">
        <Button
          aria-label="新增输入字段"
          icon={<PlusOutlined />}
          size="small"
          type="text"
          onClick={openAddPanel}
          ref={triggerRef}
        />
      </div>

      {fields.length > 0 ? (
        <div className="agent-flow-start-input-fields__list">
          {fields.map((field, index) => (
            <div
              key={`${field.key}-${index}`}
              className="agent-flow-start-input-fields__item agent-flow-node-detail__list-item"
              data-testid={`start-input-field-row-${field.key}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
            >
              <button
                aria-label={`拖拽排序输入字段 ${field.key}`}
                className="agent-flow-start-input-fields__drag-handle"
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnd={() => setDraggingIndex(null)}
                type="button"
              >
                <HolderOutlined />
              </button>
              <button
                aria-label={`编辑输入字段 ${field.key}`}
                className="agent-flow-start-input-fields__variable-main"
                type="button"
                onClick={() => openEditPanel(field, index)}
              >
                <span className="agent-flow-node-detail__list-item-left">
                  <span className="agent-flow-node-detail__list-item-icon">
                    {'{x}'}
                  </span>
                  <span className="agent-flow-start-input-fields__name-stack">
                    <span className="agent-flow-node-detail__list-item-name">
                      userinput.{field.key}
                    </span>
                    {field.label && field.label !== field.key ? (
                      <span className="agent-flow-start-input-fields__label">
                        {field.label}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="agent-flow-start-input-fields__item-meta">
                  {field.required ? (
                    <span className="agent-flow-start-input-fields__badge">
                      必填
                    </span>
                  ) : null}
                  {field.hidden ? (
                    <span className="agent-flow-start-input-fields__badge">
                      隐藏
                    </span>
                  ) : null}
                  <span className="agent-flow-node-detail__list-item-type">
                    {formatValueType(field.valueType)}
                  </span>
                </span>
              </button>
              <Button
                aria-label={`删除输入字段 ${field.key}`}
                className="agent-flow-start-input-fields__delete"
                danger
                icon={<DeleteOutlined />}
                size="small"
                type="text"
                onClick={() =>
                  onChange(
                    fields.filter((_, fieldIndex) => fieldIndex !== index)
                  )
                }
              />
            </div>
          ))}
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无自定义输入字段"
        />
      )}

      <div className="agent-flow-start-input-fields__system">
        <Typography.Text
          strong
          className="agent-flow-start-input-fields__system-title"
        >
          系统变量
        </Typography.Text>
        <div className="agent-flow-node-detail__list">
          {startSystemVariables.map((variable) => {
            const example = systemVariableExample(variable.key);
            const expanded = expandedSystemKeys.has(variable.key);
            const systemRowContent = (
              <>
                <span className="agent-flow-node-detail__list-item-left">
                  {example ? (
                    <span className="agent-flow-start-input-fields__system-chevron">
                      {expanded ? <DownOutlined /> : <RightOutlined />}
                    </span>
                  ) : null}
                  <span className="agent-flow-node-detail__list-item-icon">
                    {'{x}'}
                  </span>
                  <span className="agent-flow-node-detail__list-item-name">
                    {variable.title}
                  </span>
                </span>
                <span className="agent-flow-node-detail__list-item-type">
                  {formatSystemVariableType(variable)}
                </span>
              </>
            );

            return (
              <div
                key={variable.key}
                className={[
                  'agent-flow-start-input-fields__system-variable',
                  expanded
                    ? 'agent-flow-start-input-fields__system-variable--expanded'
                    : null
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {example ? (
                  <button
                    type="button"
                    className="agent-flow-node-detail__list-item agent-flow-start-input-fields__system-trigger"
                    aria-expanded={expanded}
                    onClick={() => {
                      toggleSystemVariable(variable.key);
                    }}
                  >
                    {systemRowContent}
                  </button>
                ) : (
                  <div className="agent-flow-node-detail__list-item">
                    {systemRowContent}
                  </div>
                )}
                {example && expanded ? (
                  <JsonPreviewBlock
                    className="agent-flow-start-input-fields__system-json"
                    collapsible={false}
                    copyAriaLabel={`复制${variable.title} JSON`}
                    displayTitle=""
                    fullscreenAriaLabel={`放大查看${variable.title} JSON`}
                    height="180px"
                    title={variable.title}
                    value={example}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {floatingPanel}
    </div>
  );
}
