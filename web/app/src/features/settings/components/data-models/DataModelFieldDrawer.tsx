import { useEffect, useState } from 'react';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Checkbox,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Typography
} from 'antd';

import type {
  CreateSettingsDataModelFieldInput,
  SettingsDataModel,
  SettingsDataModelField,
  UpdateSettingsDataModelFieldInput
} from '../../api/data-models';
import { DataModelHelpTooltip } from './DataModelHelpTooltip';

const fieldKindOptions = [
  { label: '短文本', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '是/否', value: 'boolean' },
  { label: '日期时间', value: 'datetime' },
  { label: '枚举', value: 'enum' },
  { label: '长文本', value: 'text' },
  { label: 'JSON', value: 'json' },
  { label: '多对一关系', value: 'many_to_one' },
  { label: '一对多关系', value: 'one_to_many' },
  { label: '多对多关系', value: 'many_to_many' }
];

const displayInterfaceOptions = [
  { label: 'input', value: 'input' },
  { label: 'textarea', value: 'textarea' },
  { label: 'select', value: 'select' },
  { label: 'radio', value: 'radio' },
  { label: 'checkbox_group', value: 'checkbox_group' },
  { label: 'multi_select', value: 'multi_select' },
  { label: 'switch', value: 'switch' },
  { label: 'date_picker', value: 'date_picker' },
  { label: 'json_editor', value: 'json_editor' }
];

const enumDisplayFormatOptions = [
  { label: '单选', value: 'radio' },
  { label: '多选', value: 'checkbox_group' },
  { label: '下拉', value: 'select' },
  { label: '多选下拉', value: 'multi_select' }
];

const externalFieldKeyHelp = '外部数据源里的字段路径，例如 properties.email。';
const enumOptionValueHelp = '存储值会写入数据库和 API payload。';
const enumOptionLabelHelp = '显示值用于界面展示。';

interface FieldFormValues {
  code: string;
  title: string;
  external_field_key?: string;
  field_kind: string;
  is_required: boolean;
  is_unique: boolean;
  default_value_input?: string | string[] | boolean;
  enum_display_format?: string;
  enum_options?: Array<{
    label?: string;
    value?: string;
  }>;
  display_interface: string | null;
  display_options_json: string;
  relation_target_model_id: string | null;
  relation_options_json: string;
}

const relationFieldKinds = new Set(['many_to_one', 'one_to_many', 'many_to_many']);

function isRelationFieldKind(fieldKind: string | null | undefined) {
  return fieldKind ? relationFieldKinds.has(fieldKind) : false;
}

function defaultDisplayInterfaceForKind(fieldKind: string | null | undefined) {
  switch (fieldKind) {
    case 'text':
      return 'textarea';
    case 'boolean':
      return 'switch';
    case 'datetime':
      return 'date_picker';
    case 'enum':
      return 'select';
    case 'json':
      return 'json_editor';
    default:
      return 'input';
  }
}

function stringifyJson(value: unknown, fallback = '{}') {
  if (value === null || value === undefined) {
    return fallback;
  }

  return JSON.stringify(value, null, 2);
}

function parseJson(raw: string, fallback: unknown) {
  const trimmed = (raw ?? '').trim();

  if (!trimmed) {
    return fallback;
  }

  return JSON.parse(trimmed) as unknown;
}

function formatDefaultValueForForm(
  fieldKind: string | null | undefined,
  value: unknown,
  enumDisplayFormat?: string | null
) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (fieldKind === 'enum') {
    if (isMultipleEnumDisplayFormat(enumDisplayFormat)) {
      return Array.isArray(value) ? value.map(String) : [String(value)];
    }
    return Array.isArray(value) ? String(value[0] ?? '') : String(value);
  }

  if (fieldKind === 'boolean') {
    return value === true;
  }

  if (fieldKind === 'json') {
    return stringifyJson(value);
  }

  return String(value);
}

function isMultipleEnumDisplayFormat(value: string | null | undefined) {
  return value === 'checkbox_group' || value === 'multi_select';
}

