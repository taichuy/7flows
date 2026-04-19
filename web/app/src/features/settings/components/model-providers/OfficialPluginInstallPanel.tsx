import { useMemo, useState } from 'react';

import { Button, Empty, Modal, Select, Space, Tag, Typography } from 'antd';

import type {
  SettingsOfficialPluginCatalogEntry,
  SettingsPluginFamilyEntry
} from '../../api/plugins';

type InstallState = 'idle' | 'installing' | 'success' | 'failed';

function getInstallButtonLabel(
  entry: SettingsOfficialPluginCatalogEntry,
  installState: InstallState,
  activePluginId: string | null
) {
  if (activePluginId === entry.plugin_id && installState === 'installing') {
    return '安装中';
  }

  if (
    entry.install_status === 'assigned' ||
    (activePluginId === entry.plugin_id && installState === 'success')
  ) {
    return '已安装到当前 workspace';
  }

  if (activePluginId === entry.plugin_id && installState === 'failed') {
    return '重试安装';
  }

  return '安装到当前 workspace';
}

function getInstallStatusTag(
  entry: SettingsOfficialPluginCatalogEntry,
  installState: InstallState,
  activePluginId: string | null
) {
  if (activePluginId === entry.plugin_id && installState === 'installing') {
    return <Tag color="processing">安装中</Tag>;
  }

  if (
    entry.install_status === 'assigned' ||
    (activePluginId === entry.plugin_id && installState === 'success')
  ) {
    return <Tag color="green">当前 workspace 已可用</Tag>;
  }

  if (entry.install_status === 'installed') {
    return <Tag color="gold">已安装，待分配</Tag>;
  }

  if (activePluginId === entry.plugin_id && installState === 'failed') {
    return <Tag color="red">安装失败</Tag>;
  }

  return <Tag>未安装</Tag>;
}

function getFamilyStatusTags(family: SettingsPluginFamilyEntry) {
  return (
    <Space wrap size={6}>
      <Tag color="green">当前 {family.current_version}</Tag>
      {family.has_update && family.latest_version ? (
        <Tag color="gold">官方最新 {family.latest_version}</Tag>
      ) : (
        <Tag color="green">当前已是官方最新</Tag>
      )}
    </Space>
  );
}

