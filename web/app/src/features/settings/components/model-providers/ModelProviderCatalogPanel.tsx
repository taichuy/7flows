import { Button, Empty, Space, Table, Tag, Typography } from 'antd';

import type { SettingsModelProviderCatalogEntry } from '../../api/model-providers';

function getCatalogSummary(entry: SettingsModelProviderCatalogEntry) {
  if (entry.predefined_models.length > 0) {
    return `内置 ${entry.predefined_models.length} 个预置模型`;
  }

  if (entry.supports_model_fetch_without_credentials) {
    return '可在未配置密钥前拉取模型目录';
  }

  return '配置凭据后可校验连接并同步模型目录';
}

export function ModelProviderCatalogPanel({
  entries,
  instanceCounts,
  loading,
  canManage,
  onCreate,
  onViewInstances
}: {
  entries: SettingsModelProviderCatalogEntry[];
  instanceCounts: Record<string, number>;
  loading?: boolean;
  canManage: boolean;
  onCreate: (entry: SettingsModelProviderCatalogEntry) => void;
  onViewInstances: (entry: SettingsModelProviderCatalogEntry) => void;
}) {
  return (
    <section className="model-provider-panel__catalog">
      <div className="model-provider-panel__section-head">
        <div>
          <Typography.Title level={5}>已安装供应商</Typography.Title>
          <Typography.Text type="secondary">
            当前 workspace 已启用的供应商安装包。先选择供应商，再创建可用实例。
          </Typography.Text>
        </div>
      </div>

      <Table<SettingsModelProviderCatalogEntry>
        rowKey="installation_id"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={entries}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={loading ? '正在加载供应商目录...' : '暂无可用供应商'}
            />
          )
        }}
        columns={[
          {
            title: '供应商',
            key: 'provider',
            render: (_, entry) => (
              <div className="model-provider-panel__instance-cell">
                <Typography.Text strong>{entry.display_name}</Typography.Text>
                <Typography.Text type="secondary">
                  {entry.provider_code} · {entry.protocol}
                </Typography.Text>
              </div>
            )
          },
          {
            title: '状态',
            key: 'status',
            width: 160,
            render: (_, entry) => (
              <Space wrap size={6}>
                <Tag color={entry.enabled ? 'green' : 'default'}>
                  {entry.enabled ? '已启用' : '未启用'}
                </Tag>
                <Tag>{entry.model_discovery_mode}</Tag>
              </Space>
            )
          },
          {
            title: '说明',
            key: 'summary',
            render: (_, entry) => (
              <div className="model-provider-panel__instance-cell">
                <Typography.Text>{getCatalogSummary(entry)}</Typography.Text>
                <Typography.Text type="secondary">
                  默认地址 {entry.default_base_url ?? '未提供'} ·{' '}
                  {instanceCounts[entry.installation_id] ?? 0} 个实例
                </Typography.Text>
              </div>
            )
          },
          {
            title: '版本',
            dataIndex: 'plugin_version',
            width: 120
          },
          ...(canManage
            ? [
                {
                  title: '操作',
                  key: 'actions',
                  width: 220,
                  render: (_: unknown, entry: SettingsModelProviderCatalogEntry) => (
                    <Space size={4} wrap>
                      <Button type="link" onClick={() => onViewInstances(entry)}>
                        查看实例
                      </Button>
                      <Button type="link" onClick={() => onCreate(entry)}>
                        添加 API Key
                      </Button>
                      {entry.help_url ? (
                        <Typography.Link href={entry.help_url} target="_blank">
                          文档
                        </Typography.Link>
                      ) : null}
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
