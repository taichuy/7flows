import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  fetchSettingsModelProviderCatalog,
  fetchSettingsModelProviderInstances,
  fetchSettingsModelProviderMainInstance,
  fetchSettingsModelProviderModels,
  fetchSettingsModelProviderOptions,
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
  settingsModelProviderOptionsQueryKey,
  settingsModelProviderModelsQueryKey
} from '../../../api/model-providers';
import {
  fetchSettingsOfficialPluginCatalog,
  fetchSettingsPluginFamilies,
  settingsOfficialPluginsQueryKey,
  settingsPluginFamiliesQueryKey
} from '../../../api/plugins';
import {
  EMPTY_MODEL_PROVIDER_CATALOG,
  EMPTY_MODEL_PROVIDER_INSTANCES,
  EMPTY_PLUGIN_FAMILIES,
  IDLE_MODEL_PROVIDER_MODELS_QUERY_KEY,
  MODEL_PROVIDER_MAIN_INSTANCE_QUERY_KEY_PREFIX,
  type ModelProviderDrawerState,
  type ModelProviderInstanceModalState
} from './shared';

export function useModelProviderData({
  drawerState,
  instanceModalState
}: {
  drawerState: ModelProviderDrawerState;
  instanceModalState: ModelProviderInstanceModalState;
}) {
  const catalogQuery = useQuery({
    queryKey: settingsModelProviderCatalogQueryKey,
    queryFn: fetchSettingsModelProviderCatalog
  });
  const familiesQuery = useQuery({
    queryKey: settingsPluginFamiliesQueryKey,
    queryFn: fetchSettingsPluginFamilies
  });
  const officialCatalogQuery = useQuery({
    queryKey: settingsOfficialPluginsQueryKey,
    queryFn: fetchSettingsOfficialPluginCatalog
  });
  const instancesQuery = useQuery({
    queryKey: settingsModelProviderInstancesQueryKey,
    queryFn: fetchSettingsModelProviderInstances
  });
  const optionsQuery = useQuery({
    queryKey: settingsModelProviderOptionsQueryKey,
    queryFn: fetchSettingsModelProviderOptions
  });

  const instances = instancesQuery.data ?? EMPTY_MODEL_PROVIDER_INSTANCES;
  const catalogEntries = catalogQuery.data ?? EMPTY_MODEL_PROVIDER_CATALOG;
  const families = familiesQuery.data ?? EMPTY_PLUGIN_FAMILIES;
  const officialCatalogEntries = officialCatalogQuery.data?.entries ?? [];
  const officialSourceMeta = officialCatalogQuery.data
    ? {
        sourceKind: officialCatalogQuery.data.source_kind,
        sourceLabel: officialCatalogQuery.data.source_label,
        registryUrl: officialCatalogQuery.data.registry_url
      }
    : null;

  const catalogEntriesByInstallationId = useMemo(() => {
    const grouped: Record<string, (typeof catalogEntries)[number]> = {};

    for (const entry of catalogEntries) {
      grouped[entry.installation_id] = entry;
    }

    return grouped;
  }, [catalogEntries]);

  const currentCatalogEntriesByProviderCode = useMemo(() => {
    const grouped: Record<string, (typeof catalogEntries)[number] | null> = {};

    for (const family of families) {
      grouped[family.provider_code] =
        catalogEntriesByInstallationId[family.current_installation_id] ??
        catalogEntries.find(
          (entry) => entry.provider_code === family.provider_code
        ) ??
        null;
    }

    return grouped;
  }, [catalogEntries, catalogEntriesByInstallationId, families]);

  const familiesByProviderCode = useMemo(() => {
    const grouped: Record<string, (typeof families)[number]> = {};

    for (const family of families) {
      grouped[family.provider_code] = family;
    }

    return grouped;
  }, [families]);

  const instancesByProviderCode = useMemo(() => {
    const grouped: Record<string, typeof instances> = {};

    for (const instance of instances) {
      grouped[instance.provider_code] ??= [];
      grouped[instance.provider_code]!.push(instance);
    }

    return grouped;
  }, [instances]);

  const providerOptionsByProviderCode = useMemo(() => {
    const grouped: Record<
      string,
      NonNullable<(typeof optionsQuery.data)['providers']>[number]
    > = {};

    for (const provider of optionsQuery.data?.providers ?? []) {
      grouped[provider.provider_code] = provider;
    }

    return grouped;
  }, [optionsQuery.data]);

  const instanceCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const [providerCode, providerInstances] of Object.entries(
      instancesByProviderCode
    )) {
      counts[providerCode] = providerInstances.length;
    }

    return counts;
  }, [instancesByProviderCode]);

  const includedInstanceCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const [providerCode, providerInstances] of Object.entries(
      instancesByProviderCode
    )) {
      counts[providerCode] = providerInstances.filter(
        (instance) => instance.included_in_main
      ).length;
    }

    return counts;
  }, [instancesByProviderCode]);

  const editingInstance =
    drawerState?.mode === 'edit'
      ? (instances.find((instance) => instance.id === drawerState.instanceId) ??
        null)
      : null;

  const drawerCatalogEntry =
    drawerState?.mode === 'create'
      ? (currentCatalogEntriesByProviderCode[drawerState.providerCode] ??
        catalogEntries[0] ??
        null)
      : editingInstance
        ? (catalogEntriesByInstallationId[editingInstance.installation_id] ??
          currentCatalogEntriesByProviderCode[editingInstance.provider_code] ??
          null)
        : null;

  const drawerDefaultIncludedInMain =
    drawerState?.mode === 'create'
      ? providerOptionsByProviderCode[drawerState.providerCode]?.main_instance
          .auto_include_new_instances ?? false
      : editingInstance?.included_in_main ?? false;

  const modalInstances = useMemo(
    () =>
      instanceModalState
        ? (instancesByProviderCode[instanceModalState.providerCode] ??
          EMPTY_MODEL_PROVIDER_INSTANCES)
        : EMPTY_MODEL_PROVIDER_INSTANCES,
    [instanceModalState, instancesByProviderCode]
  );

  const modalCatalogEntry = instanceModalState
    ? (currentCatalogEntriesByProviderCode[instanceModalState.providerCode] ??
      null)
    : null;

  const modalProviderOption = instanceModalState
    ? (providerOptionsByProviderCode[instanceModalState.providerCode] ?? null)
    : null;

  const mainInstanceQuery = useQuery({
    queryKey: instanceModalState
      ? [...MODEL_PROVIDER_MAIN_INSTANCE_QUERY_KEY_PREFIX, instanceModalState.providerCode]
      : [...MODEL_PROVIDER_MAIN_INSTANCE_QUERY_KEY_PREFIX, 'idle'],
    queryFn: () =>
      fetchSettingsModelProviderMainInstance(instanceModalState!.providerCode),
    enabled: Boolean(instanceModalState)
  });

  const editingModelsQuery = useQuery({
    queryKey: editingInstance
      ? settingsModelProviderModelsQueryKey(editingInstance.id)
      : IDLE_MODEL_PROVIDER_MODELS_QUERY_KEY,
    queryFn: () => fetchSettingsModelProviderModels(editingInstance!.id),
    enabled: Boolean(editingInstance)
  });

  const readyCount = instances.filter(
    (instance) => instance.status === 'ready'
  ).length;
  const invalidCount = instances.filter(
    (instance) => instance.status === 'invalid'
  ).length;
  const providerCount = families.length;
  const officialCount = officialCatalogEntries.length;
  const overviewRows = [
    { key: 'providers', label: '已安装供应商', value: String(providerCount) },
    { key: 'ready', label: '可用实例', value: String(readyCount) },
    { key: 'invalid', label: '异常实例', value: String(invalidCount) },
    { key: 'official', label: '可安装供应商', value: String(officialCount) }
  ];

  return {
    catalogQuery,
    familiesQuery,
    officialCatalogQuery,
    instancesQuery,
    optionsQuery,
    mainInstanceQuery,
    instances,
    families,
    officialCatalogEntries,
    officialSourceMeta,
    currentCatalogEntriesByProviderCode,
    familiesByProviderCode,
    instancesByProviderCode,
    providerOptionsByProviderCode,
    instanceCounts,
    includedInstanceCounts,
    editingInstance,
    editingModelCatalog: editingModelsQuery.data ?? null,
    drawerCatalogEntry,
    drawerDefaultIncludedInMain,
    modalInstances,
    modalCatalogEntry,
    modalProviderOption,
    overviewRows
  };
}
