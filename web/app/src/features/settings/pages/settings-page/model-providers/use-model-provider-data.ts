import { useEffect, useMemo } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  fetchSettingsModelProviderCatalog,
  fetchSettingsModelProviderInstances,
  fetchSettingsModelProviderModels,
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
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
  pickPreferredInstanceId,
  type ModelProviderDrawerState,
  type ModelProviderInstanceModalState
} from './shared';

export function useModelProviderData({
  drawerState,
  instanceModalState,
  setInstanceModalState
}: {
  drawerState: ModelProviderDrawerState;
  instanceModalState: ModelProviderInstanceModalState;
  setInstanceModalState: Dispatch<
    SetStateAction<ModelProviderInstanceModalState>
  >;
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
  const instanceCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const [providerCode, providerInstances] of Object.entries(
      instancesByProviderCode
    )) {
      counts[providerCode] = providerInstances.length;
    }

    return counts;
  }, [instancesByProviderCode]);
  const primaryInstanceSummary = useMemo(() => {
    return Object.fromEntries(
      Object.entries(instancesByProviderCode).map(
        ([providerCode, providerInstances]) => [
          providerCode,
          providerInstances.find((instance) => instance.is_primary)
            ?.display_name ?? '未设置'
        ]
      )
    );
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
  const modalInstances = useMemo(
    () =>
      instanceModalState
        ? (instancesByProviderCode[instanceModalState.providerCode] ??
          EMPTY_MODEL_PROVIDER_INSTANCES)
        : EMPTY_MODEL_PROVIDER_INSTANCES,
    [instanceModalState, instancesByProviderCode]
  );
  const modalSelectedInstanceId =
    instanceModalState &&
    modalInstances.some(
      (instance) => instance.id === instanceModalState.selectedInstanceId
    )
      ? instanceModalState.selectedInstanceId
      : pickPreferredInstanceId(modalInstances);
  const selectedModalInstance =
    modalInstances.find(
      (instance) => instance.id === modalSelectedInstanceId
    ) ??
    modalInstances[0] ??
    null;
  const modalCatalogEntry = instanceModalState
    ? selectedModalInstance
      ? (catalogEntriesByInstallationId[
          selectedModalInstance.installation_id
        ] ??
        currentCatalogEntriesByProviderCode[instanceModalState.providerCode] ??
        null)
      : (currentCatalogEntriesByProviderCode[instanceModalState.providerCode] ??
        null)
    : null;
  const modelsQuery = useQuery({
    queryKey: modalSelectedInstanceId
      ? settingsModelProviderModelsQueryKey(modalSelectedInstanceId)
      : IDLE_MODEL_PROVIDER_MODELS_QUERY_KEY,
    queryFn: () => fetchSettingsModelProviderModels(modalSelectedInstanceId!),
    enabled: false
  });

  useEffect(() => {
    if (!instanceModalState) {
      return;
    }

    const nextSelectedInstanceId = pickPreferredInstanceId(modalInstances);

    if (!modalSelectedInstanceId && !nextSelectedInstanceId) {
      return;
    }

    if (modalSelectedInstanceId !== instanceModalState.selectedInstanceId) {
      setInstanceModalState((current) =>
        current
          ? {
              ...current,
              selectedInstanceId: modalSelectedInstanceId
            }
          : current
      );
    }
  }, [instanceModalState, modalInstances, modalSelectedInstanceId, setInstanceModalState]);

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
    modelsQuery,
    instances,
    families,
    officialCatalogEntries,
    officialSourceMeta,
    currentCatalogEntriesByProviderCode,
    familiesByProviderCode,
    instancesByProviderCode,
    instanceCounts,
    primaryInstanceSummary,
    editingInstance,
    drawerCatalogEntry,
    modalInstances,
    modalSelectedInstanceId,
    modalCatalogEntry,
    overviewRows
  };
}
