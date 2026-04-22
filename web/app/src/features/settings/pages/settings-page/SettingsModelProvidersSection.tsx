import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Alert, Layout, Modal, Typography } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';

import { useAuthStore } from '../../../../state/auth-store';
import {
  ModelProviderCatalogPanel
} from '../../components/model-providers/ModelProviderCatalogPanel';
import { ModelProviderInstanceDrawer } from '../../components/model-providers/ModelProviderInstanceDrawer';
import { ModelProviderInstancesModal } from '../../components/model-providers/ModelProviderInstancesModal';
import { OfficialPluginInstallPanel } from '../../components/model-providers/OfficialPluginInstallPanel';
import { PluginUploadInstallModal } from '../../components/model-providers/PluginUploadInstallModal';
import {
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
  settingsModelProviderOptionsQueryKey
} from '../../api/model-providers';
import {
  settingsOfficialPluginsQueryKey,
  settingsPluginFamiliesQueryKey
} from '../../api/plugins';
import '../../components/model-providers/model-provider-panel.css';
import { ModelProviderOverviewSummary } from './model-providers/ModelProviderOverviewSummary';
import {
  getErrorMessage,
  MODEL_PROVIDER_MODELS_QUERY_KEY_PREFIX,
  pickPreferredInstanceId,
  resetUploadState,
  type ModelProviderDrawerState,
  type ModelProviderInstanceModalState,
  type RecentVersionSwitchNotice,
  type UploadResultSummary
} from './model-providers/shared';
import { useModelProviderData } from './model-providers/use-model-provider-data';
import { useModelProviderMutations } from './model-providers/use-model-provider-mutations';
import { useOfficialPluginTask } from './model-providers/use-official-plugin-task';

