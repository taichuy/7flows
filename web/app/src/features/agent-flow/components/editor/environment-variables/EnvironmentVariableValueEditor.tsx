import {
  DeleteOutlined,
  FileTextOutlined,
  FormOutlined,
  PlusOutlined
} from '@ant-design/icons';
import {
  Button,
  Input,
  InputNumber,
  Select,
  Segmented,
  Space,
  Typography
} from 'antd';
import { useEffect, useMemo, useState } from 'react';

const scalarObjectValueTypes = ['string', 'number', 'boolean'] as const;

type ScalarObjectValueType = (typeof scalarObjectValueTypes)[number];

interface ObjectValueRow {
  key: string;
  type: ScalarObjectValueType;
  value: string | number | boolean | null;
}

interface EnvironmentVariableValueEditorProps {
  value?: unknown;
  valueType: string;
  onChange?: (value: unknown) => void;
  onValueErrorChange?: (message: string | null) => void;
}

function inferScalarType(value: unknown): ScalarObjectValueType {
  if (typeof value === 'number') {
    return 'number';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  return 'string';
}

function createEmptyObjectRow(): ObjectValueRow {
  return {
    key: '',
    type: 'string',
    value: ''
  };
}

function createObjectRows(value: unknown): ObjectValueRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [createEmptyObjectRow()];
  }

  const rows = Object.entries(value).map(([key, itemValue]) => ({
    key,
    type: inferScalarType(itemValue),
    value:
      typeof itemValue === 'string' ||
      typeof itemValue === 'number' ||
      typeof itemValue === 'boolean'
        ? itemValue
        : JSON.stringify(itemValue)
  }));

  return rows.length > 0 ? rows : [createEmptyObjectRow()];
}

function createObjectFromRows(rows: ObjectValueRow[]) {
  return rows.reduce<Record<string, string | number | boolean | null>>(
    (acc, row) => {
      if (row.key.trim().length === 0) {
        return acc;
      }

      acc[row.key.trim()] = row.value ?? null;
      return acc;
    },
    {}
  );
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function createDefaultItem(valueType: string) {
  if (valueType === 'array[number]') {
    return 0;
  }

  if (valueType === 'array[boolean]') {
    return false;
  }

  if (valueType === 'array[object]') {
    return {};
  }

  return '';
}

function normalizeArrayValue(valueType: string, value: unknown) {
  const items = Array.isArray(value) ? value : [];

  if (items.length > 0) {
    return items;
  }

  return [createDefaultItem(valueType)];
}

function getJsonPlaceholder(valueType: string) {
  if (valueType === 'object') {
    return '{\n  "key": "value"\n}';
  }

  if (valueType === 'array[string]') {
    return '[\n  "item"\n]';
  }

  if (valueType === 'array[number]') {
    return '[\n  1\n]';
  }

  if (valueType === 'array[boolean]') {
    return '[\n  true\n]';
  }

  if (valueType === 'array[object]') {
    return '[\n  { "key": "value" }\n]';
  }

  return '';
}

function StructuredJsonEditor({
  value,
  valueType,
  onApply,
  onCancel,
  onValueErrorChange
}: {
  value: unknown;
  valueType: string;
  onApply: (value: unknown) => void;
  onCancel: () => void;
  onValueErrorChange?: (message: string | null) => void;
}) {
  const [content, setContent] = useState(() => formatJson(value));

  useEffect(() => {
    setContent(formatJson(value));
  }, [value]);

  function applyJson() {
    try {
      onApply(JSON.parse(content));
      onValueErrorChange?.(null);
    } catch {
      onValueErrorChange?.('JSON 格式不合法');
    }
  }

  return (
    <div className="agent-flow-editor__env-value-json-editor">
      <Input.TextArea
        autoSize={{ minRows: 7, maxRows: 12 }}
        placeholder={getJsonPlaceholder(valueType)}
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          onValueErrorChange?.(null);
        }}
      />
      <div className="agent-flow-editor__env-value-json-actions">
        <Button size="small" onClick={onCancel}>
          返回表单
        </Button>
        <Button size="small" type="primary" onClick={applyJson}>
          应用 JSON
        </Button>
      </div>
    </div>
  );
}

