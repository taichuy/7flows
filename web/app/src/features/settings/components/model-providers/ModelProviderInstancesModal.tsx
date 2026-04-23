import {
  Alert,
  Empty,
  Modal,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';

import type {
  SettingsModelProviderCatalogEntry,
  SettingsModelProviderInstance,
  SettingsModelProviderMainInstance,
  SettingsModelProviderOptions
} from '../../api/model-providers';
import { ModelProviderInstancesTable } from './ModelProviderInstancesTable';

type ModelGroup =
  SettingsModelProviderOptions['providers'][number]['model_groups'][number];

function formatModelPreview(modelIds: string[]) {
  if (modelIds.length === 0) {
    return '未汇总模型';
  }

  return modelIds.join(' · ');
}

export function ModelProviderInstancesModal({
  open,
  catalogEntry,
  mainInstance,
  modelGroups,
  instances,
  updatingMainInstance,
  updatingInstanceId,
  refreshingCandidates,
  refreshing,
  deleting,
  canManage,
  versionSwitchNotice,
  onClose,
  onEdit,
  onRefreshCandidates,
  onRefreshModels,
  onDelete,
  onToggleAutoIncludeNewInstances,
  onToggleIncludedInMain
}: {
  open: boolean;
  catalogEntry: SettingsModelProviderCatalogEntry | null;
  mainInstance: SettingsModelProviderMainInstance | null;
  modelGroups: ModelGroup[];
  instances: SettingsModelProviderInstance[];
  updatingMainInstance: boolean;
  updatingInstanceId?: string | null;
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
  onRefreshCandidates: (instance: SettingsModelProviderInstance) => void;
  onRefreshModels: (instance: SettingsModelProviderInstance) => void;
  onDelete: (instance: SettingsModelProviderInstance) => void;
  onToggleAutoIncludeNewInstances: (checked: boolean) => void;
  onToggleIncludedInMain: (
    instance: SettingsModelProviderInstance,
    checked: boolean
  ) => void;
}) {
  const includedCount = instances.filter(
    (instance) => instance.included_in_main
  ).length;
  const aggregatedModelCount = modelGroups.reduce(
    (total, group) => total + group.models.length,
    0
  );

  return (
    <Modal
      open={open}
      width={960}
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

        <section className="model-provider-panel__main-instance-card">
          <div className="model-provider-panel__main-instance-head">
            <div>
              <Typography.Text strong>主实例</Typography.Text>
              <Typography.Paragraph type="secondary">
                聚合视图会按已接入实例合并模型，agent-flow 使用这里的汇总结果。
              </Typography.Paragraph>
            </div>
            <Space
              direction="vertical"
              size={4}
              className="model-provider-panel__main-instance-toggle"
            >
              <Typography.Text type="secondary">
                新实例自动加入主实例
              </Typography.Text>
              <Switch
                aria-label="新实例自动加入主实例"
                checked={mainInstance?.auto_include_new_instances ?? false}
                disabled={!canManage || updatingMainInstance}
                onChange={onToggleAutoIncludeNewInstances}
              />
            </Space>
          </div>

          <div className="model-provider-panel__main-instance-summary">
            <Tag bordered={false} color="blue">
              聚合视图
            </Tag>
            <Typography.Text type="secondary">
              已接入 {includedCount} 个实例
            </Typography.Text>
            <Typography.Text type="secondary">
              已汇总 {aggregatedModelCount} 个模型
            </Typography.Text>
          </div>

          {modelGroups.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前主实例还没有接入任何子实例模型"
            />
          ) : (
            <div className="model-provider-panel__main-instance-groups">
              {modelGroups.map((group) => (
                <section
                  key={group.source_instance_id}
                  className="model-provider-panel__main-instance-group"
                >
                  <Typography.Text strong>
                    {group.source_instance_display_name}
                  </Typography.Text>
                  <Typography.Paragraph type="secondary">
                    {formatModelPreview(
                      group.models.map((model) => model.model_id)
                    )}
                  </Typography.Paragraph>
                </section>
              ))}
            </div>
          )}
        </section>

        <ModelProviderInstancesTable
          instances={instances}
          canManage={canManage}
          loading={false}
          updatingInstanceId={updatingInstanceId}
          onToggleIncludedInMain={onToggleIncludedInMain}
          onEdit={onEdit}
          onRefreshCandidates={(instance) => {
            if (!refreshingCandidates) {
              onRefreshCandidates(instance);
            }
          }}
          onRefreshModels={(instance) => {
            if (!refreshing) {
              onRefreshModels(instance);
            }
          }}
          onDelete={(instance) => {
            if (!deleting) {
              onDelete(instance);
            }
          }}
        />
      </div>
    </Modal>
  );
}
