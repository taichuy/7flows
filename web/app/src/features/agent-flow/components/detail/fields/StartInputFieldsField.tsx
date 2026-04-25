import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { Button, Empty, Input, Select, Switch, Typography } from 'antd';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { createPortal } from 'react-dom';

import type {
  FlowStartInputField,
  FlowStartInputType
} from '@1flowbase/flow-schema';

import {
  getStartInputValueType,
  normalizeStartInputField,
  startInputTypeOptions,
  startSystemVariables
} from '../../../lib/start-node-variables';

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

type FloatingPanelPosition = {
  left: number;
  top: number;
};

const FLOATING_PANEL_WIDTH = 360;
const FLOATING_PANEL_HEIGHT = 360;
const FLOATING_PANEL_GAP = 16;
const FLOATING_PANEL_MARGIN = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resolvePanelPosition(trigger: HTMLElement | null) {
  const container =
    trigger?.closest<HTMLElement>('.agent-flow-editor__body') ?? null;
  const bounds = container?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight
  };
  const triggerRect = trigger?.getBoundingClientRect();
  const preferredLeft = triggerRect
    ? triggerRect.left - bounds.left - FLOATING_PANEL_WIDTH - FLOATING_PANEL_GAP
    : bounds.width - FLOATING_PANEL_WIDTH - FLOATING_PANEL_MARGIN;
  const fallbackLeft = triggerRect
    ? triggerRect.right - bounds.left + FLOATING_PANEL_GAP
    : FLOATING_PANEL_MARGIN;
  const left =
    preferredLeft >= FLOATING_PANEL_MARGIN ? preferredLeft : fallbackLeft;

  return {
    container,
    position: {
      left: clamp(
        left,
        FLOATING_PANEL_MARGIN,
        Math.max(
          FLOATING_PANEL_MARGIN,
          bounds.width - FLOATING_PANEL_WIDTH - FLOATING_PANEL_MARGIN
        )
      ),
      top: clamp(
        triggerRect ? triggerRect.top - bounds.top : FLOATING_PANEL_MARGIN,
        FLOATING_PANEL_MARGIN,
        Math.max(
          FLOATING_PANEL_MARGIN,
          bounds.height - FLOATING_PANEL_HEIGHT - FLOATING_PANEL_MARGIN
        )
      )
    }
  };
}