function ObjectValueEditor({
  value,
  onChange,
  onValueErrorChange
}: EnvironmentVariableValueEditorProps) {
  const rows = useMemo(() => createObjectRows(value), [value]);

  function updateRows(nextRows: ObjectValueRow[]) {
    onValueErrorChange?.(null);
    onChange?.(createObjectFromRows(nextRows));
  }

  return (
    <div className="agent-flow-editor__env-value-rows">
      {rows.map((row, index) => (
        <div className="agent-flow-editor__env-object-row" key={index}>
          <Input
            aria-label={`对象键 ${index + 1}`}
            placeholder="key"
            value={row.key}
            onChange={(event) =>
              updateRows(
                rows.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? { ...candidate, key: event.target.value }
                    : candidate
                )
              )
            }
          />
          <Select
            aria-label={`对象值类型 ${index + 1}`}
            className="agent-flow-editor__env-object-type-select"
            options={scalarObjectValueTypes.map((type) => ({
              label: type,
              value: type
            }))}
            value={row.type}
            onChange={(nextType: ScalarObjectValueType) =>
              updateRows(
                rows.map((candidate, candidateIndex) =>
                  candidateIndex === index
                    ? {
                        ...candidate,
                        type: nextType,
                        value:
                          nextType === 'number'
                            ? 0
                            : nextType === 'boolean'
                              ? false
                              : ''
                      }
                    : candidate
                )
              )
            }
          />
          {row.type === 'number' ? (
            <InputNumber
              aria-label={`对象值 ${index + 1}`}
              className="agent-flow-editor__env-object-value"
              value={typeof row.value === 'number' ? row.value : null}
              onChange={(nextValue) =>
                updateRows(
                  rows.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, value: nextValue }
                      : candidate
                  )
                )
              }
            />
          ) : row.type === 'boolean' ? (
            <Segmented
              block
              className="agent-flow-editor__env-object-value"
              options={[
                { label: 'true', value: true },
                { label: 'false', value: false }
              ]}
              value={row.value === true}
              onChange={(nextValue) =>
                updateRows(
                  rows.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, value: nextValue }
                      : candidate
                  )
                )
              }
            />
          ) : (
            <Input
              aria-label={`对象值 ${index + 1}`}
              className="agent-flow-editor__env-object-value"
              placeholder="value"
              value={typeof row.value === 'string' ? row.value : ''}
              onChange={(event) =>
                updateRows(
                  rows.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? { ...candidate, value: event.target.value }
                      : candidate
                  )
                )
              }
            />
          )}
          <Button
            aria-label={`删除对象字段 ${index + 1}`}
            disabled={rows.length === 1}
            icon={<DeleteOutlined />}
            type="text"
            onClick={() =>
              updateRows(
                rows.filter((_, candidateIndex) => candidateIndex !== index)
              )
            }
          />
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        size="small"
        onClick={() => updateRows([...rows, createEmptyObjectRow()])}
      >
        添加字段
      </Button>
    </div>
  );
}

