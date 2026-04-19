import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';
import { Alert, Result, Typography } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { SectionPageLayout } from '../../../shared/ui/section-page-layout/SectionPageLayout';
import { ApiDocsPanel } from '../components/ApiDocsPanel';
import { MemberManagementPanel } from '../components/MemberManagementPanel';
import { RolePermissionPanel } from '../components/RolePermissionPanel';
import { ModelProviderCatalogPanel } from '../components/model-providers/ModelProviderCatalogPanel';
import { ModelProviderInstanceDrawer } from '../components/model-providers/ModelProviderInstanceDrawer';
import { ModelProviderInstancesModal } from '../components/model-providers/ModelProviderInstancesModal';
import { OfficialPluginInstallPanel } from '../components/model-providers/OfficialPluginInstallPanel';
import { PluginVersionManagementModal } from '../components/model-providers/PluginVersionManagementModal';
import {
  getVisibleSettingsSections,
  type SettingsSectionKey
} from '../lib/settings-sections';
import {
  createSettingsModelProviderInstance,
  deleteSettingsModelProviderInstance,
  fetchSettingsModelProviderCatalog,
  fetchSettingsModelProviderInstances,
  fetchSettingsModelProviderModels,
  refreshSettingsModelProviderModels,
  revealSettingsModelProviderSecret,
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
  settingsModelProviderModelsQueryKey,
  settingsModelProviderOptionsQueryKey,
  type SettingsModelProviderCatalogEntry,
  type SettingsModelProviderInstance,
  updateSettingsModelProviderInstance,
  validateSettingsModelProviderInstance
} from '../api/model-providers';
import {
  fetchSettingsOfficialPluginCatalog,
  fetchSettingsPluginFamilies,
  fetchSettingsPluginTask,
  installSettingsOfficialPlugin,
  settingsPluginFamiliesQueryKey,
  settingsOfficialPluginsQueryKey,
  switchSettingsPluginFamilyVersion,
  type SettingsPluginFamilyEntry,
  upgradeSettingsPluginFamilyLatest
} from '../api/plugins';
import '../components/model-providers/model-provider-panel.css';

