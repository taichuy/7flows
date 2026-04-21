import { Button, Empty, Space, Table, Tag, Typography } from 'antd';

import type { SettingsPluginFamilyEntry } from '../../api/plugins';
import type { SettingsModelProviderCatalogEntry } from '../../api/model-providers';
import { formatPluginAvailabilityStatus } from './plugin-installation-status';

function getCatalogDescription(
  family: SettingsPluginFamilyEntry,
  currentCatalogEntry: SettingsModelProviderCatalogEntry | null | undefined
) {
  return (
    family.description?.trim() ||
    currentCatalogEntry?.description?.trim() ||
    '未提供说明'
  );
}

export function ModelProviderCatalogPanel({
  entries,
  currentCatalogEntries,
  instanceCounts,
  loading,
  canManage,
  deletingProviderCode,
  onCreate,
  onViewInstances,
  onManageVersion,
  onDelete
}: {
  entries: SettingsPluginFamilyEntry[];
  currentCatalogEntries: Record<
    string,
    SettingsModelProviderCatalogEntry | null
  >;
  instanceCounts: Record<string, number>;
  loading?: boolean;
  canManage: boolean;
  deletingProviderCode?: string | null;
  onCreate: (entry: SettingsPluginFamilyEntry) => void;
  onViewInstances: (entry: SettingsPluginFamilyEntry) => void;
  onManageVersion: (entry: SettingsPluginFamilyEntry) => void;
  onDelete: (entry: SettingsPluginFamilyEntry) => void;
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
        className="model-provider-panel__catalog-table"
        rowKey="provider_code"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={entries}
        scroll={{ x: 780 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={loading ? '正在加载供应商目录...' : '暂无可用供应商'}
            />
          )
        }}
        columns={[
          ...(canManage
            ? [
                {
                  title: '操作',
                  key: 'actions',
                  width: 180,
                  render: (_: unknown, entry: SettingsPluginFamilyEntry) => (
                    <Space
                      size={[4, 4]}
                      wrap
                      className="model-provider-panel__catalog-actions"
                    >
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
                      <Button
                        danger
                        type="link"
                        loading={deletingProviderCode === entry.provider_code}
                        onClick={() => onDelete(entry)}
                      >
                        删除
                      </Button>
                    </Space>
                  )
                }
              ]
            : []),
          {
            title: '名称',
            key: 'provider',
            width: 180,
            render: (_, entry) => (
              <div className="model-provider-panel__catalog-name">
                <Typography.Text strong>{entry.display_name}</Typography.Text>
              </div>
            )
          },
          {
            title: '状态',
            key: 'status',
            width: 130,
            render: (_, entry) => {
              const currentCatalogEntry =
                currentCatalogEntries[entry.provider_code];
              const status = formatPluginAvailabilityStatus(
                currentCatalogEntry?.availability_status ?? 'disabled'
              );

              return (
                <Space
                  wrap
                  size={[6, 6]}
                  className="model-provider-panel__catalog-status"
                >
                  <Tag color={status.color}>{status.label}</Tag>
                  <Tag>{entry.model_discovery_mode}</Tag>
                  {entry.has_update ? <Tag color="gold">有可用更新</Tag> : null}
                </Space>
              );
            }
          },
          {
            title: '版本',
            key: 'version',
            width: 90,
            render: (_, entry) => (
              <div className="model-provider-panel__catalog-version">
                <Typography.Text strong>
                  {entry.current_version}
                </Typography.Text>
              </div>
            )
          },
          {
            title: '说明',
            key: 'summary',
            width: 200,
            render: (_, entry) => {
              const currentCatalogEntry =
                currentCatalogEntries[entry.provider_code];
              const description = getCatalogDescription(
                entry,
                currentCatalogEntry
              );

              return (
                <div className="model-provider-panel__catalog-description">
                  <Typography.Paragraph
                    className="model-provider-panel__catalog-description-text"
                    ellipsis={{ rows: 2, tooltip: description }}
                  >
                    {description}
                  </Typography.Paragraph>
                </div>
              );
            }
          }
        ]}
      />
    </section>
  );
}
