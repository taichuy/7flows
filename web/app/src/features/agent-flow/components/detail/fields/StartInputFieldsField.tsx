import {
  DeleteOutlined,
  HolderOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { Button, Empty, Typography } from 'antd';
import { useRef, useState } from 'react';

import type { FlowStartInputField } from '@1flowbase/flow-schema';

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
        <Typography.Text className="agent-flow-node-detail__section-subtitle">
          设置的输入可在工作流程中使用
        </Typography.Text>
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
                    {field.valueType === 'array'
                      ? 'Array[File]'
                      : field.valueType === 'string'
                        ? 'String'
                        : field.valueType === 'number'
                          ? 'Number'
                          : field.valueType === 'boolean'
                            ? 'Boolean'
                            : 'JSON'}
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
          {startSystemVariables.map((variable) => (
            <div
              key={variable.key}
              className="agent-flow-node-detail__list-item"
            >
              <div className="agent-flow-node-detail__list-item-left">
                <span className="agent-flow-node-detail__list-item-icon">
                  {'{x}'}
                </span>
                <span className="agent-flow-node-detail__list-item-name">
                  {variable.title}
                </span>
              </div>
              <span className="agent-flow-node-detail__list-item-type">
                {variable.key === 'files' ? 'Array[File]' : 'String'}
              </span>
            </div>
          ))}
        </div>
      </div>
      {floatingPanel}
    </div>
  );
}
