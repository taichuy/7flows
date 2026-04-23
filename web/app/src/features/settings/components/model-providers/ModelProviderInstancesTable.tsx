import { Button, Empty, Space, Switch, Table, Tag, Typography } from 'antd';

import type { SettingsModelProviderInstance } from '../../api/model-providers';

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

export function ModelProviderInstancesTable({
  instances,
  loading,
  canManage,
  updatingInstanceId,
  onToggleIncludedInMain,
  onEdit,
  onRefreshCandidates,
  onRefreshModels,
  onDelete
}: {
  instances: SettingsModelProviderInstance[];
  loading?: boolean;
  canManage: boolean;
  updatingInstanceId?: string | null;
  onToggleIncludedInMain: (
    instance: SettingsModelProviderInstance,
    checked: boolean
  ) => void;
  onEdit: (instance: SettingsModelProviderInstance) => void;
  onRefreshCandidates: (instance: SettingsModelProviderInstance) => void;
  onRefreshModels: (instance: SettingsModelProviderInstance) => void;
  onDelete: (instance: SettingsModelProviderInstance) => void;
}) {
  function renderModelPreview(modelIds: string[]) {
    if (modelIds.length === 0) {
      return '未设置';
    }

    const preview = modelIds.slice(0, 2).join(' · ');
    return modelIds.length > 2 ? `${preview} · …` : preview;
  }

  return (
    <section className="model-provider-panel__instances">
      <Table<SettingsModelProviderInstance>
        rowKey="id"
        loading={loading}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={loading ? '正在加载实例...' : '暂无模型供应商实例'}
            />
          )
        }}
        pagination={false}
        dataSource={instances}
        columns={[
          {
            title: '实例',
            key: 'instance',
            render: (_, instance) => (
              <div className="model-provider-panel__instance-cell">
                <Typography.Text
                  strong
                  className="model-provider-panel__instance-title"
                >
                  {instance.display_name}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {instance.provider_code} · {instance.protocol}
                </Typography.Text>
              </div>
            )
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 110,
            render: (status: string) => renderStatusTag(status)
          },
          {
            title: '加入主实例',
            key: 'included_in_main',
            width: 180,
            render: (_, instance) => (
              <div className="model-provider-panel__instance-inclusion">
                <Switch
                  aria-label={`加入主实例 ${instance.display_name}`}
                  checked={instance.included_in_main}
                  disabled={
                    !canManage || updatingInstanceId === instance.id
                  }
                  onChange={(checked) => {
                    onToggleIncludedInMain(instance, checked);
                  }}
                />
                <Typography.Text type="secondary">
                  {instance.included_in_main ? '已接入' : '未接入'}
                </Typography.Text>
              </div>
            )
          },
          {
            title: 'Base URL',
            key: 'base_url',
            render: (_, instance) => (
              <Typography.Text className="model-provider-panel__mono">
                {String(instance.config_json.base_url ?? '未配置')}
              </Typography.Text>
            )
          },
          {
            title: '生效模型',
            key: 'enabled_model_ids',
            render: (_, instance) => (
              <div className="model-provider-panel__instance-cell">
                <Typography.Text>{instance.enabled_model_ids.length} 个</Typography.Text>
                <Typography.Text type="secondary">
                  {renderModelPreview(instance.enabled_model_ids)}
                </Typography.Text>
              </div>
            )
          },
          ...(canManage
            ? [
                {
                  title: '操作',
                  key: 'actions',
                  width: 280,
                  render: (
                    _: unknown,
                    instance: SettingsModelProviderInstance
                  ) => (
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
                        aria-label={`刷新候选模型 ${instance.display_name}`}
                        onClick={() => onRefreshCandidates(instance)}
                      >
                        刷新候选模型
                      </Button>
                      <Button
                        type="link"
                        aria-label={`刷新模型 ${instance.display_name}`}
                        onClick={() => onRefreshModels(instance)}
                      >
                        刷新模型
                      </Button>
                      <Button
                        danger
                        type="link"
                        aria-label={`删除实例 ${instance.display_name}`}
                        onClick={() => onDelete(instance)}
                      >
                        删除实例
                      </Button>
                    </Space>
                  )
                }
              ]
            : [])
        ]}
      />
    </section>
  );
}
