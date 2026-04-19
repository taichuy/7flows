import { Alert, Button, Empty, Modal, Space, Tag, Typography } from 'antd';

import type { SettingsPluginFamilyEntry } from '../../api/plugins';

function formatVersionMeta(family: SettingsPluginFamilyEntry) {
  if (family.latest_version && family.has_update) {
    return `当前使用 ${family.current_version}，最新版本 ${family.latest_version}`;
  }

  if (family.latest_version) {
    return `当前已是最新版本 ${family.latest_version}`;
  }

  return `当前使用 ${family.current_version}`;
}

function formatInstalledVersionSummary(sourceKind: string, createdAt: string) {
  return `${sourceKind} · ${createdAt.slice(0, 10)}`;
}

export function PluginVersionManagementModal({
  open,
  family,
  submitting,
  pendingMode,
  pendingInstallationId,
  onClose,
  onUpgradeLatest,
  onSwitchVersion
}: {
  open: boolean;
  family: SettingsPluginFamilyEntry | null;
  submitting: boolean;
  pendingMode: 'upgrade' | 'switch' | null;
  pendingInstallationId: string | null;
  onClose: () => void;
  onUpgradeLatest: (family: SettingsPluginFamilyEntry) => void;
  onSwitchVersion: (
    family: SettingsPluginFamilyEntry,
    installationId: string
  ) => void;
}) {
  const latestInstalledVersion = family?.latest_version
    ? (family.installed_versions.find(
        (version) => version.plugin_version === family.latest_version
      ) ?? null)
    : null;

  return (
    <Modal
      open={open}
      width={720}
      title={family ? `${family.display_name} 版本管理` : '版本管理'}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
    >
      <div className="model-provider-panel__version-modal">
        <div className="model-provider-panel__version-modal-head">
          <div>
            <Typography.Text strong>版本切换</Typography.Text>
            <Typography.Paragraph type="secondary">
              {family
                ? formatVersionMeta(family)
                : '选择目标版本后会统一切换该供应商下的全部实例。'}
            </Typography.Paragraph>
          </div>
          {family ? (
            <Space wrap size={6}>
              <Tag>{family.protocol}</Tag>
              <Tag>{family.model_discovery_mode}</Tag>
            </Space>
          ) : null}
        </div>

        <Alert
          type="warning"
          showIcon
          message="切换版本会统一迁移该供应商下的全部实例。"
          description="切换完成后，建议立即刷新模型目录并验证关键实例，确认模型枚举和连通性符合预期。"
        />

        {family?.latest_version ? (
          <section className="model-provider-panel__version-block">
            <div className="model-provider-panel__version-block-head">
              <div>
                <Typography.Text strong>推荐版本</Typography.Text>
                <Typography.Paragraph type="secondary">
                  如果官方目录有新版本，这里优先提供升级入口。
                </Typography.Paragraph>
              </div>
            </div>

            <article className="model-provider-panel__version-card model-provider-panel__version-card--featured">
              <div className="model-provider-panel__version-card-main">
                <div className="model-provider-panel__version-card-title">
                  <Typography.Text strong>
                    {family.latest_version}
                  </Typography.Text>
                  <Tag color="gold">推荐</Tag>
                  {latestInstalledVersion?.is_current ? (
                    <Tag color="green">当前版本</Tag>
                  ) : null}
                </div>
                <Typography.Text type="secondary">
                  {latestInstalledVersion
                    ? formatInstalledVersionSummary(
                        latestInstalledVersion.source_kind,
                        latestInstalledVersion.created_at
                      )
                    : '官方目录最新版本，当前本地尚未下载'}
                </Typography.Text>
              </div>
              <div className="model-provider-panel__version-card-actions">
                {family.has_update ? (
                  <Button
                    type="primary"
                    loading={submitting && pendingMode === 'upgrade'}
                    onClick={() => onUpgradeLatest(family)}
                  >
                    升级到最新版本
                  </Button>
                ) : (
                  <Button disabled>当前已是最新版本</Button>
                )}
              </div>
            </article>
          </section>
        ) : null}

        <section className="model-provider-panel__version-block">
          <div className="model-provider-panel__version-block-head">
            <div>
              <Typography.Text strong>本地已安装版本</Typography.Text>
              <Typography.Paragraph type="secondary">
                只展示当前环境里已经安装过的可切换版本。
              </Typography.Paragraph>
            </div>
          </div>

          {family && family.installed_versions.length > 0 ? (
            <div className="model-provider-panel__version-list">
              {family.installed_versions.map((version) => {
                const isLatest =
                  family.latest_version === version.plugin_version;
                const loading =
                  submitting &&
                  pendingMode === 'switch' &&
                  pendingInstallationId === version.installation_id;

                return (
                  <article
                    key={version.installation_id}
                    className="model-provider-panel__version-card"
                  >
                    <div className="model-provider-panel__version-card-main">
                      <div className="model-provider-panel__version-card-title">
                        <Typography.Text strong>
                          {version.plugin_version}
                        </Typography.Text>
                        {version.is_current ? (
                          <Tag color="green">当前版本</Tag>
                        ) : null}
                        {isLatest ? <Tag color="gold">最新</Tag> : null}
                      </div>
                      <Typography.Text type="secondary">
                        {formatInstalledVersionSummary(
                          version.source_kind,
                          version.created_at
                        )}
                      </Typography.Text>
                    </div>
                    <div className="model-provider-panel__version-card-actions">
                      {version.is_current ? (
                        <Button disabled>当前版本</Button>
                      ) : isLatest && family.has_update ? (
                        <Button disabled>使用上方升级</Button>
                      ) : (
                        <Button
                          loading={loading}
                          onClick={() =>
                            onSwitchVersion(family, version.installation_id)
                          }
                        >
                          回退到该版本
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前还没有可切换的本地版本"
            />
          )}
        </section>
      </div>
    </Modal>
  );
}
