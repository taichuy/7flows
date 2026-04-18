import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';
import { Alert, Button, Result, Tag, Typography } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { SectionPageLayout } from '../../../shared/ui/section-page-layout/SectionPageLayout';
import { ApiDocsPanel } from '../components/ApiDocsPanel';
import { MemberManagementPanel } from '../components/MemberManagementPanel';
import { RolePermissionPanel } from '../components/RolePermissionPanel';
import { ModelProviderCatalogPanel } from '../components/model-providers/ModelProviderCatalogPanel';
import { ModelProviderInstanceDrawer } from '../components/model-providers/ModelProviderInstanceDrawer';
import { ModelProviderInstancesTable } from '../components/model-providers/ModelProviderInstancesTable';
import { OfficialPluginInstallPanel } from '../components/model-providers/OfficialPluginInstallPanel';
import {
  getVisibleSettingsSections,
  type SettingsSectionKey
} from '../lib/settings-sections';
import {
  createSettingsModelProviderInstance,
  deleteSettingsModelProviderInstance,
  fetchSettingsModelProviderCatalog,
  fetchSettingsModelProviderInstances,
  refreshSettingsModelProviderModels,
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
  settingsModelProviderOptionsQueryKey,
  updateSettingsModelProviderInstance,
  validateSettingsModelProviderInstance
} from '../api/model-providers';
import {
  fetchSettingsOfficialPluginCatalog,
  fetchSettingsPluginTask,
  installSettingsOfficialPlugin,
  settingsOfficialPluginsQueryKey
} from '../api/plugins';
import '../components/model-providers/model-provider-panel.css';