function ArrayValueEditor({
  value,
  valueType,
  onChange,
  onValueErrorChange
}: EnvironmentVariableValueEditorProps) {
  const items = normalizeArrayValue(valueType, value);

  function updateItems(nextItems: unknown[]) {
    onValueErrorChange?.(null);
    onChange?.(nextItems);
  }

  return (
    <div className="agent-flow-editor__env-value-rows">
      {items.map((item, index) => (
        <div className="agent-flow-editor__env-array-row" key={index}>
          <Typography.Text
            className="agent-flow-editor__env-array-index"
            type="secondary"
          >
            {index + 1}
          </Typography.Text>
          {valueType === 'array[number]' ? (
            <InputNumber
              aria-label={`数组值 ${index + 1}`}
              className="agent-flow-editor__env-array-value"
              value={typeof item === 'number' ? item : null}
              onChange={(nextValue) =>
                updateItems(
                  items.map((candidate, candidateIndex) =>
                    candidateIndex === index ? nextValue : candidate
                  )
                )
              }
            />
          ) : valueType === 'array[boolean]' ? (
            <Segmented
              block
              className="agent-flow-editor__env-array-value"
              options={[
                { label: 'true', value: true },
                { label: 'false', value: false }
              ]}
              value={item === true}
              onChange={(nextValue) =>
                updateItems(
                  items.map((candidate, candidateIndex) =>
                    candidateIndex === index ? nextValue : candidate
                  )
                )
              }
            />
          ) : valueType === 'array[object]' ? (
            <Input.TextArea
              aria-label={`数组对象 ${index + 1}`}
              autoSize={{ minRows: 2, maxRows: 5 }}
              className="agent-flow-editor__env-array-value"
              placeholder='{ "key": "value" }'
              value={formatJson(item)}
              onChange={(event) => {
                try {
                  updateItems(
                    items.map((candidate, candidateIndex) =>
                      candidateIndex === index
                        ? JSON.parse(event.target.value)
                        : candidate
                    )
                  );
                  onValueErrorChange?.(null);
                } catch {
                  onValueErrorChange?.('数组对象必须是合法 JSON 对象');
                }
              }}
            />
          ) : (
            <Input
              aria-label={`数组值 ${index + 1}`}
              className="agent-flow-editor__env-array-value"
              placeholder="value"
              value={typeof item === 'string' ? item : ''}
              onChange={(event) =>
                updateItems(
                  items.map((candidate, candidateIndex) =>
                    candidateIndex === index ? event.target.value : candidate
                  )
                )
              }
            />
          )}
          <Button
            aria-label={`删除数组项 ${index + 1}`}
            disabled={items.length === 1}
            icon={<DeleteOutlined />}
            type="text"
            onClick={() =>
              updateItems(
                items.filter((_, candidateIndex) => candidateIndex !== index)
              )
            }
          />
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        size="small"
        onClick={() => updateItems([...items, createDefaultItem(valueType)])}
      >
        添加项
      </Button>
    </div>
  );
}

export function EnvironmentVariableValueEditor({
  value,
  valueType,
  onChange,
  onValueErrorChange
}: EnvironmentVariableValueEditorProps) {
  const [editInJson, setEditInJson] = useState(false);
  const structured = valueType === 'object' || valueType.startsWith('array[');

  useEffect(() => {
    setEditInJson(false);
  }, [valueType]);

  if (valueType === 'number') {
    return (
      <InputNumber
        className="agent-flow-editor__environment-variable-number-input"
        placeholder="请输入变量值"
        value={typeof value === 'number' ? value : null}
        onChange={(nextValue) => {
          onValueErrorChange?.(null);
          onChange?.(nextValue);
        }}
      />
    );
  }

  if (valueType === 'boolean') {
    return (
      <Segmented
        block
        options={[
          { label: 'true', value: true },
          { label: 'false', value: false }
        ]}
        value={value === true}
        onChange={(nextValue) => {
          onValueErrorChange?.(null);
          onChange?.(nextValue);
        }}
      />
    );
  }

  if (!structured) {
    return (
      <Input.TextArea
        autoSize={{ minRows: 3, maxRows: 10 }}
        placeholder="请输入变量值"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => {
          onValueErrorChange?.(null);
          onChange?.(event.target.value);
        }}
      />
    );
  }

  if (editInJson) {
    return (
      <StructuredJsonEditor
        value={value}
        valueType={valueType}
        onApply={(nextValue) => {
          onChange?.(nextValue);
          setEditInJson(false);
        }}
        onCancel={() => setEditInJson(false)}
        onValueErrorChange={onValueErrorChange}
      />
    );
  }

  return (
    <div className="agent-flow-editor__env-value-editor">
      <div className="agent-flow-editor__env-value-editor-toolbar">
        <Button
          icon={<FileTextOutlined />}
          size="small"
          type="text"
          onClick={() => setEditInJson(true)}
        >
          JSON
        </Button>
      </div>
      {valueType === 'object' ? (
        <ObjectValueEditor
          value={value}
          valueType={valueType}
          onChange={onChange}
          onValueErrorChange={onValueErrorChange}
        />
      ) : (
        <ArrayValueEditor
          value={value}
          valueType={valueType}
          onChange={onChange}
          onValueErrorChange={onValueErrorChange}
        />
      )}
      <Typography.Text type="secondary">
        <FormOutlined /> 可切换到 JSON 模式编辑复杂结构。
      </Typography.Text>
    </div>
  );
}