function parseDefaultValue(
  fieldKind: string,
  raw: unknown,
  enumDisplayFormat?: string | null
) {
  if (
    raw === null ||
    raw === undefined ||
    raw === '' ||
    (Array.isArray(raw) && raw.length === 0)
  ) {
    return null;
  }

  if (fieldKind === 'enum') {
    if (isMultipleEnumDisplayFormat(enumDisplayFormat)) {
      return Array.isArray(raw) ? raw.map(String) : [String(raw)];
    }
    return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw);
  }

  if (fieldKind === 'boolean') {
    return raw === true;
  }

  if (fieldKind === 'number') {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      throw new Error('number');
    }
    return parsed;
  }

  if (fieldKind === 'json') {
    return parseJson(String(raw), null);
  }

  return String(raw);
}

function readEnumOptions(displayOptions: Record<string, unknown>) {
  const options = displayOptions.options;
  if (!Array.isArray(options)) {
    return [{ label: '', value: '' }];
  }

  const normalized = options
    .map((option) => {
      if (typeof option === 'string') {
        return { label: option, value: option };
      }
      if (typeof option === 'object' && option !== null) {
        const record = option as Record<string, unknown>;
        const value = typeof record.value === 'string' ? record.value : '';
        return {
          label:
            typeof record.label === 'string'
              ? record.label
              : value,
          value
        };
      }
      return null;
    })
    .filter((option): option is { label: string; value: string } => option !== null);

  return normalized.length > 0 ? normalized : [{ label: '', value: '' }];
}

function parseEnumOptions(
  options: FieldFormValues['enum_options']
) {
  return (options ?? [])
    .map((option) => ({
      label: option.label?.trim() ?? '',
      value: option.value?.trim() ?? ''
    }))
    .filter((option) => option.label || option.value)
    .map((option) => ({
      label: option.label || option.value,
      value: option.value || option.label
    }));
}

function normalizeEnumDisplayFormat(value: string | null | undefined): string {
  return value && enumDisplayFormatOptions.some((option) => option.value === value)
    ? value
    : 'select';
}

function createDefaultEnumOption() {
  const suffix = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return { label: '', value: `enum_${suffix}` };
}

