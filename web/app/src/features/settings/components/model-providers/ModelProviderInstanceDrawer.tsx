import { useEffect } from 'react';

import {
  Button,
  Divider,
  Descriptions,
  Drawer,
  Form,
  Input,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';

import type {
  SettingsModelProviderCatalogEntry,
  SettingsModelProviderInstance
} from '../../api/model-providers';

type DrawerMode = 'create' | 'edit';
type ModelProviderFormValue = string | boolean;

function normalizeConfigFieldValue(value: unknown): ModelProviderFormValue {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function buildInitialConfig(
  entry: SettingsModelProviderCatalogEntry | null,
  instance: SettingsModelProviderInstance | null
) {
  const currentConfig = instance?.config_json ?? {};
  const nextConfig: Record<string, ModelProviderFormValue> = {};

  for (const field of entry?.form_schema ?? []) {
    const currentValue = currentConfig[field.key];

    if (currentValue !== undefined) {
      nextConfig[field.key] = normalizeConfigFieldValue(currentValue);
      continue;
    }

    if (field.field_type === 'boolean') {
      nextConfig[field.key] = field.key === 'validate_model';
      continue;
    }

    if (field.key === 'base_url' && entry?.default_base_url) {
      nextConfig[field.key] = entry.default_base_url;
      continue;
    }

    nextConfig[field.key] = '';
  }

  return nextConfig;
}

function renderConfigField(
  mode: DrawerMode,
  entry: SettingsModelProviderCatalogEntry,
  field: SettingsModelProviderCatalogEntry['form_schema'][number]
) {
  const label =
    field.key === 'base_url'
      ? 'API Endpoint'
      : field.key === 'api_key'
        ? 'API Key'
        : field.key;

  if (field.field_type === 'boolean') {
    return (
      <Form.Item
        key={field.key}
        label={label}
        name={['config', field.key]}
        valuePropName="checked"
        extra={field.key === 'validate_model' ? '保存后默认执行模型可用性校验。' : undefined}
      >
        <Switch />
      </Form.Item>
    );
  }

  const isSecret = field.field_type === 'secret';
  const useTextArea =
    field.key.includes('headers') || field.key.includes('json') || field.key.includes('schema');

  return (
    <Form.Item
      key={field.key}
      label={label}
      name={['config', field.key]}
      rules={
        field.required && (!isSecret || mode === 'create')
          ? [{ required: true, message: `请填写 ${label}` }]
          : undefined
      }
      extra={
        isSecret
          ? mode === 'edit'
            ? '留空表示保留当前密钥，不会覆盖。'
            : '敏感字段仅用于加密存储，不会在列表和接口中回显。'
          : field.key === 'base_url'
            ? '支持输入标准 OpenAI 兼容地址；未填写时会优先使用插件默认值。'
            : undefined
      }
    >
      {isSecret ? (
        <Input placeholder="输入 API Key" autoComplete="off" />
      ) : useTextArea ? (
        <Input.TextArea rows={4} placeholder={field.key === 'base_url' ? entry.default_base_url ?? '' : undefined} />
      ) : (
        <Input placeholder={field.key === 'base_url' ? entry.default_base_url ?? '' : undefined} />
      )}
    </Form.Item>
  );
}

export function ModelProviderInstanceDrawer({
  open,
  mode,
  catalogEntry,
  instance,
  submitting,
  onClose,
  onSubmit
}: {
  open: boolean;
  mode: DrawerMode;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  instance: SettingsModelProviderInstance | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { display_name: string; config: Record<string, unknown> }) => Promise<void>;
}) {
  const [form] = Form.useForm<{
    display_name: string;
    config: Record<string, ModelProviderFormValue>;
  }>();

  useEffect(() => {
    if (!open) {
      form.resetFields();
      return;
    }

    form.setFieldsValue({
      display_name: instance?.display_name ?? catalogEntry?.display_name ?? '',
      config: buildInitialConfig(catalogEntry, instance)
    });
  }, [catalogEntry, form, instance, open]);

  const title = mode === 'create' ? 'API 密钥授权配置' : '编辑 API 密钥配置';

  return (
    <Drawer
      open={open}
      width={560}
      forceRender
      title={title}
      onClose={onClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={submitting}
            onClick={async () => {
              const values = await form.validateFields();
              await onSubmit({
                display_name: values.display_name,
                config: values.config
              });
            }}
          >
            保存实例
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        {catalogEntry ? (
          <>
            <Descriptions
              size="small"
              column={1}
              items={[
                {
                  key: 'provider',
                  label: '供应商',
                  children: `${catalogEntry.display_name} (${catalogEntry.provider_code})`
                },
                {
                  key: 'protocol',
                  label: '协议',
                  children: (
                    <Space wrap size={6}>
                      <Tag>{catalogEntry.protocol}</Tag>
                      <Tag>{catalogEntry.model_discovery_mode}</Tag>
                    </Space>
                  )
                },
                {
                  key: 'models',
                  label: '预置模型',
                  children: String(catalogEntry.predefined_models.length)
                }
              ]}
            />

            <Typography.Paragraph
              type="secondary"
              className="model-provider-panel__drawer-note"
            >
              配置完成后，当前 workspace 内的成员都可以在模型选择器中使用这个实例。密钥仅会加密存储。
            </Typography.Paragraph>

            <Form.Item
              label="凭据名称"
              name="display_name"
              rules={[{ required: true, message: '请填写凭据名称' }]}
            >
              <Input placeholder="例如：OpenAI Production" />
            </Form.Item>

            <Divider orientation="left">连接配置</Divider>
            {catalogEntry.form_schema.map((field) =>
              renderConfigField(mode, catalogEntry, field)
            )}
          </>
        ) : (
          <Typography.Text type="secondary">当前没有可用 provider catalog。</Typography.Text>
        )}
      </Form>
    </Drawer>
  );
}