export function StartInputFieldsField({
  value,
  onChange
}: {
  value: unknown;
  onChange: (value: FlowStartInputField[]) => void;
}) {
  const fields = normalizeList(value);
  const [editing, setEditing] = useState<EditingInputField | null>(null);
  const [panelContainer, setPanelContainer] = useState<HTMLElement | null>(
    null
  );
  const [panelPosition, setPanelPosition] = useState<FloatingPanelPosition>({
    left: FLOATING_PANEL_MARGIN,
    top: FLOATING_PANEL_MARGIN
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const titleId = useId();

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  function openAddPanel() {
    const nextPanel = resolvePanelPosition(triggerRef.current);

    setPanelContainer(nextPanel.container);
    setPanelPosition(nextPanel.position);
    setEditing({
      index: null,
      field: createNextField(fields.length)
    });
  }

  function openEditPanel(field: FlowStartInputField, index: number) {
    const nextPanel = resolvePanelPosition(triggerRef.current);

    setPanelContainer(nextPanel.container);
    setPanelPosition(nextPanel.position);
    setEditing({
      index,
      field: normalizeStartInputField(field, index)
    });
  }

  function closePanel() {
    dragCleanupRef.current?.();
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

  function handleDragStart(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const bounds = panelContainer?.getBoundingClientRect() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const offsetX = event.clientX - bounds.left - panelPosition.left;
    const offsetY = event.clientY - bounds.top - panelPosition.top;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    dragCleanupRef.current?.();
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setPanelPosition({
        left: clamp(
          moveEvent.clientX - bounds.left - offsetX,
          FLOATING_PANEL_MARGIN,
          Math.max(
            FLOATING_PANEL_MARGIN,
            bounds.width - FLOATING_PANEL_WIDTH - FLOATING_PANEL_MARGIN
          )
        ),
        top: clamp(
          moveEvent.clientY - bounds.top - offsetY,
          FLOATING_PANEL_MARGIN,
          Math.max(
            FLOATING_PANEL_MARGIN,
            bounds.height - FLOATING_PANEL_HEIGHT - FLOATING_PANEL_MARGIN
          )
        )
      });
    };

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  const floatingPanel = editing ? (
    <div
      aria-labelledby={titleId}
      aria-modal="false"
      className="agent-flow-model-settings__panel agent-flow-start-input-fields__panel"
      role="dialog"
      style={{
        position: panelContainer ? 'absolute' : 'fixed',
        width: `${FLOATING_PANEL_WIDTH}px`,
        height: `${FLOATING_PANEL_HEIGHT}px`,
        left: `${panelPosition.left}px`,
        top: `${panelPosition.top}px`
      }}
    >
      <div className="agent-flow-model-settings__panel-header">
        <div
          className="agent-flow-model-settings__drag-handle"
          onMouseDown={handleDragStart}
        >
          <HolderOutlined
            aria-hidden="true"
            className="agent-flow-model-settings__drag-icon"
          />
          <Typography.Title
            id={titleId}
            level={4}
            className="agent-flow-model-settings__panel-title"
          >
            输入字段设置
          </Typography.Title>
        </div>
        <button
          aria-label="关闭输入字段设置"
          className="agent-flow-model-settings__close"
          onClick={closePanel}
          type="button"
        >
          <CloseOutlined />
        </button>
      </div>

      <div className="agent-flow-model-settings__panel-body">
        <div className="agent-flow-start-input-fields__form">
          <label className="agent-flow-start-input-fields__form-row">
            <span>变量名</span>
            <Input
              aria-label="输入字段变量名"
              value={editing.field.key}
              onChange={(event) => updateDraft({ key: event.target.value })}
            />
          </label>
          <label className="agent-flow-start-input-fields__form-row">
            <span>显示名</span>
            <Input
              aria-label="输入字段显示名"
              value={editing.field.label}
              onChange={(event) => updateDraft({ label: event.target.value })}
            />
          </label>
          <label className="agent-flow-start-input-fields__form-row">
            <span>类型</span>
            <Select
              aria-label="输入字段类型"
              options={startInputTypeOptions}
              value={editing.field.inputType}
              onChange={(inputType: FlowStartInputType) =>
                updateDraft({
                  inputType,
                  valueType: getStartInputValueType(inputType),
                  options:
                    inputType === 'select' ? editing.field.options : undefined
                })
              }
            />
          </label>
          <div className="agent-flow-start-input-fields__form-row">
            <span>必填</span>
            <Switch
              aria-label="必填输入字段"
              checked={editing.field.required}
              checkedChildren="必填"
              unCheckedChildren="可选"
              onChange={(required) => updateDraft({ required })}
            />
          </div>
          {editing.field.inputType === 'select' ? (
            <label className="agent-flow-start-input-fields__form-row">
              <span>选项</span>
              <Input
                aria-label="输入字段选项"
                placeholder="用英文逗号分隔选项"
                value={(editing.field.options ?? []).join(',')}
                onChange={(event) =>
                  updateDraft({
                    options: event.target.value
                      .split(',')
                      .map((option) => option.trim())
                      .filter(Boolean)
                  })
                }
              />
            </label>
          ) : null}
        </div>
      </div>

      <div className="agent-flow-start-input-fields__panel-footer">
        <Button onClick={closePanel}>取消</Button>
        <Button aria-label="保存输入字段" type="primary" onClick={saveDraft}>
          保存
        </Button>
      </div>
    </div>
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
              className="agent-flow-start-input-fields__item"
            >
              <div className="agent-flow-start-input-fields__item-main">
                <div className="agent-flow-start-input-fields__item-copy">
                  <Typography.Text strong>{field.label}</Typography.Text>
                  <Typography.Text className="agent-flow-start-input-fields__item-key">
                    userinput.{field.key}
                  </Typography.Text>
                </div>
                <span className="agent-flow-node-detail__list-item-type">
                  {field.valueType}
                  {field.required ? ' · 必填' : ''}
                </span>
              </div>
              <div className="agent-flow-start-input-fields__actions">
                <Button
                  aria-label={`编辑输入字段 ${field.key}`}
                  icon={<EditOutlined />}
                  size="small"
                  type="text"
                  onClick={() => openEditPanel(field, index)}
                />
                <Button
                  aria-label={`上移输入字段 ${field.key}`}
                  disabled={index === 0}
                  icon={<ArrowUpOutlined />}
                  size="small"
                  type="text"
                  onClick={() => onChange(moveItem(fields, index, index - 1))}
                />
                <Button
                  aria-label={`下移输入字段 ${field.key}`}
                  disabled={index === fields.length - 1}
                  icon={<ArrowDownOutlined />}
                  size="small"
                  type="text"
                  onClick={() => onChange(moveItem(fields, index, index + 1))}
                />
                <Button
                  aria-label={`删除输入字段 ${field.key}`}
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
      {floatingPanel
        ? createPortal(floatingPanel, panelContainer ?? document.body)
        : null}
    </div>
  );
}