export function SettingsModelProvidersSection({
  canManage
}: {
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [modal, modalContextHolder] = Modal.useModal();
  const [drawerState, setDrawerState] = useState<ModelProviderDrawerState>(
    null
  );
  const [instanceModalState, setInstanceModalState] =
    useState<ModelProviderInstanceModalState>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [uploadValidationMessage, setUploadValidationMessage] = useState<
    string | null
  >(null);
  const [uploadResultSummary, setUploadResultSummary] =
    useState<UploadResultSummary>(null);
  const [recentVersionSwitchNotice, setRecentVersionSwitchNotice] =
    useState<RecentVersionSwitchNotice>(null);
  const clearUploadState = () => {
    resetUploadState(
      setUploadFileList,
      setUploadValidationMessage,
      setUploadResultSummary
    );
  };

  const handleOfficialInstallSettled = async (
    status: 'success' | 'failed'
  ) => {
    if (status !== 'success') {
      return;
    }

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
  };
  const {
    officialInstallState,
    setOfficialInstallState,
    pluginTaskQuery
  } = useOfficialPluginTask({
    onSettled: handleOfficialInstallSettled
  });
  const {
    catalogQuery,
    familiesQuery,
    officialCatalogQuery,
    instancesQuery,
    modelsQuery,
    families,
    officialCatalogEntries,
    officialSourceMeta,
    currentCatalogEntriesByProviderCode,
    familiesByProviderCode,
    instancesByProviderCode,
    instanceCounts,
    editingInstance,
    drawerCatalogEntry,
    modalInstances,
    modalSelectedInstanceId,
    modalCatalogEntry,
    overviewRows
  } = useModelProviderData({
    drawerState,
    instanceModalState,
    setInstanceModalState
  });
  const {
    createMutation,
    updateMutation,
    validateMutation,
    refreshMutation,
    revealSecretMutation,
    deleteMutation,
    familyDeleteMutation,
    officialInstallMutation,
    uploadMutation,
    versionMutation
  } = useModelProviderMutations({
    csrfToken,
    queryClient,
    setDrawerState,
    setInstanceModalState,
    setOfficialInstallState,
    setUploadValidationMessage,
    setUploadResultSummary,
    setRecentVersionSwitchNotice
  });

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
    getErrorMessage(familyDeleteMutation.error) ??
    getErrorMessage(officialInstallMutation.error) ??
    getErrorMessage(versionMutation.error) ??
    getErrorMessage(pluginTaskQuery.error);
  const uploadErrorMessage =
    uploadValidationMessage ?? getErrorMessage(uploadMutation.error);

  return (
    <div className="model-provider-panel">
      {modalContextHolder}
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

        <Layout className="model-provider-panel__main">
          <Layout.Content className="model-provider-panel__left">
            <ModelProviderOverviewSummary rows={overviewRows} />

            <ModelProviderCatalogPanel
              entries={families}
              currentCatalogEntries={currentCatalogEntriesByProviderCode}
              instanceCounts={instanceCounts}
              loading={catalogQuery.isLoading || familiesQuery.isLoading}
              canManage={canManage}
              deletingProviderCode={
                familyDeleteMutation.isPending
                  ? (familyDeleteMutation.variables ?? null)
                  : null
              }
              switchingProviderCode={
                versionMutation.isPending &&
                versionMutation.variables.mode === 'switch'
                  ? versionMutation.variables.providerCode
                  : null
              }
              upgradingProviderCode={
                versionMutation.isPending &&
                versionMutation.variables.mode === 'upgrade'
                  ? versionMutation.variables.providerCode
                  : null
              }
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
              onUpgradeLatest={(entry) => {
                versionMutation.mutate({
                  mode: 'upgrade',
                  providerCode: entry.provider_code
                });
              }}
              onSwitchVersion={(entry, installationId) => {
                versionMutation.mutate({
                  mode: 'switch',
                  providerCode: entry.provider_code,
                  installationId
                });
              }}
              onDelete={(entry) => {
                void modal.confirm({
                  title: '删除供应商',
                  icon: null,
                  centered: true,
                  okText: '删除',
                  okType: 'danger',
                  cancelText: '取消',
                  okButtonProps: {
                    loading:
                      familyDeleteMutation.isPending &&
                      familyDeleteMutation.variables === entry.provider_code
                  },
                  content: (
                    <div className="model-provider-panel__install-confirm">
                      <div className="model-provider-panel__install-confirm-card">
                        <Typography.Title level={5}>
                          {entry.display_name}
                        </Typography.Title>
                        <Typography.Paragraph type="secondary">
                          删除后会一并清理该供应商的全部实例、安装记录和本地插件文件。
                        </Typography.Paragraph>
                        <Typography.Paragraph type="secondary">
                          如果现有流程节点仍引用这个供应商，后续报错属于正常现象；重新安装同一
                          provider 并恢复对应 model 后，节点可继续恢复使用。
                        </Typography.Paragraph>
                      </div>
                    </div>
                  ),
                  onOk: async () => {
                    await familyDeleteMutation.mutateAsync(entry.provider_code);
                  }
                });
              }}
            />
          </Layout.Content>

        <Layout.Sider
          width={360}
          theme="light"
          className="model-provider-panel__sidebar"
        >
          <OfficialPluginInstallPanel
            sourceMeta={officialSourceMeta}
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
            onOpenUpload={() => {
              setUploadModalOpen(true);
              clearUploadState();
            }}
            onUpgradeLatest={(entry) => {
              versionMutation.mutate({
                mode: 'upgrade',
                providerCode: entry.provider_code
              });
            }}
          />
        </Layout.Sider>
      </Layout>

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

      <PluginUploadInstallModal
        open={uploadModalOpen}
        submitting={uploadMutation.isPending}
        resultSummary={uploadResultSummary}
        errorMessage={uploadErrorMessage}
        fileList={uploadFileList}
        onClose={() => {
          setUploadModalOpen(false);
          clearUploadState();
        }}
        onChange={(nextFiles) => {
          clearUploadState();
          setUploadFileList(nextFiles.slice(-1));
        }}
        onSubmit={() => {
          const file = uploadFileList[0]?.originFileObj;
          if (!(file instanceof File)) {
            setUploadValidationMessage('请先选择插件包');
            return;
          }

          uploadMutation.mutate(file);
        }}
      />
    </div>
  );
}
