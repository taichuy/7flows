import { useEffect, useMemo, useState } from 'react';

import { Button, Descriptions, Empty, Modal, Select, Space, Tag, Typography } from 'antd';

import type {
  SettingsModelProviderCatalogEntry,
  SettingsModelProviderInstance,
  SettingsModelProviderModelCatalog
} from '../../api/model-providers';

function renderStatusTag(status: string) {
  switch (status) {
    case 'ready':
      return <Tag color="green">ready</Tag>;
    case 'invalid':
      return <Tag color="red">invalid</Tag>;
    case 'disabled':
      return <Tag>disabled</Tag>;
    default:
      return <Tag color="gold">{status}</Tag>;
  }
}

export function ModelProviderInstancesModal({
  open,
  catalogEntry,
  instances,
  selectedInstanceId,
  modelCatalog,
  modelsLoading,
  validating,
  refreshing,
  deleting,
  canManage,
  onClose,
  onChangeInstance,
  onEdit,
  onFetchModels,
  onValidate,
  onRefreshModels,
  onDelete
}: {
  open: boolean;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  instances: SettingsModelProviderInstance[];
  selectedInstanceId: string | null;
  modelCatalog: SettingsModelProviderModelCatalog | null;
  modelsLoading: boolean;
  validating: boolean;
  refreshing: boolean;
  deleting: boolean;
  canManage: boolean;
  onClose: () => void;
  onChangeInstance: (instanceId: string) => void;
  onEdit: (instance: SettingsModelProviderInstance) => void;
  onFetchModels: (instance: SettingsModelProviderInstance) => void;
  onValidate: (instance: SettingsModelProviderInstance) => void;
  onRefreshModels: (instance: SettingsModelProviderInstance) => void;
  onDelete: (instance: SettingsModelProviderInstance) => void;
}) {
  const selectedInstance =
    instances.find((instance) => instance.id === selectedInstanceId) ?? instances[0] ?? null;
  const models = useMemo(
    () =>
      selectedInstance && modelCatalog?.provider_instance_id === selectedInstance.id
        ? modelCatalog.models
        : [],
    [modelCatalog, selectedInstance]
  );
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedInstance) {
      setSelectedModelId(undefined);
      return;
    }

    if (!models.length) {
      setSelectedModelId(undefined);
      return;
    }

    if (selectedModelId && models.some((model) => model.model_id === selectedModelId)) {
      return;
    }

    setSelectedModelId(models[0]?.model_id);
  }, [models, selectedInstance, selectedModelId]);

  return (
    <Modal
      open={open}
      width={720}
      title={catalogEntry ? `${catalogEntry.display_name} 实例` : '供应商实例'}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <div className="model-provider-panel__instances-modal">
        <div className="model-provider-panel__instances-modal-head">
          <div>
            <Typography.Text strong>查看供应商实例</Typography.Text>
            <Typography.Paragraph type="secondary">
              默认优先展示当前可用的 ready 实例，也可以切换到同供应商下的其他实例。
            </Typography.Paragraph>
          </div>
          <div className="model-provider-panel__instances-modal-select">
            <Typography.Text type="secondary">选择实例</Typography.Text>
            <Select
              aria-label="选择实例"
              value={selectedInstance?.id}
              options={instances.map((instance) => ({
                label: instance.display_name,
                value: instance.id
              }))}
              onChange={onChangeInstance}
            />
          </div>
        </div>

        {selectedInstance ? (
          <>
            <Descriptions
              size="small"
              column={2}
              items={[
                {
                  key: 'status',
                  label: '状态',
                  children: renderStatusTag(selectedInstance.status)
                },
                {
                  key: 'validation',
                  label: '最近校验',
                  children: selectedInstance.last_validation_status ?? '未校验'
                },
                {
                  key: 'base_url',
                  label: 'Base URL',
                  children: (
                    <Typography.Text className="model-provider-panel__mono">
                      {String(selectedInstance.config_json.base_url ?? '未配置')}
                    </Typography.Text>
                  )
                },
                {
                  key: 'models',
                  label: '模型目录',
                  children: `${selectedInstance.model_count} 个 · ${selectedInstance.catalog_refresh_status ?? 'idle'}`
                },
                {
                  key: 'message',
                  label: '校验说明',
                  span: 2,
                  children: selectedInstance.last_validation_message ?? '尚无校验结果'
                }
              ]}
            />

            <div className="model-provider-panel__instances-modal-actions">
              <Space wrap>
                <Button
                  loading={modelsLoading}
                  onClick={() => onFetchModels(selectedInstance)}
                >
                  获取模型
                </Button>
                {canManage ? (
                  <Button onClick={() => onEdit(selectedInstance)}>编辑 API Key</Button>
                ) : null}
                {canManage ? (
                  <Button
                    loading={validating}
                    onClick={() => onValidate(selectedInstance)}
                  >
                    验证实例
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    loading={refreshing}
                    onClick={() => onRefreshModels(selectedInstance)}
                  >
                    刷新模型
                  </Button>
                ) : null}
                {canManage ? (
                  <Button
                    danger
                    loading={deleting}
                    onClick={() => onDelete(selectedInstance)}
                  >
                    删除实例
                  </Button>
                ) : null}
              </Space>
            </div>

            <div className="model-provider-panel__instances-modal-select">
              <Typography.Text type="secondary">可用模型</Typography.Text>
              <Select
                aria-label="可用模型"
                placeholder="点击“获取模型”查看当前实例下的模型"
                value={selectedModelId}
                options={models.map((model) => ({
                  label: model.display_name,
                  value: model.model_id
                }))}
                onChange={setSelectedModelId}
                notFoundContent={modelsLoading ? '正在加载模型...' : '暂无模型，请先获取或刷新'}
              />
              {modelCatalog && modelCatalog.provider_instance_id === selectedInstance.id ? (
                <Typography.Paragraph type="secondary">
                  来源：{modelCatalog.source} · 状态：{modelCatalog.refresh_status}
                </Typography.Paragraph>
              ) : null}
            </div>
          </>
        ) : (
          <Empty
            className="model-provider-panel__empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前供应商还没有可用实例"
          />
        )}
      </div>
    </Modal>
  );
}
