import { useMemo, useState } from 'react';

import {
  Alert,
  Descriptions,
  Empty,
  Modal,
  Select,
  Tag,
  Typography
} from 'antd';

import type {
  SettingsModelProviderCatalogEntry,
  SettingsModelProviderInstance,
  SettingsModelProviderModelCatalog
} from '../../api/model-providers';
import { CollapseShell } from '../../../../shared/ui/collapse-shell/CollapseShell';

function renderStatusTag(status: string) {
  switch (status) {
    case 'ready':
      return (
        <Tag 
          className="model-provider-panel__instance-status-tag"
          color="green"
          bordered={false}
        >
          ready
        </Tag>
      );
    case 'invalid':
      return (
        <Tag 
          className="model-provider-panel__instance-status-tag"
          color="red"
          bordered={false}
        >
          invalid
        </Tag>
      );
    case 'disabled':
      return (
        <Tag 
          className="model-provider-panel__instance-status-tag"
          bordered={false}
        >
          disabled
        </Tag>
      );
    default:
      return (
        <Tag 
          className="model-provider-panel__instance-status-tag"
          color="gold"
          bordered={false}
        >
          {status}
        </Tag>
      );
  }
}

function formatModelPreview(modelIds: string[], maxItems = 3) {
  if (modelIds.length === 0) {
    return '未设置';
  }

  const preview = modelIds.slice(0, maxItems).join(' · ');
  return modelIds.length > maxItems ? `${preview} · …` : preview;
}

function formatCatalogRefreshedAt(value: string | null) {
  if (!value) {
    return '未刷新';
  }

  const matched = value.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})/
  );
  if (!matched) {
    return value;
  }

  return `${matched[1]} ${matched[2]}`;
}

