import { useEffect, useState } from 'react';

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

function buildFieldLabel(key: string) {
  if (key === 'base_url') {
    return 'API Endpoint';
  }

  if (key === 'api_key') {
    return 'API Key';
  }

  return key;
}

function maskSecretPreview(value: string) {
  if (value.length <= 8) {
    return '****';
  }

  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function buildInitialConfig(
  mode: DrawerMode,
  entry: SettingsModelProviderCatalogEntry | null,
  instance: SettingsModelProviderInstance | null
) {
  const currentConfig = instance?.config_json ?? {};
  const nextConfig: Record<string, ModelProviderFormValue> = {};

  for (const field of entry?.form_schema ?? []) {
    if (mode === 'edit' && field.field_type === 'secret') {
      nextConfig[field.key] = '';
      continue;
    }

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

function isTextAreaField(key: string) {
  return key.includes('headers') || key.includes('json') || key.includes('schema');
}

export function ModelProviderInstanceDrawer({
  open,
  mode,
  catalogEntry,
  instance,
  submitting,
  onClose,
  onSubmit,
  onRevealSecret
}: {
  open: boolean;
  mode: DrawerMode;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  instance: SettingsModelProviderInstance | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { display_name: string; config: Record<string, unknown> }) => Promise<void>;
  onRevealSecret: (fieldKey: string) => Promise<string>;
}) {
  const [form] = Form.useForm<{
    display_name: string;
    config: Record<string, ModelProviderFormValue>;
  }>();
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [revealedSecretKeys, setRevealedSecretKeys] = useState<Record<string, boolean>>({});
  const [revealingSecretKey, setRevealingSecretKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setSecretDrafts({});
      setRevealedSecretKeys({});
      setRevealingSecretKey(null);
      return;
    }

    form.setFieldsValue({
      display_name: instance?.display_name ?? catalogEntry?.display_name ?? '',
      config: buildInitialConfig(mode, catalogEntry, instance)
    });
    setSecretDrafts({});
    setRevealedSecretKeys({});
    setRevealingSecretKey(null);
  }, [catalogEntry, form, instance, mode, open]);

  async function handleRevealSecret(fieldKey: string) {
    setRevealingSecretKey(fieldKey);

    try {
      const value = await onRevealSecret(fieldKey);
      setSecretDrafts((current) => ({
        ...current,
        [fieldKey]: value
      }));
      setRevealedSecretKeys((current) => ({
        ...current,
        [fieldKey]: true
      }));
    } finally {
      setRevealingSecretKey((current) => (current === fieldKey ? null : current));
    }
  }

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
              const config = {
                ...(values.config ?? {})
              };

              if (mode === 'edit' && catalogEntry) {
                for (const field of catalogEntry.form_schema) {
                  if (field.field_type !== 'secret') {
                    continue;
                  }

                  const nextSecret = secretDrafts[field.key];
                  delete config[field.key];
                  if (typeof nextSecret === 'string' && nextSecret.length > 0) {
                    config[field.key] = nextSecret;
                  }
                }
              }

              await onSubmit({
                display_name: values.display_name,
                config
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
            {catalogEntry.form_schema.map((field) => {
              const label = buildFieldLabel(field.key);

              if (field.field_type === 'boolean') {
                return (
                  <Form.Item
                    key={field.key}
                    label={label}
                    name={['config', field.key]}
                    valuePropName="checked"
                    extra={
                      field.key === 'validate_model'
                        ? '保存后默认执行模型可用性校验。'
                        : undefined
                    }
                  >
                    <Switch />
                  </Form.Item>
                );
              }

              const isSecret = field.field_type === 'secret';
              const useTextArea = isTextAreaField(field.key);

              if (isSecret && mode === 'edit') {
                const previewSource =
                  secretDrafts[field.key] ??
                  (typeof instance?.config_json[field.key] === 'string'
                    ? String(instance.config_json[field.key])
                    : '');
                const previewValue = previewSource
                  ? previewSource.includes('****')
                    ? previewSource
                    : maskSecretPreview(previewSource)
                  : '未配置';

                return (
                  <Form.Item
                    key={field.key}
                    label={label}
                    extra="留空表示保留当前密钥；点击显示后才能查看和修改当前值。"
                  >
                    {revealedSecretKeys[field.key] ? (
                      <Space.Compact block>
                        <Input
                          aria-label={label}
                          autoComplete="off"
                          value={secretDrafts[field.key] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSecretDrafts((current) => ({
                              ...current,
                              [field.key]: value
                            }));
                          }}
                        />
                        <Button
                          onClick={() => {
                            setRevealedSecretKeys((current) => ({
                              ...current,
                              [field.key]: false
                            }));
                          }}
                        >
                          隐藏 {label}
                        </Button>
                      </Space.Compact>
                    ) : (
                      <Space.Compact block>
                        <Input aria-label={label} readOnly value={previewValue} />
                        <Button
                          loading={revealingSecretKey === field.key}
                          onClick={() => {
                            void handleRevealSecret(field.key).catch(() => undefined);
                          }}
                        >
                          显示 {label}
                        </Button>
                      </Space.Compact>
                    )}
                  </Form.Item>
                );
              }

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
                      ? '敏感字段仅用于加密存储，不会在列表和接口中回显。'
                      : field.key === 'base_url'
                        ? '支持输入标准 OpenAI 兼容地址；未填写时会优先使用插件默认值。'
                        : undefined
                  }
                >
                  {useTextArea ? (
                    <Input.TextArea
                      rows={4}
                      placeholder={
                        field.key === 'base_url' ? catalogEntry.default_base_url ?? '' : undefined
                      }
                    />
                  ) : (
                    <Input
                      autoComplete={isSecret ? 'off' : undefined}
                      placeholder={
                        field.key === 'base_url' ? catalogEntry.default_base_url ?? '' : undefined
                      }
                    />
                  )}
                </Form.Item>
              );
            })}
          </>
        ) : (
          <Typography.Text type="secondary">当前没有可用 provider catalog。</Typography.Text>
        )}
      </Form>
    </Drawer>
  );
}