function compareOfficialVersion(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function pickPreferredOfficialEntry(
  current: SettingsOfficialPluginCatalogEntry,
  candidate: SettingsOfficialPluginCatalogEntry,
  family: SettingsPluginFamilyEntry | undefined
) {
  if (family?.latest_version) {
    const currentMatchesFamilyLatest =
      current.latest_version === family.latest_version;
    const candidateMatchesFamilyLatest =
      candidate.latest_version === family.latest_version;

    if (currentMatchesFamilyLatest !== candidateMatchesFamilyLatest) {
      return candidateMatchesFamilyLatest ? candidate : current;
    }
  }

  const versionComparison = compareOfficialVersion(
    candidate.latest_version,
    current.latest_version
  );
  if (versionComparison !== 0) {
    return versionComparison > 0 ? candidate : current;
  }

  const statusScore = {
    assigned: 2,
    installed: 1,
    not_installed: 0
  } as const;
  const currentStatusScore = statusScore[current.install_status];
  const candidateStatusScore = statusScore[candidate.install_status];

  if (currentStatusScore !== candidateStatusScore) {
    return candidateStatusScore > currentStatusScore ? candidate : current;
  }

  return compareOfficialVersion(candidate.plugin_id, current.plugin_id) > 0
    ? candidate
    : current;
}

export function OfficialPluginInstallPanel({
  entries,
  familiesByProviderCode,
  loading,
  canManage,
  activePluginId,
  installState,
  upgradingProviderCode,
  onInstall,
  onUpgradeLatest
}: {
  entries: SettingsOfficialPluginCatalogEntry[];
  familiesByProviderCode: Record<string, SettingsPluginFamilyEntry | undefined>;
  loading?: boolean;
  canManage: boolean;
  activePluginId: string | null;
  installState: InstallState;
  upgradingProviderCode: string | null;
  onInstall: (entry: SettingsOfficialPluginCatalogEntry) => void;
  onUpgradeLatest: (entry: SettingsOfficialPluginCatalogEntry) => void;
}) {
  const [modal, contextHolder] = Modal.useModal();
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const normalizedEntries = useMemo(() => {
    const grouped = new Map<string, SettingsOfficialPluginCatalogEntry>();

    for (const entry of entries) {
      const existing = grouped.get(entry.provider_code);
      if (!existing) {
        grouped.set(entry.provider_code, entry);
        continue;
      }

      grouped.set(
        entry.provider_code,
        pickPreferredOfficialEntry(
          existing,
          entry,
          familiesByProviderCode[entry.provider_code]
        )
      );
    }

    return Array.from(grouped.values());
  }, [entries, familiesByProviderCode]);
  const visibleEntries = useMemo(() => {
    if (!selectedPluginId) {
      return normalizedEntries;
    }

    return normalizedEntries.filter((entry) => entry.plugin_id === selectedPluginId);
  }, [normalizedEntries, selectedPluginId]);

  return (
    <section className="model-provider-panel__official">
      {contextHolder}
      <div className="model-provider-panel__section-head">
        <div>
          <Typography.Title level={5}>安装模型供应商</Typography.Title>
          <Typography.Text type="secondary">
            从官方目录安装最新版本；如果当前 workspace
            已在使用某个供应商，这里会直接显示升级状态。
          </Typography.Text>
        </div>
      </div>
      <Select
        allowClear
        showSearch
        className="model-provider-panel__official-select"
        placeholder="下拉搜索可安装供应商"
        optionFilterProp="label"
        value={selectedPluginId}
        onChange={(value) => setSelectedPluginId(value ?? null)}
        options={normalizedEntries.map((entry) => ({
          value: entry.plugin_id,
          label: `${entry.display_name} / ${entry.protocol}`
        }))}
      />

      {normalizedEntries.length === 0 ? (
        <div className="model-provider-panel__empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              loading ? '正在加载官方供应商目录...' : '暂无可安装的官方供应商'
            }
          />
        </div>
      ) : (
        <div className="model-provider-panel__official-grid">
          {visibleEntries.map((entry) => {
            const family = familiesByProviderCode[entry.provider_code];
            const installing =
              activePluginId === entry.plugin_id &&
              installState === 'installing';
            const installed =
              entry.install_status === 'assigned' ||
              (activePluginId === entry.plugin_id &&
                installState === 'success');
            const upgrading = upgradingProviderCode === entry.provider_code;
            const buttonLabel = family
              ? family.has_update
                ? upgrading
                  ? '升级中'
                  : '升级到最新版本'
                : '当前已是最新版本'
              : getInstallButtonLabel(entry, installState, activePluginId);
            const buttonDisabled = family ? !family.has_update : installed;

            return (
              <article
                key={entry.plugin_id}
                className="model-provider-panel__official-card"
              >
                <div className="model-provider-panel__catalog-item-head">
                  <div className="model-provider-panel__catalog-item-main">
                    <div className="model-provider-panel__catalog-item-title-row">
                      <Typography.Title level={5}>
                        {entry.display_name}
                      </Typography.Title>
                    </div>
                    <Typography.Text type="secondary">
                      {entry.protocol} · 官方最新 {entry.latest_version}
                    </Typography.Text>
                  </div>
                  <Space wrap size={6}>
                    {family
                      ? getFamilyStatusTags(family)
                      : getInstallStatusTag(
                          entry,
                          installState,
                          activePluginId
                        )}
                    <Tag>{entry.model_discovery_mode}</Tag>
                  </Space>
                </div>

                <div className="model-provider-panel__catalog-item-meta">
                  <span>{entry.plugin_id}</span>
                  <span>
                    {family
                      ? `当前 ${family.current_version}`
                      : `官方最新 ${entry.latest_version}`}
                  </span>
                </div>

                {entry.help_url ? (
                  <Typography.Link href={entry.help_url} target="_blank">
                    查看插件说明
                  </Typography.Link>
                ) : null}

                {canManage ? (
                  <div className="model-provider-panel__catalog-item-actions">
                    <Button
                      type={buttonDisabled ? 'default' : 'primary'}
                      loading={installing || upgrading}
                      disabled={buttonDisabled}
                      onClick={() => {
                        void modal.confirm({
                          title: family ? '升级插件' : '安装插件',
                          icon: null,
                          centered: true,
                          okText: buttonLabel,
                          cancelText: '取消',
                          okButtonProps: {
                            loading: installing || upgrading,
                            disabled: buttonDisabled
                          },
                          content: (
                            <div className="model-provider-panel__install-confirm">
                              <div className="model-provider-panel__install-confirm-card">
                                <Typography.Title level={5}>
                                  {entry.display_name}
                                </Typography.Title>
                                <Typography.Paragraph type="secondary">
                                  {family
                                    ? `即将把当前 workspace 的 ${entry.display_name} 升级到官方最新版本 ${entry.latest_version}。完成后会统一迁移该供应商下的全部实例。`
                                    : `即将安装官方最新版本 ${entry.latest_version}，完成后会自动启用到当前 workspace。`}
                                </Typography.Paragraph>
                                <div className="model-provider-panel__catalog-item-meta">
                                  <span>协议 {entry.protocol}</span>
                                  <span>
                                    发现模式 {entry.model_discovery_mode}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ),
                          onOk: async () => {
                            if (family) {
                              onUpgradeLatest(entry);
                              return;
                            }

                            onInstall(entry);
                          }
                        });
                      }}
                    >
                      {buttonLabel}
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
