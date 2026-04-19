import { Button, Empty, Space, Table, Tag, Typography } from 'antd';

import type { SettingsPluginFamilyEntry } from '../../api/plugins';
import type { SettingsModelProviderCatalogEntry } from '../../api/model-providers';

function getCatalogSummary(
  _family: SettingsPluginFamilyEntry,
  currentCatalogEntry: SettingsModelProviderCatalogEntry | null | undefined
) {
  if (currentCatalogEntry?.predefined_models.length) {
    return `内置 ${currentCatalogEntry.predefined_models.length} 个预置模型`;
  }

  if (currentCatalogEntry?.supports_model_fetch_without_credentials) {
    return '可在未配置密钥前拉取模型目录';
  }

  return '配置凭据后可校验连接并同步模型目录';
}

export function ModelProviderCatalogPanel({
  entries,
  currentCatalogEntries,
  instanceCounts,
  loading,
  canManage,
  onCreate,
  onViewInstances,
  onManageVersion
}: {
  entries: SettingsPluginFamilyEntry[];
  currentCatalogEntries: Record<
    string,
    SettingsModelProviderCatalogEntry | null
  >;
  instanceCounts: Record<string, number>;
  loading?: boolean;
  canManage: boolean;
  onCreate: (entry: SettingsPluginFamilyEntry) => void;
  onViewInstances: (entry: SettingsPluginFamilyEntry) => void;
  onManageVersion: (entry: SettingsPluginFamilyEntry) => void;
}) {
  return (
    <section className="model-provider-panel__catalog">
      <div className="model-provider-panel__section-head">
        <div>
          <Typography.Title level={5}>已安装供应商</Typography.Title>
          <Typography.Text type="secondary">
            当前 workspace 已启用的供应商族。先确认版本，再创建或维护对应实例。
          </Typography.Text>
        </div>
      </div>

      <Table<SettingsPluginFamilyEntry>
        rowKey="provider_code"
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
            width: 220,
            render: (_, entry) => {
              const currentCatalogEntry =
                currentCatalogEntries[entry.provider_code];

              return (
                <Space wrap size={6}>
                  <Tag
                    color={currentCatalogEntry?.enabled ? 'green' : 'default'}
                  >
                    {currentCatalogEntry?.enabled ? '已启用' : '待同步'}
                  </Tag>
                  <Tag>{entry.model_discovery_mode}</Tag>
                  {entry.has_update ? <Tag color="gold">有可用更新</Tag> : null}
                </Space>
              );
            }
          },
          {
            title: '说明',
            key: 'summary',
            render: (_, entry) => {
              const currentCatalogEntry =
                currentCatalogEntries[entry.provider_code];

              return (
                <div className="model-provider-panel__instance-cell">
                  <Typography.Text>
                    {getCatalogSummary(entry, currentCatalogEntry)}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    默认地址 {entry.default_base_url ?? '未提供'} ·{' '}
                    {instanceCounts[entry.provider_code] ?? 0} 个实例
                  </Typography.Text>
                </div>
              );
            }
          },
          {
            title: '版本',
            key: 'version',
            width: 220,
            render: (_, entry) => (
              <div className="model-provider-panel__instance-cell">
                <Typography.Text strong>
                  {entry.current_version}
                </Typography.Text>
                <Typography.Text type="secondary">
                  {entry.has_update && entry.latest_version
                    ? `当前使用 ${entry.current_version}，最新版本 ${entry.latest_version}`
                    : `当前已是最新版本 ${entry.latest_version ?? entry.current_version}`}
                </Typography.Text>
              </div>
            )
          },
          ...(canManage
            ? [
                {
                  title: '操作',
                  key: 'actions',
                  width: 260,
                  render: (_: unknown, entry: SettingsPluginFamilyEntry) => (
                    <Space size={4} wrap>
                      <Button
                        type="link"
                        onClick={() => onManageVersion(entry)}
                      >
                        版本管理
                      </Button>
                      <Button
                        type="link"
                        onClick={() => onViewInstances(entry)}
                      >
                        查看实例
                      </Button>
                      <Button type="link" onClick={() => onCreate(entry)}>
                        添加
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