export function DataModelFieldDrawer({
  open,
  mode,
  field,
  isExternalModel,
  modelOptions,
  saving,
  canManage,
  onClose,
  onCreate,
  onUpdate,
  onDelete
}: {
  open: boolean;
  mode: 'create' | 'edit';
  field: SettingsDataModelField | null;
  isExternalModel: boolean;
  modelOptions: SettingsDataModel[];
  saving: boolean;
  canManage: boolean;
  onClose: () => void;
  onCreate: (input: CreateSettingsDataModelFieldInput) => void;
  onUpdate: (
    field: SettingsDataModelField,
    input: UpdateSettingsDataModelFieldInput
  ) => void;
  onDelete: (field: SettingsDataModelField) => void;
}) {
  const [form] = Form.useForm<FieldFormValues>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const selectedFieldKind = Form.useWatch('field_kind', form) ?? 'string';
  const selectedEnumDisplayFormat =
    Form.useWatch('enum_display_format', form) ?? 'select';
  const watchedEnumOptions = Form.useWatch('enum_options', form) ?? [];
  const showsRelationSettings = isRelationFieldKind(selectedFieldKind);
  const showsEnumSettings = selectedFieldKind === 'enum';
  const showsDefaultValue = !showsRelationSettings;

  useEffect(() => {
    if (!open) {
      return;
    }
    setAdvancedOpen(false);

    if (mode === 'edit' && field) {
      form.setFieldsValue({
        code: field.code,
        title: field.title,
        external_field_key: field.external_field_key ?? '',
        field_kind: field.field_kind,
        is_required: field.is_required,
        is_unique: field.is_unique,
        default_value_input: formatDefaultValueForForm(
          field.field_kind,
          field.default_value,
          normalizeEnumDisplayFormat(field.display_interface)
        ),
        enum_display_format: normalizeEnumDisplayFormat(field.display_interface),
        enum_options: readEnumOptions(field.display_options),
        display_interface:
          field.display_interface ?? defaultDisplayInterfaceForKind(field.field_kind),
        display_options_json: stringifyJson(field.display_options),
        relation_target_model_id: field.relation_target_model_id,
        relation_options_json: stringifyJson(field.relation_options)
      });
      return;
    }

    form.setFieldsValue({
      code: '',
      title: '',
      external_field_key: '',
      field_kind: 'string',
      is_required: false,
      is_unique: false,
      default_value_input: undefined,
      enum_display_format: 'select',
      enum_options: [createDefaultEnumOption()],
      display_interface: 'input',
      display_options_json: '{}',
      relation_target_model_id: null,
      relation_options_json: '{}'
    });
  }, [field, form, mode, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    let defaultValue: unknown | null = null;
    let displayOptions: Record<string, unknown> = {};
    let relationOptions: Record<string, unknown> = {};

    try {
      defaultValue = parseDefaultValue(
        values.field_kind,
        values.default_value_input,
        values.enum_display_format
      );
    } catch {
      form.setFields([
        {
          name: 'default_value_input',
          errors:
            values.field_kind === 'json'
              ? ['请输入合法 JSON']
              : ['请输入符合字段类型的默认值']
        }
      ]);
      return;
    }

    try {
      displayOptions = parseJson(
        values.display_options_json,
        {}
      ) as Record<string, unknown>;
    } catch {
      form.setFields([
        {
          name: 'display_options_json',
          errors: ['请输入合法 JSON']
        }
      ]);
      return;
    }

    try {
      relationOptions = parseJson(
        values.relation_options_json,
        {}
      ) as Record<string, unknown>;
    } catch {
      form.setFields([
        {
          name: 'relation_options_json',
          errors: ['请输入合法 JSON']
        }
      ]);
      return;
    }

    if (values.field_kind === 'enum') {
      displayOptions = {
        ...displayOptions,
        options: parseEnumOptions(values.enum_options)
      };
    }

    const displayInterface =
      values.field_kind === 'enum'
        ? values.enum_display_format || 'select'
        : values.display_interface || defaultDisplayInterfaceForKind(values.field_kind);
    const relationTargetModelId = isRelationFieldKind(values.field_kind)
      ? values.relation_target_model_id || null
      : null;
    const normalizedRelationOptions = isRelationFieldKind(values.field_kind)
      ? relationOptions
      : {};

    if (mode === 'edit' && field) {
      onUpdate(field, {
        title: values.title,
        is_required: values.is_required,
        is_unique: values.is_unique,
        default_value: defaultValue,
        display_interface: displayInterface,
        display_options: displayOptions,
        relation_options: normalizedRelationOptions
      });
      onClose();
      return;
    }

    onCreate({
      code: values.code,
      title: values.title,
      external_field_key: isExternalModel ? values.external_field_key || null : null,
      field_kind: values.field_kind,
      is_required: values.is_required,
      is_unique: values.is_unique,
      default_value: defaultValue,
      display_interface: displayInterface,
      display_options: displayOptions,
      relation_target_model_id: relationTargetModelId,
      relation_options: normalizedRelationOptions
    });
    onClose();
  };

  const confirmDelete = () => {
    if (!field) {
      return;
    }

    setDeleteConfirmOpen(true);
  };

  const relationTargetOptions = modelOptions.map((model) => ({
    label: `${model.title} (${model.code})`,
    value: model.id
  }));
  const defaultEnumOptions = parseEnumOptions(watchedEnumOptions).map((option) => ({
    label: option.label,
    value: option.value
  }));

  function renderDefaultValueControl() {
    if (selectedFieldKind === 'enum') {
      if (selectedEnumDisplayFormat === 'radio') {
        return <Radio.Group options={defaultEnumOptions} />;
      }

      if (selectedEnumDisplayFormat === 'checkbox_group') {
        return <Checkbox.Group options={defaultEnumOptions} />;
      }

      return (
        <Select
          allowClear
          mode={selectedEnumDisplayFormat === 'multi_select' ? 'multiple' : undefined}
          options={defaultEnumOptions}
        />
      );
    }

    if (selectedFieldKind === 'boolean') {
      return (
        <Select
          allowClear
          options={[
            { label: '是', value: true },
            { label: '否', value: false }
          ]}
        />
      );
    }

    if (selectedFieldKind === 'json') {
      return <Input.TextArea rows={3} placeholder='{ "key": "value" }' />;
    }

    return (
      <Input
        type={selectedFieldKind === 'number' ? 'number' : undefined}
        placeholder={
          selectedFieldKind === 'datetime'
            ? '例如 2026-05-07T12:00:00Z'
            : undefined
        }
      />
    );
  }

  function renderRuleSettings() {
    return (
      <>
        <Divider />
        <Typography.Title level={5}>规则</Typography.Title>
        <Space size="large">
          <Form.Item name="is_required" valuePropName="checked">
            <Checkbox>必填</Checkbox>
          </Form.Item>
          <Form.Item name="is_unique" valuePropName="checked">
            <Checkbox>唯一</Checkbox>
          </Form.Item>
        </Space>
        {showsDefaultValue ? (
          <Form.Item
            name="default_value_input"
            label={selectedFieldKind === 'json' ? '默认值 JSON' : '默认值'}
          >
            {renderDefaultValueControl()}
          </Form.Item>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Drawer
        title={mode === 'create' ? '新增字段' : '编辑字段'}
        open={open}
        width={560}
        onClose={onClose}
        extra={
          <Space>
            {mode === 'edit' ? (
              <Button danger disabled={!canManage || saving} onClick={confirmDelete}>
                删除字段
              </Button>
            ) : null}
            <Button
              type="primary"
              loading={saving}
              disabled={!canManage}
              onClick={handleSubmit}
            >
              {mode === 'create' ? '创建字段' : '保存字段'}
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          disabled={!canManage}
          initialValues={{
            field_kind: 'string',
            is_required: false,
            is_unique: false,
            display_interface: 'input',
            display_options_json: '{}',
            relation_options_json: '{}'
          }}
        >
          <Typography.Title level={5}>基础信息</Typography.Title>
          <Form.Item
            name="title"
            label="字段标题"
            rules={[{ required: true, message: '请输入字段标题' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label="字段 Code"
            rules={[{ required: true, message: '请输入字段 Code' }]}
          >
            <Input disabled={mode === 'edit'} />
          </Form.Item>
          <Form.Item
            name="field_kind"
            label="字段类型"
            rules={[{ required: true, message: '请选择字段类型' }]}
          >
            <Select options={fieldKindOptions} disabled={mode === 'edit'} />
          </Form.Item>

          {isExternalModel ? (
            <Form.Item
              name="external_field_key"
              label="外部字段映射 Key"
              tooltip={externalFieldKeyHelp}
              rules={[
                {
                  required: mode === 'create',
                  message: '请输入外部字段映射 Key'
                }
              ]}
            >
              <Input disabled={mode === 'edit'} />
            </Form.Item>
          ) : null}

          {showsEnumSettings ? null : renderRuleSettings()}

          {showsEnumSettings ? (
            <>
              <Divider />
              <Typography.Title level={5}>枚举配置</Typography.Title>
              <Form.Item
                name="enum_display_format"
                label="显示格式"
                rules={[{ required: true, message: '请选择显示格式' }]}
              >
                <Select
                  options={enumDisplayFormatOptions}
                  onChange={(value) => {
                    const currentDefaultValue = form.getFieldValue('default_value_input');
                    if (isMultipleEnumDisplayFormat(value)) {
                      form.setFieldValue(
                        'default_value_input',
                        Array.isArray(currentDefaultValue)
                          ? currentDefaultValue
                          : currentDefaultValue
                            ? [currentDefaultValue]
                            : []
                      );
                      return;
                    }

                    form.setFieldValue(
                      'default_value_input',
                      Array.isArray(currentDefaultValue)
                        ? currentDefaultValue[0]
                        : currentDefaultValue
                    );
                  }}
                />
              </Form.Item>
              <Form.Item
                label="枚举选项"
              >
                <Form.List
                  name="enum_options"
                  initialValue={[createDefaultEnumOption()]}
                >
                  {(fields, { add, remove }) => (
                    <div className="data-model-panel__enum-options">
                      <div className="data-model-panel__enum-options-head">
                        <span className="data-model-panel__enum-options-index" />
                        <span className="data-model-panel__enum-options-heading">
                          <span>存储值</span>
                          <DataModelHelpTooltip
                            label="存储值"
                            title={enumOptionValueHelp}
                          />
                        </span>
                        <span className="data-model-panel__enum-options-heading">
                          <span>显示值</span>
                          <DataModelHelpTooltip
                            label="显示值"
                            title={enumOptionLabelHelp}
                          />
                        </span>
                        <span className="data-model-panel__enum-options-action" />
                      </div>
                      {fields.map(({ key, name, ...restField }, index) => (
                        <div key={key} className="data-model-panel__enum-option-row">
                          <span className="data-model-panel__enum-options-index">
                            {index + 1}
                          </span>
                          <div className="data-model-panel__enum-option-cell">
                            <Form.Item
                              {...restField}
                              name={[name, 'value']}
                              rules={[{ required: true, message: '请输入存储值' }]}
                            >
                              <Input
                                aria-label={`选项 ${index + 1} 存储值`}
                                placeholder="value"
                              />
                            </Form.Item>
                          </div>
                          <div className="data-model-panel__enum-option-cell">
                            <Form.Item
                              {...restField}
                              name={[name, 'label']}
                              rules={[{ required: true, message: '请输入显示值' }]}
                            >
                              <Input
                                aria-label={`选项 ${index + 1} 显示值`}
                                placeholder="label"
                              />
                            </Form.Item>
                          </div>
                          <Button
                            danger
                            type="text"
                            aria-label={`删除选项 ${index + 1}`}
                            icon={<DeleteOutlined />}
                            disabled={fields.length <= 1}
                            onClick={() => remove(name)}
                            className="data-model-panel__enum-options-action"
                          />
                        </div>
                      ))}
                      <Button
                        block
                        aria-label="添加选项"
                        icon={<PlusOutlined />}
                        onClick={() => add(createDefaultEnumOption())}
                        className="data-model-panel__enum-add"
                      >
                        添加选项
                      </Button>
                    </div>
                  )}
                </Form.List>
              </Form.Item>
            </>
          ) : null}

          {showsEnumSettings ? renderRuleSettings() : null}

          {showsRelationSettings ? (
            <>
              <Divider />
              <Typography.Title level={5}>关系配置</Typography.Title>
              <Form.Item
                name="relation_target_model_id"
                label="目标数据表"
                rules={[
                  {
                    required: mode === 'create',
                    message: '请选择目标数据表'
                  }
                ]}
              >
                <Select
                  allowClear
                  disabled={mode === 'edit'}
                  options={relationTargetOptions}
                />
              </Form.Item>
            </>
          ) : null}

          <Divider />
          <Button type="link" onClick={() => setAdvancedOpen((value) => !value)}>
            高级显示设置
          </Button>
          {advancedOpen ? (
            <>
              {showsEnumSettings ? null : (
                <Form.Item name="display_interface" label="显示控件">
                  <Select allowClear options={displayInterfaceOptions} />
                </Form.Item>
              )}
              <Form.Item
                name="display_options_json"
                label="显示控件配置 JSON"
              >
                <Input.TextArea rows={3} />
              </Form.Item>
              {showsRelationSettings ? (
                <Form.Item
                  name="relation_options_json"
                  label="关系配置 JSON"
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
              ) : null}
            </>
          ) : null}
        </Form>
      </Drawer>
      <Modal
        title="确认删除字段"
        open={deleteConfirmOpen}
        okText="删除"
        okType="danger"
        cancelText="取消"
        okButtonProps={{ 'aria-label': '删除' }}
        onCancel={() => setDeleteConfirmOpen(false)}
        onOk={() => {
          if (field) {
            onDelete(field);
          }
          setDeleteConfirmOpen(false);
          onClose();
        }}
      >
        {field
          ? `确定删除字段 "${field.title}" (${field.code}) 吗？此操作会同步变更数据结构。`
          : null}
      </Modal>
    </>
  );
}
