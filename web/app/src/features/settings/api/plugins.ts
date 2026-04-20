import {
  getConsolePluginTask,
  installConsoleOfficialPlugin,
  listConsolePluginFamilies,
  listConsoleOfficialPluginCatalog,
  uploadConsolePluginPackage,
  type ConsolePluginFamilyCatalogResponse,
  type ConsoleOfficialPluginCatalogResponse,
  switchConsolePluginFamilyVersion,
  upgradeConsolePluginFamilyLatest,
  type ConsolePluginFamilyEntry,
  type ConsoleOfficialPluginCatalogEntry,
  type ConsolePluginInstallation,
  type InstallConsolePluginResult,
  type ConsolePluginTask
} from '@1flowbase/api-client';

export type SettingsPluginFamilyEntry = ConsolePluginFamilyEntry & {
  display_name: string;
};
export type SettingsOfficialPluginCatalogEntry = ConsoleOfficialPluginCatalogEntry & {
  display_name: string;
};
export type SettingsOfficialPluginCatalogResponse = Omit<
  ConsoleOfficialPluginCatalogResponse,
  'entries'
> & {
  entries: SettingsOfficialPluginCatalogEntry[];
};
export type SettingsPluginInstallation = ConsolePluginInstallation;
export type SettingsInstallPluginResult = InstallConsolePluginResult;
export type SettingsPluginTask = ConsolePluginTask;

const MODEL_PROVIDER_PLUGIN_TYPE = 'model_provider';

export const settingsPluginFamiliesQueryKey = [
  'settings',
  'plugins',
  'families'
] as const;

export const settingsOfficialPluginsQueryKey = [
  'settings',
  'plugins',
  'official-catalog'
] as const;

function pickPreferredLocales(localeMeta: Record<string, unknown>) {
  const candidates = [
    localeMeta.resolved_locale,
    localeMeta.fallback_locale,
    'zh_Hans',
    'en_US'
  ];

  return candidates.filter(
    (value, index): value is string =>
      typeof value === 'string' && candidates.indexOf(value) === index
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readLocalizedValue(
  bundle: Record<string, unknown>,
  dottedKey: string
): string | null {
  let current: unknown = bundle;

  for (const segment of dottedKey.split('.')) {
    current = asRecord(current)?.[segment];
    if (current === undefined) {
      return null;
    }
  }

  return typeof current === 'string' ? current : null;
}

function resolvePluginDisplayName(
  entry: {
    namespace: string;
    provider_label_key: string;
    label_key: string;
    provider_code?: string;
    plugin_id?: string;
  },
  response: Pick<
    ConsolePluginFamilyCatalogResponse | ConsoleOfficialPluginCatalogResponse,
    'locale_meta' | 'i18n_catalog'
  >
) {
  const namespaceCatalog = asRecord(response.i18n_catalog)?.[entry.namespace];
  const localeCatalog = asRecord(namespaceCatalog);

  if (localeCatalog) {
    for (const locale of pickPreferredLocales(response.locale_meta)) {
      const localizedBundle = asRecord(localeCatalog[locale]);

      if (!localizedBundle) {
        continue;
      }

      const providerLabel = readLocalizedValue(
        localizedBundle,
        entry.provider_label_key
      );
      if (providerLabel) {
        return providerLabel;
      }

      const pluginLabel = readLocalizedValue(localizedBundle, entry.label_key);
      if (pluginLabel) {
        return pluginLabel;
      }
    }

    for (const localizedBundle of Object.values(localeCatalog)) {
      const normalizedBundle = asRecord(localizedBundle);

      if (!normalizedBundle) {
        continue;
      }

      const providerLabel = readLocalizedValue(
        normalizedBundle,
        entry.provider_label_key
      );
      if (providerLabel) {
        return providerLabel;
      }

      const pluginLabel = readLocalizedValue(normalizedBundle, entry.label_key);
      if (pluginLabel) {
        return pluginLabel;
      }
    }
  }

  return entry.provider_code ?? entry.plugin_id ?? entry.namespace;
}

export function fetchSettingsPluginFamilies() {
  return listConsolePluginFamilies({
    plugin_type: MODEL_PROVIDER_PLUGIN_TYPE
  }).then((response) =>
    response.entries.map((entry) => ({
      ...entry,
      display_name: resolvePluginDisplayName(entry, response)
    }))
  );
}

export function fetchSettingsOfficialPluginCatalog() {
  return listConsoleOfficialPluginCatalog({
    plugin_type: MODEL_PROVIDER_PLUGIN_TYPE
  }).then((response) => ({
    ...response,
    entries: response.entries.map((entry) => ({
      ...entry,
      display_name: resolvePluginDisplayName(entry, response)
    }))
  }));
}

export function installSettingsOfficialPlugin(
  plugin_id: string,
  csrfToken: string
) {
  return installConsoleOfficialPlugin({ plugin_id }, csrfToken);
}

export function uploadSettingsPluginPackage(file: File, csrfToken: string) {
  return uploadConsolePluginPackage(file, csrfToken);
}

export function upgradeSettingsPluginFamilyLatest(
  providerCode: string,
  csrfToken: string
) {
  return upgradeConsolePluginFamilyLatest(providerCode, csrfToken);
}

export function switchSettingsPluginFamilyVersion(
  providerCode: string,
  installation_id: string,
  csrfToken: string
) {
  return switchConsolePluginFamilyVersion(
    providerCode,
    { installation_id },
    csrfToken
  );
}

export function fetchSettingsPluginTask(taskId: string) {
  return getConsolePluginTask(taskId);
}
