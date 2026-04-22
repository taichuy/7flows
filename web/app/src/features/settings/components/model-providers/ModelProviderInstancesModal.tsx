import { useMemo, useState } from 'react';

import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Empty,
  Flex,
  Modal,
  Space,
  Tag,
  Typography
} from 'antd';

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

function formatModelPreview(modelIds: string[], maxItems = 3) {
  if (modelIds.length === 0) {
    return '未设置';
  }

  const preview = modelIds.slice(0, maxItems).join(' · ');
  return modelIds.length > maxItems ? `${preview} · …` : preview;
}

function renderModelTags(modelIds: string[], maxItems = 6) {
  if (modelIds.length === 0) {
    return <Typography.Text type="secondary">暂无候选模型</Typography.Text>;
  }

  const visibleItems = modelIds.slice(0, maxItems);
  const hiddenCount = modelIds.length - visibleItems.length;

  return (
    <Flex wrap gap={8}>
      {visibleItems.map((modelId) => (
        <Tag key={modelId}>{modelId}</Tag>
      ))}
      {hiddenCount > 0 ? <Tag>+{hiddenCount}</Tag> : null}
    </Flex>
  );
}

export function ModelProviderInstancesModal({
  open,
  catalogEntry,
  instances,
  modelCatalog,
  modelsLoading,
  refreshingCandidates,
  refreshing,
  deleting,
  canManage,
  versionSwitchNotice,
  onClose,
  onEdit,
  onFetchModels,
  onRefreshCandidates,
  onRefreshModels,
  onDelete
}: {
  open: boolean;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  instances: SettingsModelProviderInstance[];
  modelCatalog: SettingsModelProviderModelCatalog | null;
  modelsLoading: boolean;
  refreshingCandidates: boolean;
  refreshing: boolean;
  deleting: boolean;
  canManage: boolean;
  versionSwitchNotice: {
    targetVersion: string | null;
    migratedInstanceCount: number | null;
  } | null;
  onClose: () => void;
  onEdit: (instance: SettingsModelProviderInstance) => void;
  onFetchModels: (instance: SettingsModelProviderInstance) => void;
  onRefreshCandidates: (instance: SettingsModelProviderInstance) => void;
  onRefreshModels: (instance: SettingsModelProviderInstance) => void;
  onDelete: (instance: SettingsModelProviderInstance) => void;
}) {
  const [expandedInstanceIds, setExpandedInstanceIds] = useState<string[]>([]);
  const loadedModelsByInstanceId = useMemo(() => {
    if (!modelCatalog) {
      return {};
    }

    return {
      [modelCatalog.provider_instance_id]: modelCatalog.models
    } as Record<string, SettingsModelProviderModelCatalog['models']>;
  }, [modelCatalog]);

  return (
    <Modal
      open={open}
      width={920}
      title={catalogEntry ? `${catalogEntry.display_name} 实例` : '供应商实例'}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <div className="model-provider-panel__instances-modal">
        {versionSwitchNotice ? (
          <Alert
            type="warning"
            showIcon
            message="该供应商刚完成版本切换，建议刷新模型并验证关键实例。"
            description={
              versionSwitchNotice.targetVersion
                ? `当前目标版本 ${versionSwitchNotice.targetVersion}，已迁移 ${versionSwitchNotice.migratedInstanceCount ?? 0} 个实例。`
                : undefined
            }
          />
        ) : null}

        <div className="model-provider-panel__instances-modal-head">
          <div>
            <Typography.Text strong>查看供应商实例</Typography.Text>
            <Typography.Paragraph type="secondary">
              使用纵向实例列表查看摘要；点开某个实例后再看候选缓存、操作和完整 Base URL。
            </Typography.Paragraph>
          </div>
        </div>

        {instances.length === 0 ? (
          <Empty
            className="model-provider-panel__empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前供应商还没有可用实例"
          />
        ) : (
          <Collapse
            activeKey={expandedInstanceIds}
            onChange={(nextKeys) => {
              const resolvedKeys = Array.isArray(nextKeys) ? nextKeys : [nextKeys];
              setExpandedInstanceIds(resolvedKeys);

              const nextExpandedId = resolvedKeys[resolvedKeys.length - 1];
              if (!nextExpandedId) {
                return;
              }

              const expandedInstance = instances.find((instance) => instance.id === nextExpandedId);
              if (expandedInstance) {
                onFetchModels(expandedInstance);
              }
            }}
            items={instances.map((instance) => {
              const cachedModels =
                loadedModelsByInstanceId[instance.id]?.map((model) => model.model_id) ?? [];
              const hasLoadedModels = cachedModels.length > 0;
              const isLoadingCurrentCatalog =
                modelsLoading && modelCatalog?.provider_instance_id === instance.id;

              return {
                key: instance.id,
                label: (
                  <Flex justify="space-between" align="flex-start" gap={16}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Space align="center" size={8} wrap>
                        <Typography.Text strong>{instance.display_name}</Typography.Text>
                        {renderStatusTag(instance.status)}
                      </Space>
                      <Typography.Paragraph
                        type="secondary"
                        style={{ marginBottom: 0, marginTop: 4 }}
                        ellipsis={{ rows: 1 }}
                      >
                        {instance.provider_code} · {instance.protocol}
                      </Typography.Paragraph>
                    </div>
                    <Space size={16} wrap>
                      <div>
                        <Typography.Text type="secondary">生效模型</Typography.Text>
                        <br />
                        <Typography.Text>{instance.enabled_model_ids.length} 个</Typography.Text>
                      </div>
                      <div>
                        <Typography.Text type="secondary">缓存模型</Typography.Text>
                        <br />
                        <Typography.Text>{instance.model_count} 个</Typography.Text>
                      </div>
                    </Space>
                  </Flex>
                ),
                children: (
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Descriptions
                      size="small"
                      column={1}
                      items={[
                        {
                          key: 'enabled-models',
                          label: '生效模型',
                          children: (
                            <Typography.Text>
                              {formatModelPreview(instance.enabled_model_ids)}
                            </Typography.Text>
                          )
                        },
                        {
                          key: 'cached-models',
                          label: '候选缓存',
                          children: isLoadingCurrentCatalog ? (
                            <Typography.Text type="secondary">
                              正在加载候选模型...
                            </Typography.Text>
                          ) : hasLoadedModels ? (
                            renderModelTags(cachedModels)
                          ) : (
                            <Typography.Text type="secondary">
                              当前仅显示摘要，点击展开时会自动拉取候选缓存。
                            </Typography.Text>
                          )
                        },
                        {
                          key: 'refreshed-at',
                          label: '最近刷新',
                          children: (
                            <Typography.Text type="secondary">
                              {instance.catalog_refreshed_at ?? '未刷新'}
                            </Typography.Text>
                          )
                        }
                      ]}
                    />

                    {canManage ? (
                      <Space size={4} wrap>
                        <Button
                          type="link"
                          aria-label={`编辑 API Key ${instance.display_name}`}
                          onClick={() => onEdit(instance)}
                        >
                          编辑 API Key
                        </Button>
                        <Button
                          type="link"
                          loading={refreshingCandidates}
                          aria-label={`刷新候选模型 ${instance.display_name}`}
                          onClick={() => onRefreshCandidates(instance)}
                        >
                          刷新候选模型
                        </Button>
                        <Button
                          type="link"
                          loading={refreshing}
                          aria-label={`刷新模型 ${instance.display_name}`}
                          onClick={() => onRefreshModels(instance)}
                        >
                          刷新模型
                        </Button>
                        <Button
                          danger
                          type="link"
                          loading={deleting}
                          aria-label={`删除实例 ${instance.display_name}`}
                          onClick={() => onDelete(instance)}
                        >
                          删除实例
                        </Button>
                      </Space>
                    ) : null}

                    <div>
                      <Typography.Text type="secondary">Base URL</Typography.Text>
                      <Typography.Paragraph
                        className="model-provider-panel__mono"
                        style={{ marginBottom: 0, marginTop: 4 }}
                        ellipsis={{ rows: 1, expandable: true, symbol: '展开' }}
                      >
                        {String(instance.config_json.base_url ?? '未配置')}
                      </Typography.Paragraph>
                    </div>
                  </Space>
                )
              };
            })}
          />
        )}
      </div>
    </Modal>
  );
}
