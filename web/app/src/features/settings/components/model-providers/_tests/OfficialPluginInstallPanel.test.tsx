import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import type { SettingsOfficialPluginCatalogEntry } from '../../../api/plugins';
import { OfficialPluginInstallPanel } from '../OfficialPluginInstallPanel';

const baseEntry: SettingsOfficialPluginCatalogEntry = {
  plugin_id: '1flowbase.openai_compatible',
  provider_code: 'openai_compatible',
  plugin_type: 'model_provider',
  namespace: 'plugin.openai_compatible',
  label_key: 'plugin.label',
  description_key: 'plugin.description',
  provider_label_key: 'provider.label',
  display_name: 'OpenAI Compatible',
  description: '面向 OpenAI 兼容 Chat Completions API 的 provider 插件。',
  protocol: 'openai_compatible',
  latest_version: '0.3.17',
  selected_artifact: {
    os: 'linux',
    arch: 'amd64',
    libc: 'musl',
    rust_target: 'x86_64-unknown-linux-musl',
    download_url: 'https://example.com/openai-compatible.1flowbasepkg',
    checksum: 'sha256:abc123',
    signature_algorithm: null,
    signing_key_id: null
  },
  help_url: 'https://platform.openai.com/docs/api-reference',
  model_discovery_mode: 'hybrid',
  install_status: 'not_installed'
};

function renderPanel(entry: SettingsOfficialPluginCatalogEntry) {
  render(
    <OfficialPluginInstallPanel
      sourceMeta={null}
      entries={[entry]}
      familiesByProviderCode={{}}
      canManage
      activePluginId={null}
      installState="idle"
      upgradingProviderCode={null}
      onInstall={vi.fn()}
      onOpenUpload={vi.fn()}
      onUpgradeLatest={vi.fn()}
    />
  );

  const card = screen.getByText(entry.display_name).closest('article');
  expect(card).not.toBeNull();
  return card!;
}

describe('OfficialPluginInstallPanel', () => {
  test('uses the official catalog icon url when provided', () => {
    const card = renderPanel({
      ...baseEntry,
      icon: 'https://cdn.example.com/openai-compatible.svg'
    });

    expect(
      card.querySelector('.model-provider-panel__provider-icon')
    ).toHaveAttribute('src', 'https://cdn.example.com/openai-compatible.svg');
  });

  test('falls back to the default icon when the catalog entry has no icon', () => {
    const card = renderPanel({
      ...baseEntry,
      icon: null
    });

    expect(
      card.querySelector('.model-provider-panel__provider-icon')
    ).toHaveAttribute('src', '/icon.svg');
  });
});
