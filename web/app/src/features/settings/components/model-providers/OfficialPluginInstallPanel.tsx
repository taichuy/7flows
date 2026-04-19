import { useMemo, useState } from 'react';

import { Button, Empty, Modal, Select, Typography } from 'antd';

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

const OFFICIAL_PLUGIN_RELEASES_URL =
  'https://github.com/taichuy/1flowbase-official-plugins/releases';

function getStatusLine(
  entry: SettingsOfficialPluginCatalogEntry,
  family: SettingsPluginFamilyEntry | undefined,
  installState: InstallState,
  activePluginId: string | null
) {
  if (family) {
    return `当前 ${family.current_version}，${
      family.has_update && family.latest_version
        ? `官方最新 ${family.latest_version}`
        : '当前已是官方最新'
    }，${entry.model_discovery_mode}`;
  }

  if (activePluginId === entry.plugin_id && installState === 'installing') {
    return `官方最新 ${entry.latest_version}，安装中，${entry.model_discovery_mode}`;
  }

  if (entry.install_status === 'assigned') {
    return `官方最新 ${entry.latest_version}，当前 workspace 已可用，${entry.model_discovery_mode}`;
  }

  if (entry.install_status === 'installed') {
    return `官方最新 ${entry.latest_version}，已安装待分配，${entry.model_discovery_mode}`;
  }

  if (activePluginId === entry.plugin_id && installState === 'failed') {
    return `官方最新 ${entry.latest_version}，安装失败，${entry.model_discovery_mode}`;
  }

  return `官方最新 ${entry.latest_version}，未安装，${entry.model_discovery_mode}`;
}

export function OfficialPluginInstallPanel({
  sourceMeta,
  entries,
  familiesByProviderCode,
  loading,
  canManage,
  activePluginId,
  installState,
  upgradingProviderCode,
  onInstall,
  onOpenUpload,
  onUpgradeLatest
}: {
  sourceMeta: {
    sourceKind: string;
    sourceLabel: string;
    registryUrl: string;
  } | null;
  entries: SettingsOfficialPluginCatalogEntry[];
  familiesByProviderCode: Record<string, SettingsPluginFamilyEntry | undefined>;
  loading?: boolean;
  canManage: boolean;
  activePluginId: string | null;
  installState: InstallState;
  upgradingProviderCode: string | null;
  onInstall: (entry: SettingsOfficialPluginCatalogEntry) => void;
  onOpenUpload: () => void;
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
  const openExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="model-provider-panel__official">
      {contextHolder}
      <div className="model-provider-panel__section-head">
        <div>
          <Typography.Title level={5}>模型供应商</Typography.Title>
          <div className="model-provider-panel__official-toolbar">
            {canManage ? <Button onClick={onOpenUpload}>上传插件</Button> : null}
            {sourceMeta ? (
              <Button onClick={() => openExternal(sourceMeta.registryUrl)}>
                来源
              </Button>
            ) : null}
            <Button onClick={() => openExternal(OFFICIAL_PLUGIN_RELEASES_URL)}>
              前往仓库下载
            </Button>
          </div>
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
                <div className="model-provider-panel__catalog-item-main">
                  <div className="model-provider-panel__catalog-item-title-row">
                    <Typography.Title level={5}>
                      {entry.display_name}
                    </Typography.Title>
                  </div>
                  <Typography.Text type="secondary">
                    {getStatusLine(entry, family, installState, activePluginId)}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {entry.plugin_id}
                  </Typography.Text>
                </div>

                {canManage ? (
                  <div className="model-provider-panel__catalog-item-actions">
                    {entry.help_url ? (
                      <Button onClick={() => openExternal(entry.help_url!)}>
                        文档
                      </Button>
                    ) : null}
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
                ) : entry.help_url ? (
                  <div className="model-provider-panel__catalog-item-actions">
                    <Button onClick={() => openExternal(entry.help_url!)}>
                      文档
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