function hasAnyPermission(permissions: string[], candidates: string[]) {
  return candidates.some((permission) => permissions.includes(permission));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

function isTaskTerminal(status: string | null | undefined) {
  return (
    status === 'success' ||
    status === 'failed' ||
    status === 'canceled' ||
    status === 'timed_out'
  );
}

const EMPTY_MODEL_PROVIDER_INSTANCES: SettingsModelProviderInstance[] = [];
const EMPTY_MODEL_PROVIDER_CATALOG: SettingsModelProviderCatalogEntry[] = [];
const IDLE_MODEL_PROVIDER_MODELS_QUERY_KEY = [
  'settings',
  'model-providers',
  'models',
  'idle'
] as const;
const MODEL_PROVIDER_MODELS_QUERY_KEY_PREFIX = [
  'settings',
  'model-providers',
  'models'
] as const;

function pickPreferredInstanceId(instances: { id: string; status: string }[]) {
  return (
    instances.find((instance) => instance.status === 'ready')?.id ??
    instances[0]?.id ??
    null
  );
}

function parseTaskDetailString(detail: Record<string, unknown>, key: string) {
  const value = detail[key];
  return typeof value === 'string' ? value : null;
}

function parseTaskDetailNumber(detail: Record<string, unknown>, key: string) {
  const value = detail[key];
  return typeof value === 'number' ? value : null;
}

function ModelProvidersSection({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [drawerState, setDrawerState] = useState<
    | { mode: 'create'; providerCode: string }
    | { mode: 'edit'; instanceId: string }
    | null
  >(null);
  const [instanceModalState, setInstanceModalState] = useState<{
    providerCode: string;
    selectedInstanceId: string | null;
  } | null>(null);
  const [versionModalProviderCode, setVersionModalProviderCode] = useState<
    string | null
  >(null);
  const [recentVersionSwitchNotice, setRecentVersionSwitchNotice] = useState<{
    providerCode: string;
    targetVersion: string | null;
    migratedInstanceCount: number | null;
  } | null>(null);

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
  const [officialInstallState, setOfficialInstallState] = useState<{
    pluginId: string | null;
    taskId: string | null;
    status: 'idle' | 'installing' | 'success' | 'failed';
  }>({
    pluginId: null,
    taskId: null,
    status: 'idle'
  });

  const instances = instancesQuery.data ?? EMPTY_MODEL_PROVIDER_INSTANCES;
  const catalogEntries = catalogQuery.data ?? EMPTY_MODEL_PROVIDER_CATALOG;
  const families = familiesQuery.data ?? [];
  const officialCatalogEntries = officialCatalogQuery.data ?? [];
  const catalogEntriesByInstallationId = useMemo(() => {
    const grouped: Record<string, SettingsModelProviderCatalogEntry> = {};

    for (const entry of catalogEntries) {
      grouped[entry.installation_id] = entry;
    }

    return grouped;
  }, [catalogEntries]);
  const currentCatalogEntriesByProviderCode = useMemo(() => {
    const grouped: Record<string, SettingsModelProviderCatalogEntry | null> =
      {};

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
    const grouped: Record<string, SettingsPluginFamilyEntry> = {};

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
  const activeVersionFamily = versionModalProviderCode
    ? (familiesByProviderCode[versionModalProviderCode] ?? null)
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
  }, [instanceModalState, modalInstances, modalSelectedInstanceId]);

  async function invalidateModelProviderQueries() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: settingsModelProviderCatalogQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: settingsModelProviderInstancesQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: settingsPluginFamiliesQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: settingsModelProviderOptionsQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: MODEL_PROVIDER_MODELS_QUERY_KEY_PREFIX
      }),
      queryClient.invalidateQueries({
        queryKey: settingsOfficialPluginsQueryKey
      })
    ]);
  }

  const handleOfficialInstallSettled = useEffectEvent(
    async (status: 'success' | 'failed') => {
      if (status === 'success') {
        await invalidateModelProviderQueries();
      }
    }
  );

  const createMutation = useMutation({
    mutationFn: async (input: {
      installationId: string;
      display_name: string;
      config: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return createSettingsModelProviderInstance(
        {
          installation_id: input.installationId,
          display_name: input.display_name,
          config: input.config
        },
        csrfToken
      );
    },
    onSuccess: async () => {
      setDrawerState(null);
      await invalidateModelProviderQueries();
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (input: {
      instanceId: string;
      display_name: string;
      config: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return updateSettingsModelProviderInstance(
        input.instanceId,
        {
          display_name: input.display_name,
          config: input.config
        },
        csrfToken
      );
    },
    onSuccess: async () => {
      setDrawerState(null);
      await invalidateModelProviderQueries();
    }
  });

  const validateMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return validateSettingsModelProviderInstance(instanceId, csrfToken);
    },
    onSuccess: invalidateModelProviderQueries
  });

  const refreshMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return refreshSettingsModelProviderModels(instanceId, csrfToken);
    },
    onSuccess: async (catalog) => {
      queryClient.setQueryData(
        settingsModelProviderModelsQueryKey(catalog.provider_instance_id),
        catalog
      );
      await invalidateModelProviderQueries();
    }
  });

  const revealSecretMutation = useMutation({
    mutationFn: async (input: { instanceId: string; key: string }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return revealSettingsModelProviderSecret(
        input.instanceId,
        input.key,
        csrfToken
      );
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return deleteSettingsModelProviderInstance(instanceId, csrfToken);
    },
    onSuccess: invalidateModelProviderQueries
  });
  const officialInstallMutation = useMutation({
    mutationFn: async (pluginId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return installSettingsOfficialPlugin(pluginId, csrfToken);
    },
    onMutate: (pluginId) => {
      setOfficialInstallState({
        pluginId,
        taskId: null,
        status: 'installing'
      });
    },
    onSuccess: async (result, pluginId) => {
      if (result.task.finished_at || isTaskTerminal(result.task.status)) {
        const status = result.task.status === 'success' ? 'success' : 'failed';
        setOfficialInstallState({
          pluginId,
          taskId: null,
          status
        });
        await handleOfficialInstallSettled(status);
        return;
      }

      setOfficialInstallState({
        pluginId,
        taskId: result.task.id,
        status: 'installing'
      });
    },
    onError: (_error, pluginId) => {
      setOfficialInstallState({
        pluginId,
        taskId: null,
        status: 'failed'
      });
    }
  });
  const versionMutation = useMutation({
    mutationFn: async (
      input:
        | { mode: 'upgrade'; providerCode: string }
        | { mode: 'switch'; providerCode: string; installationId: string }
    ) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      const task =
        input.mode === 'upgrade'
          ? upgradeSettingsPluginFamilyLatest(input.providerCode, csrfToken)
          : switchSettingsPluginFamilyVersion(
              input.providerCode,
              input.installationId,
              csrfToken
            );

      const resolvedTask = await task;
      if (
        isTaskTerminal(resolvedTask.status) &&
        resolvedTask.status !== 'success'
      ) {
        throw new Error(resolvedTask.status_message ?? '版本切换失败');
      }

      return resolvedTask;
    },
    onSuccess: async (task, variables) => {
      const detail = task.detail_json ?? {};

      setVersionModalProviderCode(null);
      setRecentVersionSwitchNotice({
        providerCode: variables.providerCode,
        targetVersion: parseTaskDetailString(detail, 'target_version'),
        migratedInstanceCount: parseTaskDetailNumber(
          detail,
          'migrated_instance_count'
        )
      });
      await invalidateModelProviderQueries();
    }
  });
  const pluginTaskQuery = useQuery({
    queryKey: ['settings', 'plugins', 'task', officialInstallState.taskId],
    queryFn: () => fetchSettingsPluginTask(officialInstallState.taskId!),
    enabled: Boolean(officialInstallState.taskId)
  });

  const refetchOfficialInstallTask = useEffectEvent(() => {
    void pluginTaskQuery.refetch();
  });

  useEffect(() => {
    if (
      !officialInstallState.taskId ||
      pluginTaskQuery.fetchStatus === 'fetching'
    ) {
      return;
    }

    const task = pluginTaskQuery.data;
    if (task?.finished_at || isTaskTerminal(task?.status)) {
      return;
    }

    const timer = window.setTimeout(() => {
      refetchOfficialInstallTask();
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    officialInstallState.taskId,
    pluginTaskQuery.data,
    pluginTaskQuery.fetchStatus,
    refetchOfficialInstallTask
  ]);

  useEffect(() => {
    const task = pluginTaskQuery.data;
    if (!task || !officialInstallState.taskId) {
      return;
    }

    if (!task.finished_at && !isTaskTerminal(task.status)) {
      return;
    }

    const status = task.status === 'success' ? 'success' : 'failed';
    setOfficialInstallState((current) => ({
      pluginId: current.pluginId,
      taskId: null,
      status
    }));
    void handleOfficialInstallSettled(status);
  }, [
    handleOfficialInstallSettled,
    officialInstallState.taskId,
    pluginTaskQuery.data
  ]);

  const errorMessage =
    getErrorMessage(catalogQuery.error) ??
    getErrorMessage(familiesQuery.error) ??
    getErrorMessage(officialCatalogQuery.error) ??
    getErrorMessage(instancesQuery.error) ??
    getErrorMessage(modelsQuery.error) ??
    getErrorMessage(createMutation.error) ??
    getErrorMessage(updateMutation.error) ??
    getErrorMessage(revealSecretMutation.error) ??
    getErrorMessage(validateMutation.error) ??
    getErrorMessage(refreshMutation.error) ??
    getErrorMessage(deleteMutation.error) ??
    getErrorMessage(officialInstallMutation.error) ??
    getErrorMessage(versionMutation.error) ??
    getErrorMessage(pluginTaskQuery.error);

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

  return (
    <div className="model-provider-panel">
      <div className="model-provider-panel__header">
        <Typography.Title level={4}>模型供应商</Typography.Title>
        <Typography.Paragraph type="secondary">
          先安装供应商，再配置 API 密钥实例。只有 ready 状态的实例会进入
          agentFlow 的模型选项。
        </Typography.Paragraph>
        {errorMessage ? (
          <Alert type="error" showIcon message={errorMessage} />
        ) : null}
      </div>

      <div className="model-provider-panel__main">
        <div className="model-provider-panel__left">
          <section className="model-provider-panel__summary-bar">
            <div className="model-provider-panel__summary-items">
              {overviewRows.map((row) => (
                <div
                  key={row.key}
                  className="model-provider-panel__summary-item"
                >
                  <span className="model-provider-panel__summary-label">
                    {row.label}
                  </span>
                  <span className="model-provider-panel__summary-value">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <ModelProviderCatalogPanel
            entries={families}
            currentCatalogEntries={currentCatalogEntriesByProviderCode}
            instanceCounts={instanceCounts}
            loading={catalogQuery.isLoading || familiesQuery.isLoading}
            canManage={canManage}
            onViewInstances={(entry) => {
              const providerInstances =
                instancesByProviderCode[entry.provider_code] ?? [];
              setInstanceModalState({
                providerCode: entry.provider_code,
                selectedInstanceId: pickPreferredInstanceId(providerInstances)
              });
            }}
            onCreate={(entry) => {
              setDrawerState({
                mode: 'create',
                providerCode: entry.provider_code
              });
            }}
            onManageVersion={(entry) => {
              setVersionModalProviderCode(entry.provider_code);
            }}
          />
        </div>

        <aside className="model-provider-panel__sidebar">
          <OfficialPluginInstallPanel
            entries={officialCatalogEntries}
            familiesByProviderCode={familiesByProviderCode}
            loading={officialCatalogQuery.isLoading}
            canManage={canManage}
            activePluginId={officialInstallState.pluginId}
            installState={officialInstallState.status}
            upgradingProviderCode={
              versionMutation.isPending &&
              versionMutation.variables?.mode === 'upgrade'
                ? (versionMutation.variables.providerCode ?? null)
                : null
            }
            onInstall={(entry) => {
              officialInstallMutation.mutate(entry.plugin_id);
            }}
            onUpgradeLatest={(entry) => {
              versionMutation.mutate({
                mode: 'upgrade',
                providerCode: entry.provider_code
              });
            }}
          />
        </aside>
      </div>

      <ModelProviderInstanceDrawer
        open={drawerState !== null}
        mode={drawerState?.mode ?? 'create'}
        catalogEntry={drawerCatalogEntry}
        instance={editingInstance}
        submitting={createMutation.isPending || updateMutation.isPending}
        onClose={() => setDrawerState(null)}
        onRevealSecret={async (fieldKey) => {
          if (!editingInstance) {
            throw new Error('missing provider instance');
          }

          const result = await revealSecretMutation.mutateAsync({
            instanceId: editingInstance.id,
            key: fieldKey
          });

          return typeof result.value === 'string'
            ? result.value
            : JSON.stringify(result.value ?? '');
        }}
        onSubmit={async (values) => {
          if (drawerState?.mode === 'edit' && editingInstance) {
            await updateMutation.mutateAsync({
              instanceId: editingInstance.id,
              display_name: values.display_name,
              config: values.config
            });
            return;
          }

          if (!drawerCatalogEntry) {
            throw new Error('missing provider catalog entry');
          }

          await createMutation.mutateAsync({
            installationId: drawerCatalogEntry.installation_id,
            display_name: values.display_name,
            config: values.config
          });
        }}
      />

      <ModelProviderInstancesModal
        open={instanceModalState !== null}
        catalogEntry={modalCatalogEntry}
        instances={modalInstances}
        selectedInstanceId={modalSelectedInstanceId}
        modelCatalog={modelsQuery.data ?? null}
        modelsLoading={modelsQuery.isFetching}
        validating={validateMutation.isPending}
        refreshing={refreshMutation.isPending}
        deleting={deleteMutation.isPending}
        canManage={canManage}
        versionSwitchNotice={
          instanceModalState &&
          recentVersionSwitchNotice?.providerCode ===
            instanceModalState.providerCode
            ? {
                targetVersion: recentVersionSwitchNotice.targetVersion,
                migratedInstanceCount:
                  recentVersionSwitchNotice.migratedInstanceCount
              }
            : null
        }
        onClose={() => {
          setInstanceModalState(null);
          setRecentVersionSwitchNotice((current) =>
            current && current.providerCode === instanceModalState?.providerCode
              ? null
              : current
          );
        }}
        onChangeInstance={(instanceId) => {
          setInstanceModalState((current) =>
            current
              ? {
                  ...current,
                  selectedInstanceId: instanceId
                }
              : current
          );
        }}
        onFetchModels={() => {
          void modelsQuery.refetch();
        }}
        onEdit={(instance) => {
          setInstanceModalState(null);
          setDrawerState({
            mode: 'edit',
            instanceId: instance.id
          });
        }}
        onValidate={(instance) => {
          validateMutation.mutate(instance.id);
        }}
        onRefreshModels={(instance) => {
          refreshMutation.mutate(instance.id);
        }}
        onDelete={(instance) => {
          deleteMutation.mutate(instance.id);
        }}
      />

      <PluginVersionManagementModal
        open={versionModalProviderCode !== null}
        family={activeVersionFamily}
        submitting={versionMutation.isPending}
        pendingMode={
          versionMutation.isPending
            ? (versionMutation.variables?.mode ?? null)
            : null
        }
        pendingInstallationId={
          versionMutation.isPending &&
          versionMutation.variables?.mode === 'switch'
            ? versionMutation.variables.installationId
            : null
        }
        onClose={() => setVersionModalProviderCode(null)}
        onUpgradeLatest={(family) => {
          versionMutation.mutate({
            mode: 'upgrade',
            providerCode: family.provider_code
          });
        }}
        onSwitchVersion={(family, installationId) => {
          versionMutation.mutate({
            mode: 'switch',
            providerCode: family.provider_code,
            installationId
          });
        }}
      />
    </div>
  );
}

export function SettingsPage({
  requestedSectionKey
}: {
  requestedSectionKey?: SettingsSectionKey;
}) {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const permissionSet = useMemo(
    () => new Set(me?.permissions ?? []),
    [me?.permissions]
  );
  const permissions = me?.permissions ?? [];
  const isRoot = actor?.effective_display_role === 'root';
  const canManageMembers = isRoot || permissionSet.has('user.manage.all');
  const canManageRoles =
    isRoot || permissionSet.has('role_permission.manage.all');
  const canManageModelProviders =
    isRoot ||
    hasAnyPermission(permissions, [
      'state_model.manage.all',
      'state_model.manage.own'
    ]);
  const visibleSections = getVisibleSettingsSections({
    isRoot,
    permissions
  });
  const fallbackSection = visibleSections[0];
  const activeSection = visibleSections.find(
    (section) => section.key === requestedSectionKey
  );

  if (!fallbackSection) {
    return (
      <SectionPageLayout
        pageTitle="设置"
        pageDescription="系统管理域包含文档、成员和权限相关配置。"
        navItems={[]}
        activeKey=""
        contentWidth="wide"
        emptyState={<Result status="info" title="当前账号暂无可访问内容" />}
      >
        {null}
      </SectionPageLayout>
    );
  }

  if (!requestedSectionKey || !activeSection) {
    return <Navigate to={fallbackSection.to} replace />;
  }

  return (
    <SectionPageLayout
      pageTitle="设置"
      pageDescription="系统管理域包含文档、成员和权限相关配置。"
      navItems={visibleSections}
      activeKey={activeSection.key}
      contentWidth="wide"
    >
      <>
        {activeSection?.key === 'members' ? (
          <MemberManagementPanel
            canManageMembers={canManageMembers}
            canManageRoleBindings={canManageRoles}
          />
        ) : activeSection?.key === 'model-providers' ? (
          <ModelProvidersSection canManage={canManageModelProviders} />
        ) : activeSection?.key === 'roles' ? (
          <RolePermissionPanel canManageRoles={canManageRoles} />
        ) : (
          <ApiDocsPanel />
        )}
      </>
    </SectionPageLayout>
  );
}
