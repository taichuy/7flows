import { useMemo, useState } from 'react';

import { QuestionCircleOutlined } from '@ant-design/icons';
import { Button, Empty, Modal, Select, Tag, Tooltip, Typography } from 'antd';

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

function getTagColor(tag: string) {
  switch (tag) {
    case 'latest':
      return 'gold';
    case 'active':
      return 'green';
    case 'installed':
      return 'blue';
    case 'installing':
      return 'processing';
    case 'failed':
      return 'red';
    case 'hybrid':
      return 'purple';
    case 'dynamic':
      return 'cyan';
    case 'static':
      return 'default';
    default:
      return 'default';
  }
}

function renderTagLabel(tag: string) {
  if (tag === 'latest') {
    return (
      <span className="model-provider-panel__tag-label">
        latest
        <Tooltip title="表示当前版本已经是官方最新版本。">
          <QuestionCircleOutlined className="model-provider-panel__tag-help" />
        </Tooltip>
      </span>
    );
  }

  if (tag === 'hybrid' || tag === 'dynamic' || tag === 'static') {
    return (
      <span className="model-provider-panel__tag-label">
        {tag}
        <Tooltip
          title={
            tag === 'hybrid'
              ? '发现模式：预置模型列表 + 运行时动态拉取模型列表，最后合并。'
              : tag === 'dynamic'
                ? '发现模式：运行时动态拉取模型列表。'
                : '发现模式：只使用插件内预置的模型列表。'
          }
        >
          <QuestionCircleOutlined className="model-provider-panel__tag-help" />
        </Tooltip>
      </span>
    );
  }

  return tag;
}

function getStatusTags(
  entry: SettingsOfficialPluginCatalogEntry,
  family: SettingsPluginFamilyEntry | undefined,
  installState: InstallState,
  activePluginId: string | null
) {
  const tags: string[] = [];

  if (family) {
    tags.push(family.current_version);
    tags.push(
      family.has_update && family.latest_version
        ? family.latest_version
        : 'latest'
    );
    tags.push(entry.model_discovery_mode);
    return tags;
  }

  tags.push(entry.latest_version);

  if (activePluginId === entry.plugin_id && installState === 'installing') {
    tags.push('installing');
  } else if (entry.install_status === 'assigned') {
    tags.push('active');
  } else if (entry.install_status === 'installed') {
    tags.push('installed');
  } else if (activePluginId === entry.plugin_id && installState === 'failed') {
    tags.push('failed');
  } else {
    tags.push('latest');
  }

  tags.push(entry.model_discovery_mode);
  return tags;
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

    return normalizedEntries.filter(
      (entry) => entry.plugin_id === selectedPluginId
    );
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
          {sourceMeta ? (
            <Typography.Text type="secondary">
              当前从{sourceMeta.sourceLabel}读取可安装供应商目录，可直接查看说明后安装到当前
              workspace。
            </Typography.Text>
          ) : null}
          <div className="model-provider-panel__official-toolbar">
            {canManage ? (
              <Button onClick={onOpenUpload}>上传插件</Button>
            ) : null}
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
                  <div className="model-provider-panel__catalog-item-tag-row">
                    {getStatusTags(
                      entry,
                      family,
                      installState,
                      activePluginId
                    ).map((tag) => (
                      <Tag
                        key={`${entry.plugin_id}-${tag}`}
                        color={getTagColor(tag)}
                      >
                        {renderTagLabel(tag)}
                      </Tag>
                    ))}
                  </div>
                  {entry.description ? (
                    <Typography.Paragraph className="model-provider-panel__official-card-description">
                      {entry.description}
                    </Typography.Paragraph>
                  ) : null}
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
                                  <span>协议：{entry.protocol}</span>
                                  <span>
                                    发现模式：{entry.model_discovery_mode}
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
