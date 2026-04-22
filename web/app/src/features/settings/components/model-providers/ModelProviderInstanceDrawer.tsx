import { useEffect, useRef, useState } from 'react';

import {
  AutoComplete,
  Button,
  Collapse,
  Divider,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Form,
  Input,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';

import type {
  SettingsModelProviderCatalogEntry,
  SettingsModelProviderInstance,
  SettingsModelProviderModelCatalog,
  PreviewSettingsModelProviderModelsResponse
} from '../../api/model-providers';

type DrawerMode = 'create' | 'edit';
type ModelProviderFormValue = string | boolean;
type ModelProviderConfigField = SettingsModelProviderCatalogEntry['form_schema'][number];
type PreviewModelDescriptor = SettingsModelProviderModelCatalog['models'][number];
type PreviewModelsResponse = PreviewSettingsModelProviderModelsResponse;
type ConfiguredModelRow = {
  key: string;
  model_id: string;
  enabled: boolean;
};

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

function isPreviewOnlyField(field: ModelProviderConfigField) {
  return field.key === 'validate_model';
}

export function ModelProviderInstanceDrawer({
  open,
  mode,
  catalogEntry,
  instance,
  submitting,
  onClose,
  onSubmit,
  onPreviewModels,
  onRevealSecret
}: {
  open: boolean;
  mode: DrawerMode;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  instance: SettingsModelProviderInstance | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: {
    display_name: string;
    config: Record<string, unknown>;
    configured_models: Array<{
      model_id: string;
      enabled: boolean;
    }>;
    preview_token?: string;
  }) => Promise<void>;
  onPreviewModels: (config: Record<string, unknown>) => Promise<PreviewModelsResponse>;
  onRevealSecret: (fieldKey: string) => Promise<string>;
}) {
  const [form] = Form.useForm<{
    display_name: string;
    config: Record<string, ModelProviderFormValue>;
  }>();
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [revealedSecretKeys, setRevealedSecretKeys] = useState<Record<string, boolean>>({});
  const [revealingSecretKey, setRevealingSecretKey] = useState<string | null>(null);
  const [previewModels, setPreviewModels] = useState<PreviewModelDescriptor[]>([]);
  const configuredModelKeyRef = useRef(0);
  const [configuredModels, setConfiguredModels] = useState<ConfiguredModelRow[]>([]);
  const [previewToken, setPreviewToken] = useState<string | undefined>();
  const [previewingModels, setPreviewingModels] = useState(false);

  function nextConfiguredModelKey() {
    const key = `configured-model-${configuredModelKeyRef.current}`;
    configuredModelKeyRef.current += 1;
    return key;
  }

  function buildInitialConfiguredModels() {
    const sourceModels =
      Array.isArray(instance?.configured_models) && instance.configured_models.length > 0
        ? instance.configured_models
        : (instance?.enabled_model_ids ?? []).map((modelId) => ({
            model_id: modelId,
            enabled: true
          }));

    configuredModelKeyRef.current = 0;
    return sourceModels.map((model) => ({
      key: nextConfiguredModelKey(),
      model_id: model.model_id,
      enabled: model.enabled
    }));
  }

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setSecretDrafts({});
      setRevealedSecretKeys({});
      setRevealingSecretKey(null);
      setPreviewModels([]);
      configuredModelKeyRef.current = 0;
      setConfiguredModels([]);
      setPreviewToken(undefined);
      setPreviewingModels(false);
      return;
    }

    form.setFieldsValue({
      display_name: instance?.display_name ?? catalogEntry?.display_name ?? '',
      config: buildInitialConfig(mode, catalogEntry, instance)
    });
    setConfiguredModels(buildInitialConfiguredModels());
    setSecretDrafts({});
    setRevealedSecretKeys({});
    setRevealingSecretKey(null);
    setPreviewModels([]);
    setPreviewToken(undefined);
    setPreviewingModels(false);
  }, [catalogEntry, form, instance, mode, open]);

  function clearPreviewState() {
    setPreviewModels([]);
    setPreviewToken(undefined);
  }

  function normalizeConfiguredModels(rows: ConfiguredModelRow[]) {
    const normalizedRows: Array<{
      model_id: string;
      enabled: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const normalizedModelId = row.model_id.trim();
      if (!normalizedModelId || seen.has(normalizedModelId)) {
        continue;
      }

      seen.add(normalizedModelId);
      normalizedRows.push({
        model_id: normalizedModelId,
        enabled: row.enabled
      });
    }

    return normalizedRows;
  }

  function appendConfiguredModelRow(initial?: Partial<ConfiguredModelRow>) {
    setConfiguredModels((current) => [
      ...current,
      {
        key: nextConfiguredModelKey(),
        model_id: initial?.model_id ?? '',
        enabled: initial?.enabled ?? true
      }
    ]);
  }

  async function handleRevealSecret(fieldKey: string) {
    setRevealingSecretKey(fieldKey);

    try {
      const value = await onRevealSecret(fieldKey);
      setSecretDrafts((current) => ({
        ...current,
        [fieldKey]: value
      }));
      clearPreviewState();
      setRevealedSecretKeys((current) => ({
        ...current,
        [fieldKey]: true
      }));
    } finally {
      setRevealingSecretKey((current) => (current === fieldKey ? null : current));
    }
  }

  const title = mode === 'create' ? 'API 密钥授权配置' : '编辑 API 密钥配置';
  const formSchema = (catalogEntry?.form_schema ?? []).filter(
    (field) => !isPreviewOnlyField(field)
  );
  const primaryConfigFields = formSchema.filter((field) => !field.advanced);
  const advancedConfigFields = formSchema.filter((field) => field.advanced);
  const modelAutocompleteOptions = previewModels.map((model) => ({
    label: model.model_id,
    value: model.model_id
  }));

  function buildDraftConfig(valuesConfig: Record<string, ModelProviderFormValue>) {
    const config: Record<string, unknown> = {
      ...(valuesConfig ?? {})
    };

    if (mode === 'edit' && catalogEntry) {
      for (const field of catalogEntry.form_schema) {
        if (field.field_type !== 'secret') {
          continue;
        }

        delete config[field.key];
        const nextSecret = secretDrafts[field.key];
        if (typeof nextSecret === 'string' && nextSecret.length > 0) {
          config[field.key] = nextSecret;
        }
      }
    }

    delete config.validate_model;
    return config;
  }

  function updateConfiguredModelRow(
    rowKey: string,
    patch: Partial<Pick<ConfiguredModelRow, 'model_id' | 'enabled'>>
  ) {
    setConfiguredModels((current) =>
      current.map((row) => (row.key === rowKey ? { ...row, ...patch } : row))
    );
  }

  function removeConfiguredModelRow(rowKey: string) {
    setConfiguredModels((current) => current.filter((row) => row.key !== rowKey));
  }

  async function handlePreviewModels() {
    const fieldNames = formSchema
      .filter((field) => !(mode === 'edit' && field.field_type === 'secret'))
      .map((field) => ['config', field.key]);
    const values = await form.validateFields(fieldNames);
    setPreviewingModels(true);

    try {
      const preview = await onPreviewModels(
        buildDraftConfig((values.config ?? {}) as Record<string, ModelProviderFormValue>)
      );
      setPreviewModels(preview.models);
      setPreviewToken(preview.preview_token);
    } finally {
      setPreviewingModels(false);
    }
  }

  function renderConfigField(field: ModelProviderConfigField) {
    const label = buildFieldLabel(field.key);

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
                  clearPreviewState();
                }}
              />
              <Button
                onClick={() => {
                  clearPreviewState();
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
              field.key === 'base_url' ? catalogEntry?.default_base_url ?? '' : undefined
            }
          />
        ) : (
          <Input
            autoComplete={isSecret ? 'off' : undefined}
            placeholder={
              field.key === 'base_url' ? catalogEntry?.default_base_url ?? '' : undefined
            }
          />
        )}
      </Form.Item>
    );
  }

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
          <Button
            loading={previewingModels}
            onClick={() => {
              void handlePreviewModels();
            }}
          >
            检测
          </Button>
          <Button
            type="primary"
            loading={submitting}
            onClick={async () => {
              const values = await form.validateFields();
              await onSubmit({
                display_name: values.display_name,
                config: buildDraftConfig(values.config ?? {}),
                configured_models: normalizeConfiguredModels(configuredModels),
                preview_token: previewToken
              });
            }}
          >
            保存
          </Button>
          <Button onClick={onClose}>取消</Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onValuesChange={(changedValues) => {
          if ('config' in changedValues) {
            clearPreviewState();
          }
        }}
      >
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
            {primaryConfigFields.map(renderConfigField)}
            {advancedConfigFields.length > 0 ? (
              <Collapse
                className="model-provider-panel__advanced-collapse"
                items={[
                  {
                    key: 'advanced-config',
                    label: '高级配置（可选）',
                    children: advancedConfigFields.map(renderConfigField)
                  }
                ]}
              />
            ) : null}

            <Divider orientation="left">模型配置</Divider>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Flex justify="space-between" align="center" gap={12}>
                <Typography.Text type="secondary">
                  {previewModels.length > 0
                    ? `已检测到 ${previewModels.length} 个候选模型。每一行都可直接输入 model id，也可从下拉缓存选择，再单独切换启用状态。`
                    : '先点击“检测”获取候选模型缓存，再按行录入 model id、启用状态和删除动作。'}
                </Typography.Text>
                <Button type="dashed" onClick={() => appendConfiguredModelRow()}>
                  添加模型
                </Button>
              </Flex>

              <div
                style={{
                  border: '1px solid var(--ant-color-border-secondary)',
                  borderRadius: 8,
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 96px 72px',
                    gap: 12,
                    padding: '10px 12px',
                    background: 'var(--ant-color-fill-tertiary)',
                    alignItems: 'center'
                  }}
                >
                  <Typography.Text strong>模型 ID</Typography.Text>
                  <Typography.Text strong>启用</Typography.Text>
                  <Typography.Text strong>操作</Typography.Text>
                </div>

                {configuredModels.length > 0 ? (
                  configuredModels.map((row, index) => (
                    <div
                      key={row.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) 96px 72px',
                        gap: 12,
                        padding: '12px',
                        borderTop: '1px solid var(--ant-color-border-secondary)',
                        alignItems: 'center'
                      }}
                    >
                      <AutoComplete
                        value={row.model_id}
                        options={modelAutocompleteOptions}
                        onChange={(value) => {
                          updateConfiguredModelRow(row.key, {
                            model_id: String(value)
                          });
                        }}
                        placeholder={
                          previewModels.length > 0
                            ? '输入或从检测缓存选择 model id'
                            : '输入 model id'
                        }
                        filterOption={(inputValue, option) =>
                          String(option?.value ?? '')
                            .toLowerCase()
                            .includes(inputValue.toLowerCase())
                        }
                      >
                        <Input aria-label={`模型 ID ${index + 1}`} />
                      </AutoComplete>
                      <Switch
                        aria-label={`启用模型 ${index + 1}`}
                        checked={row.enabled}
                        onChange={(checked) => {
                          updateConfiguredModelRow(row.key, {
                            enabled: checked
                          });
                        }}
                      />
                      <Button
                        danger
                        type="text"
                        aria-label={`删除模型 ${index + 1}`}
                        onClick={() => removeConfiguredModelRow(row.key)}
                      >
                        删除
                      </Button>
                    </div>
                  ))
                ) : (
                  <div
                    style={{
                      padding: '24px 12px',
                      borderTop: '1px solid var(--ant-color-border-secondary)'
                    }}
                  >
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="还没有配置模型，点击“添加模型”开始录入。"
                    />
                  </div>
                )}
              </div>
            </Space>
          </>
        ) : (
          <Typography.Text type="secondary">当前没有可用 provider catalog。</Typography.Text>
        )}
      </Form>
    </Drawer>
  );
}
