import { Form, Input, InputNumber, Modal, Switch } from 'antd';
import { useEffect } from 'react';

import type { NodeDebugPreviewVariableField } from '../../api/runtime';

type NodePreviewVariablesModalProps = {
  open: boolean;
  fields: NodeDebugPreviewVariableField[];
  confirmLoading?: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, Record<string, unknown>>) => void;
};

function fieldName(field: NodeDebugPreviewVariableField) {
  return `${field.nodeId}.${field.key}`;
}

function parseFieldValue(field: NodeDebugPreviewVariableField, value: unknown) {
  if (field.valueType !== 'json' && field.valueType !== 'array') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function renderField(field: NodeDebugPreviewVariableField) {
  switch (field.valueType) {
    case 'boolean':
      return <Switch />;
    case 'number':
      return <InputNumber style={{ width: '100%' }} />;
    case 'array':
    case 'json':
    case 'unknown':
      return <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} />;
    case 'string':
    default:
      return <Input autoFocus />;
  }
}

export function NodePreviewVariablesModal({
  open,
  fields,
  confirmLoading = false,
  onCancel,
  onSubmit
}: NodePreviewVariablesModalProps) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (!open) {
      return;
    }

    form.setFieldsValue(
      fields.reduce<Record<string, unknown>>((values, field) => {
        values[fieldName(field)] =
          field.valueType === 'json' || field.valueType === 'array'
            ? JSON.stringify(field.value ?? {}, null, 2)
            : field.value;
        return values;
      }, {})
    );
  }, [fields, form, open]);

  return (
    <Modal
      cancelText="取消"
      confirmLoading={confirmLoading}
      destroyOnHidden
      okText="运行"
      open={open}
      title="输入节点引用变量"
      width={520}
      onCancel={onCancel}
      onOk={() => {
        void form.validateFields().then((values) => {
          const payload: Record<string, Record<string, unknown>> = {};

          for (const field of fields) {
            payload[field.nodeId] ??= {};
            payload[field.nodeId][field.key] = parseFieldValue(
              field,
              values[fieldName(field)]
            );
          }

          onSubmit(payload);
        });
      }}
    >
      <Form form={form} layout="vertical">
        {fields.map((field) => (
          <Form.Item
            key={fieldName(field)}
            label={`${field.nodeId}.${field.key}`}
            name={fieldName(field)}
            rules={[{ required: true, message: '请输入变量值' }]}
            tooltip={field.title}
            valuePropName={field.valueType === 'boolean' ? 'checked' : 'value'}
          >
            {renderField(field)}
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
