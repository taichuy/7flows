import { useEffect, useRef, useState } from 'react';

import {
  AutoComplete,
  Button,
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
import { CollapseShell } from '../../../../shared/ui/collapse-shell/CollapseShell';
import { CachedModelSelect } from './CachedModelSelect';

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

const CONFIGURED_MODEL_GRID_TEMPLATE_COLUMNS = 'minmax(0, 1fr) 48px 40px';
const CONFIGURED_MODEL_GRID_GAP = 8;

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

function shouldOmitDraftConfigValue(value: ModelProviderFormValue | undefined) {
  return typeof value === 'string' && value.length === 0;
}

export function ModelProviderInstanceDrawer({
  open,
  mode,
  catalogEntry,
  instance,
  cachedModelCatalog,
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
  cachedModelCatalog: SettingsModelProviderModelCatalog | null;
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
  const [selectedCachedModelId, setSelectedCachedModelId] = useState<string | undefined>();
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
      setSelectedCachedModelId(undefined);
      setPreviewToken(undefined);
      setPreviewingModels(false);
      return;
    }

    form.setFieldsValue({
      display_name: instance?.display_name ?? catalogEntry?.display_name ?? '',
      config: buildInitialConfig(mode, catalogEntry, instance)
    });
    setPreviewModels([]);
    setConfiguredModels(buildInitialConfiguredModels());
    setSelectedCachedModelId(undefined);
    setSecretDrafts({});
    setRevealedSecretKeys({});
    setRevealingSecretKey(null);
    setPreviewToken(undefined);
    setPreviewingModels(false);
  }, [catalogEntry, form, instance, mode, open]);

  useEffect(() => {
    if (!open || mode !== 'edit' || !cachedModelCatalog || previewModels.length > 0) {
      return;
    }

    setPreviewModels(cachedModelCatalog.models);
  }, [cachedModelCatalog, mode, open, previewModels.length]);

  function clearPreviewState() {
    setPreviewModels([]);
    setPreviewToken(undefined);
    setSelectedCachedModelId(undefined);
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

  function applyCachedModelSelection(modelId: string | null) {
    setSelectedCachedModelId(modelId ?? undefined);
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
  const editableConfigFields = formSchema.filter(
    (field) => !(mode === 'edit' && field.field_type === 'secret')
  );
  const configFieldNames = editableConfigFields.map((field) => ['config', field.key] as const);
  const primaryConfigFields = formSchema.filter((field) => !field.advanced);
  const advancedConfigFields = formSchema.filter((field) => field.advanced);
  const modelAutocompleteOptions = previewModels.map((model) => ({
    label: model.model_id,
    value: model.model_id
  }));

  function buildDraftConfig(valuesConfig: Record<string, ModelProviderFormValue>) {
    const config: Record<string, unknown> = {};

    for (const field of editableConfigFields) {
      const nextValue = valuesConfig?.[field.key];
      if (nextValue === undefined || shouldOmitDraftConfigValue(nextValue)) {
        continue;
      }

      config[field.key] = nextValue;
    }

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
    const values = await form.validateFields(configFieldNames);
    setPreviewingModels(true);

    try {
      const preview = await onPreviewModels(
        buildDraftConfig((values.config ?? {}) as Record<string, ModelProviderFormValue>)
      );
      setPreviewModels(preview.models);
      setSelectedCachedModelId(undefined);
      setPreviewToken(preview.preview_token);
    } finally {
      setPreviewingModels(false);
    }
  }

  async function handleSubmit() {
    const values = await form.validateFields([['display_name'], ...configFieldNames]);
    await onSubmit({
      display_name: values.display_name,
      config: buildDraftConfig((values.config ?? {}) as Record<string, ModelProviderFormValue>),
      configured_models: normalizeConfiguredModels(configuredModels),
      preview_token: previewToken
    });
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
              void handlePreviewModels().catch(() => undefined);
            }}
          >
            检测
          </Button>
          <Button
            type="primary"
            loading={submitting}
            onClick={() => {
              void handleSubmit().catch(() => undefined);
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
              <CollapseShell
                variant="compact"
                items={[
                  {
                    key: 'advanced-config',
                    header: '高级配置（可选）',
                    children: advancedConfigFields.map(renderConfigField)
                  }
                ]}
              />
            ) : null}

            <Divider orientation="left">模型配置</Divider>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Flex align="center" gap={12} style={{ width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <CachedModelSelect
                    modelIds={previewModels.map((model) => model.model_id)}
                    ariaLabel="缓存模型"
                    placeholder="缓存模型"
                    value={selectedCachedModelId}
                    emptyMode="select"
                    style={{ width: '100%' }}
                    onChange={applyCachedModelSelection}
                  />
                </div>
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
                    gridTemplateColumns: CONFIGURED_MODEL_GRID_TEMPLATE_COLUMNS,
                    gap: CONFIGURED_MODEL_GRID_GAP,
                    padding: '10px 12px',
                    background: 'var(--ant-color-fill-tertiary)',
                    alignItems: 'center'
                  }}
                >
                  <Typography.Text strong>模型 ID</Typography.Text>
                  <Typography.Text strong style={{ textAlign: 'center' }}>
                    启用
                  </Typography.Text>
                  <Typography.Text strong style={{ textAlign: 'center' }}>
                    操作
                  </Typography.Text>
                </div>

                {configuredModels.length > 0 ? (
                  configuredModels.map((row, index) => (
                    <div
                      key={row.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: CONFIGURED_MODEL_GRID_TEMPLATE_COLUMNS,
                        gap: CONFIGURED_MODEL_GRID_GAP,
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
                        size="small"
                        aria-label={`启用模型 ${index + 1}`}
                        checked={row.enabled}
                        style={{ justifySelf: 'center' }}
                        onChange={(checked) => {
                          updateConfiguredModelRow(row.key, {
                            enabled: checked
                          });
                        }}
                      />
                      <Button
                        danger
                        size="small"
                        type="text"
                        aria-label={`删除模型 ${index + 1}`}
                        style={{ justifySelf: 'center', minWidth: 0, paddingInline: 0 }}
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