function renderModelTags(modelIds: string[], maxItems = 6) {
  if (modelIds.length === 0) {
    return <Typography.Text type="secondary">暂无候选模型</Typography.Text>;
  }

  const visibleItems = modelIds.slice(0, maxItems);
  const hiddenCount = modelIds.length - visibleItems.length;

  return (
    <div className="model-provider-panel__model-tags">
      {visibleItems.map((modelId) => (
        <span key={modelId} className="model-provider-panel__model-tag">
          {modelId}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="model-provider-panel__model-tag model-provider-panel__model-tag-more">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
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
  onChangeInstance,
  onEdit,
  onFetchModels,
  onRefreshCandidates,
  onRefreshModels,
  onDelete,
  onUpdatePrimary
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
  onChangeInstance: (instanceId: string) => void;
  onEdit: (instance: SettingsModelProviderInstance) => void;
  onFetchModels: (instance: SettingsModelProviderInstance) => void;
  onRefreshCandidates: (instance: SettingsModelProviderInstance) => void;
  onRefreshModels: (instance: SettingsModelProviderInstance) => void;
  onDelete: (instance: SettingsModelProviderInstance) => void;
  onUpdatePrimary: (instanceId: string) => void;
}) {
  const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);
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
              为该供应商选择一个主实例；agent-flow 和运行时都会按这个主实例解析。
            </Typography.Paragraph>
          </div>
          {canManage ? (
            <div className="model-provider-panel__instances-modal-select">
              <Typography.Text type="secondary">主实例</Typography.Text>
              <Select
                aria-label="主实例"
                placeholder="选择 ready 实例"
                value={instances.find((instance) => instance.is_primary)?.id}
                options={instances
                  .filter((instance) => instance.status === 'ready')
                  .map((instance) => ({
                    value: instance.id,
                    label: instance.display_name
                  }))}
                onChange={(instanceId) => {
                  const nextPrimaryInstance = instances.find(
                    (instance) => instance.id === instanceId
                  );

                  if (nextPrimaryInstance) {
                    setExpandedInstanceId(nextPrimaryInstance.id);
                    onChangeInstance(nextPrimaryInstance.id);
                    onFetchModels(nextPrimaryInstance);
                  }

                  onUpdatePrimary(instanceId);
                }}
              />
            </div>
          ) : null}
        </div>

        {instances.length === 0 ? (
          <Empty
            className="model-provider-panel__empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前供应商还没有可用实例"
          />
        ) : (
          <CollapseShell
            activeKey={expandedInstanceId ? [expandedInstanceId] : []}
            onChange={(nextKeys) => {
              const resolvedKeys = Array.isArray(nextKeys) ? nextKeys : [nextKeys];
              const nextExpandedId = resolvedKeys[resolvedKeys.length - 1];
              setExpandedInstanceId(
                typeof nextExpandedId === 'string' ? nextExpandedId : null
              );
              if (!nextExpandedId) {
                return;
              }

              const expandedInstance = instances.find((instance) => instance.id === nextExpandedId);
              if (expandedInstance) {
                onChangeInstance(expandedInstance.id);
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
                header: (
                  <div className="model-provider-panel__instance-header">
                    <div className="model-provider-panel__instance-header-main">
                      <div className="model-provider-panel__instance-title-row">
                        <span className="model-provider-panel__instance-title">
                          {instance.display_name}
                        </span>
                        {instance.is_primary ? (
                          <Tag
                            className="model-provider-panel__instance-primary-tag"
                            color="blue"
                            bordered={false}
                          >
                            主实例
                          </Tag>
                        ) : null}
                        {renderStatusTag(instance.status)}
                      </div>
                      <Typography.Paragraph
                        className="model-provider-panel__instance-subtitle"
                        ellipsis={{ rows: 1 }}
                      >
                        {instance.provider_code} · {instance.protocol}
                      </Typography.Paragraph>
                    </div>
                    <div className="model-provider-panel__instance-stats">
                      <div className="model-provider-panel__instance-stat">
                        <span className="model-provider-panel__instance-stat-label">
                          生效模型
                        </span>
                        <span className="model-provider-panel__instance-stat-value">
                          {instance.enabled_model_ids.length}
                        </span>
                      </div>
                      <div className="model-provider-panel__instance-stat">
                        <span className="model-provider-panel__instance-stat-label">
                          缓存模型
                        </span>
                        <span className="model-provider-panel__instance-stat-value">
                          {instance.model_count}
                        </span>
                      </div>
                    </div>
                  </div>
                ),
                children: (
                  <div className="model-provider-panel__instance-content">
                    <Descriptions
                      className="model-provider-panel__instance-descriptions"
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
                            <div className="model-provider-panel__instance-loading">
                              <span>正在加载候选模型</span>
                              <span className="model-provider-panel__instance-loading-dots">
                                <span className="model-provider-panel__instance-loading-dot" />
                                <span className="model-provider-panel__instance-loading-dot" />
                                <span className="model-provider-panel__instance-loading-dot" />
                              </span>
                            </div>
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
                              {formatCatalogRefreshedAt(instance.catalog_refreshed_at)}
                            </Typography.Text>
                          )
                        },
                        {
                          key: 'base-url',
                          label: 'Base URL',
                          children: (
                            <Typography.Paragraph
                              className="model-provider-panel__instance-baseurl-value"
                              ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                              style={{ marginBottom: 0 }}
                            >
                              {String(instance.config_json.base_url ?? '未配置')}
                            </Typography.Paragraph>
                          )
                        }
                      ]}
                    />

                    {canManage ? (
                      <div className="model-provider-panel__instance-actions">
                        <button
                          className="model-provider-panel__instance-action-btn"
                          onClick={() => onEdit(instance)}
                          aria-label={`编辑 API Key ${instance.display_name}`}
                        >
                          编辑 API Key
                        </button>
                        <button
                          className="model-provider-panel__instance-action-btn"
                          onClick={() => onRefreshCandidates(instance)}
                          aria-label={`刷新候选模型 ${instance.display_name}`}
                          disabled={refreshingCandidates}
                        >
                          {refreshingCandidates ? '刷新中...' : '刷新候选模型'}
                        </button>
                        <button
                          className="model-provider-panel__instance-action-btn"
                          onClick={() => onRefreshModels(instance)}
                          aria-label={`刷新模型 ${instance.display_name}`}
                          disabled={refreshing}
                        >
                          {refreshing ? '刷新中...' : '刷新模型'}
                        </button>
                        <button
                          className="model-provider-panel__instance-action-btn model-provider-panel__instance-action-btn--danger"
                          onClick={() => onDelete(instance)}
                          aria-label={`删除实例 ${instance.display_name}`}
                          disabled={deleting}
                        >
                          {deleting ? '删除中...' : '删除实例'}
                        </button>
                      </div>
                    ) : null}

                  </div>
                )
              };
            })}
          />
        )}
      </div>
    </Modal>
  );
}