function hasAnyPermission(permissions: string[], candidates: string[]) {
  return candidates.some((permission) => permissions.includes(permission));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

function isTaskTerminal(status: string | null | undefined) {
  return status === 'success' || status === 'failed' || status === 'canceled' || status === 'timed_out';
}

function ModelProvidersSection({
  canManage
}: {
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [drawerState, setDrawerState] = useState<
    | { mode: 'create'; installationId: string | null }
    | { mode: 'edit'; instanceId: string }
    | null
  >(null);

  const catalogQuery = useQuery({
    queryKey: settingsModelProviderCatalogQueryKey,
    queryFn: fetchSettingsModelProviderCatalog
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

  const instances = instancesQuery.data ?? [];
  const catalogEntries = catalogQuery.data ?? [];
  const officialCatalogEntries = officialCatalogQuery.data ?? [];
  const editingInstance =
    drawerState?.mode === 'edit'
      ? instances.find((instance) => instance.id === drawerState.instanceId) ?? null
      : null;
  const drawerCatalogEntry =
    drawerState?.mode === 'create'
      ? catalogEntries.find((entry) => entry.installation_id === drawerState.installationId) ??
        catalogEntries[0] ??
        null
      : editingInstance
        ? catalogEntries.find(
            (entry) => entry.installation_id === editingInstance.installation_id
          ) ?? null
        : null;

  async function invalidateModelProviderQueries() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: settingsModelProviderCatalogQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: settingsModelProviderInstancesQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: settingsModelProviderOptionsQueryKey
      }),
      queryClient.invalidateQueries({
        queryKey: settingsOfficialPluginsQueryKey
      })
    ]);
  }

  const handleOfficialInstallSettled = useEffectEvent(async (status: 'success' | 'failed') => {
    if (status === 'success') {
      await invalidateModelProviderQueries();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (input: { installationId: string; display_name: string; config: Record<string, unknown> }) => {
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
    mutationFn: async (input: { instanceId: string; display_name: string; config: Record<string, unknown> }) => {
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
    onSuccess: invalidateModelProviderQueries
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
  const pluginTaskQuery = useQuery({
    queryKey: ['settings', 'plugins', 'task', officialInstallState.taskId],
    queryFn: () => fetchSettingsPluginTask(officialInstallState.taskId!),
    enabled: Boolean(officialInstallState.taskId)
  });

  const refetchOfficialInstallTask = useEffectEvent(() => {
    void pluginTaskQuery.refetch();
  });

  useEffect(() => {
    if (!officialInstallState.taskId || pluginTaskQuery.fetchStatus === 'fetching') {
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
    getErrorMessage(officialCatalogQuery.error) ??
    getErrorMessage(instancesQuery.error) ??
    getErrorMessage(createMutation.error) ??
    getErrorMessage(updateMutation.error) ??
    getErrorMessage(validateMutation.error) ??
    getErrorMessage(refreshMutation.error) ??
    getErrorMessage(deleteMutation.error) ??
    getErrorMessage(officialInstallMutation.error) ??
    getErrorMessage(pluginTaskQuery.error);

  const readyCount = instances.filter((instance) => instance.status === 'ready').length;
  const invalidCount = instances.filter((instance) => instance.status === 'invalid').length;
  const providerCount = catalogEntries.length;
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
          先安装供应商，再配置 API 密钥实例。只有 ready 状态的实例会进入 agentFlow 的模型选项。
        </Typography.Paragraph>
        {errorMessage ? <Alert type="error" showIcon message={errorMessage} /> : null}
      </div>

      <div className="model-provider-panel__main">
        <div className="model-provider-panel__left">
          <section className="model-provider-panel__summary-bar">
            <div className="model-provider-panel__summary-items">
              {overviewRows.map((row) => (
                <div key={row.key} className="model-provider-panel__summary-item">
                  <span className="model-provider-panel__summary-label">{row.label}</span>
                  <span className="model-provider-panel__summary-value">{row.value}</span>
                </div>
              ))}
            </div>
          </section>

          <ModelProviderCatalogPanel
            entries={catalogEntries}
            loading={catalogQuery.isLoading}
            canManage={canManage}
            onCreate={(entry) => {
              setDrawerState({
                mode: 'create',
                installationId: entry.installation_id
              });
            }}
          />

          <section className="model-provider-panel__instances-shell">
            <div className="model-provider-panel__section-head">
              <div>
                <Typography.Title level={5}>当前实例</Typography.Title>
                <Typography.Text type="secondary">
                  每个实例对应一组 API Key 和连接配置。
                </Typography.Text>
              </div>
              {canManage ? (
                <Button
                  type="primary"
                  onClick={() => {
                    setDrawerState({
                      mode: 'create',
                      installationId: catalogEntries[0]?.installation_id ?? null
                    });
                  }}
                  disabled={catalogEntries.length === 0}
                >
                  新建实例
                </Button>
              ) : null}
            </div>
            <div className="model-provider-panel__instance-hints">
              <Tag color="green">ready 可在模型选择器中使用</Tag>
              <Tag color="gold">刷新模型会更新模型目录</Tag>
            </div>
            <ModelProviderInstancesTable
              instances={instances}
              loading={instancesQuery.isLoading}
              canManage={canManage}
              onEdit={(instance) => {
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
          </section>
        </div>

        <aside className="model-provider-panel__sidebar">
          <OfficialPluginInstallPanel
            entries={officialCatalogEntries}
            loading={officialCatalogQuery.isLoading}
            canManage={canManage}
            activePluginId={officialInstallState.pluginId}
            installState={officialInstallState.status}
            onInstall={(entry) => {
              officialInstallMutation.mutate(entry.plugin_id);
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
  const permissionSet = useMemo(() => new Set(me?.permissions ?? []), [me?.permissions]);
  const permissions = me?.permissions ?? [];
  const isRoot = actor?.effective_display_role === 'root';
  const canManageMembers = isRoot || permissionSet.has('user.manage.all');
  const canManageRoles = isRoot || permissionSet.has('role_permission.manage.all');
  const canManageModelProviders =
    isRoot || hasAnyPermission(permissions, ['state_model.manage.all', 'state_model.manage.own']);
  const visibleSections = getVisibleSettingsSections({
    isRoot,
    permissions
  });
  const fallbackSection = visibleSections[0];
  const activeSection = visibleSections.find((section) => section.key === requestedSectionKey);

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
