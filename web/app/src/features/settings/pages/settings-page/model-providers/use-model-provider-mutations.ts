import { useMutation, type QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';

import {
  createSettingsModelProviderInstance,
  deleteSettingsModelProviderInstance,
  previewSettingsModelProviderModels,
  refreshSettingsModelProviderModels,
  revealSettingsModelProviderSecret,
  settingsModelProviderCatalogQueryKey,
  settingsModelProviderInstancesQueryKey,
  settingsModelProviderOptionsQueryKey,
  updateSettingsModelProviderInstance,
  updateSettingsModelProviderMainInstance,
  validateSettingsModelProviderInstance,
  type SettingsModelProviderInstance
} from '../../../api/model-providers';
import {
  deleteSettingsPluginFamily,
  installSettingsOfficialPlugin,
  settingsOfficialPluginsQueryKey,
  settingsPluginFamiliesQueryKey,
  switchSettingsPluginFamilyVersion,
  upgradeSettingsPluginFamilyLatest,
  uploadSettingsPluginPackage
} from '../../../api/plugins';
import { formatPluginAvailabilityStatus } from '../../../components/model-providers/plugin-installation-status';
import {
  formatTrustLabel,
  isTaskSucceeded,
  isTaskTerminal,
  MODEL_PROVIDER_MAIN_INSTANCE_QUERY_KEY_PREFIX,
  MODEL_PROVIDER_MODELS_QUERY_KEY_PREFIX,
  type ModelProviderDrawerState,
  type ModelProviderInstanceModalState,
  type OfficialInstallState,
  type RecentVersionSwitchNotice,
  type UploadResultSummary
} from './shared';

export function useModelProviderMutations({
  csrfToken,
  queryClient,
  setDrawerState,
  setInstanceModalState,
  setOfficialInstallState,
  setUploadValidationMessage,
  setUploadResultSummary,
  setRecentVersionSwitchNotice
}: {
  csrfToken: string | null;
  queryClient: QueryClient;
  setDrawerState: Dispatch<SetStateAction<ModelProviderDrawerState>>;
  setInstanceModalState: Dispatch<SetStateAction<ModelProviderInstanceModalState>>;
  setOfficialInstallState: Dispatch<SetStateAction<OfficialInstallState>>;
  setUploadValidationMessage: Dispatch<SetStateAction<string | null>>;
  setUploadResultSummary: Dispatch<SetStateAction<UploadResultSummary>>;
  setRecentVersionSwitchNotice: Dispatch<SetStateAction<RecentVersionSwitchNotice>>;
}) {
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
        queryKey: MODEL_PROVIDER_MAIN_INSTANCE_QUERY_KEY_PREFIX
      }),
      queryClient.invalidateQueries({
        queryKey: MODEL_PROVIDER_MODELS_QUERY_KEY_PREFIX
      }),
      queryClient.invalidateQueries({
        queryKey: settingsOfficialPluginsQueryKey
      })
    ]);
  }

  const createMutation = useMutation({
    mutationFn: async (input: {
      installationId: string;
      display_name: string;
      included_in_main: boolean;
      configured_models: Array<{ model_id: string; enabled: boolean }>;
      preview_token?: string;
      config: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return createSettingsModelProviderInstance(
        {
          installation_id: input.installationId,
          display_name: input.display_name,
          included_in_main: input.included_in_main,
          configured_models: input.configured_models,
          preview_token: input.preview_token,
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
      included_in_main: boolean;
      configured_models: Array<{ model_id: string; enabled: boolean }>;
      preview_token?: string;
      config: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return updateSettingsModelProviderInstance(
        input.instanceId,
        {
          display_name: input.display_name,
          included_in_main: input.included_in_main,
          configured_models: input.configured_models,
          preview_token: input.preview_token,
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

  const updateInstanceInclusionMutation = useMutation({
    mutationFn: async (input: {
      instance: SettingsModelProviderInstance;
      included_in_main: boolean;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return updateSettingsModelProviderInstance(
        input.instance.id,
        {
          display_name: input.instance.display_name,
          included_in_main: input.included_in_main,
          configured_models: input.instance.configured_models,
          config: input.instance.config_json
        },
        csrfToken
      );
    },
    onSuccess: invalidateModelProviderQueries
  });

  const updateMainInstanceSettingsMutation = useMutation({
    mutationFn: async (input: {
      providerCode: string;
      auto_include_new_instances: boolean;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return updateSettingsModelProviderMainInstance(
        input.providerCode,
        {
          auto_include_new_instances: input.auto_include_new_instances
        },
        csrfToken
      );
    },
    onSuccess: invalidateModelProviderQueries
  });

  const previewMutation = useMutation({
    mutationFn: async (input: {
      installationId?: string;
      instanceId?: string;
      config: Record<string, unknown>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return previewSettingsModelProviderModels(
        {
          installation_id: input.installationId,
          instance_id: input.instanceId,
          config: input.config
        },
        csrfToken
      );
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
    onSuccess: async () => {
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

  const familyDeleteMutation = useMutation({
    mutationFn: async (providerCode: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return deleteSettingsPluginFamily(providerCode, csrfToken);
    },
    onSuccess: async () => {
      setDrawerState(null);
      setInstanceModalState(null);
      await invalidateModelProviderQueries();
    }
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
        const status = isTaskSucceeded(result.task.status)
          ? 'success'
          : 'failed';
        setOfficialInstallState({
          pluginId,
          taskId: null,
          status
        });
        if (status === 'success') {
          await invalidateModelProviderQueries();
        }
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

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return uploadSettingsPluginPackage(file, csrfToken);
    },
    onSuccess: async (result) => {
      setUploadValidationMessage(null);
      setUploadResultSummary({
        displayName: result.installation.display_name,
        version: result.installation.plugin_version,
        trustLabel: formatTrustLabel(result.installation.trust_level),
        availabilityLabel: formatPluginAvailabilityStatus(
          result.installation.availability_status
        ).label
      });
      await invalidateModelProviderQueries();
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
        !isTaskSucceeded(resolvedTask.status)
      ) {
        throw new Error(resolvedTask.status_message ?? '版本切换失败');
      }

      return resolvedTask;
    },
    onSuccess: async (task, variables) => {
      const detail = task.detail_json ?? {};

      setRecentVersionSwitchNotice({
        providerCode: variables.providerCode,
        targetVersion:
          typeof detail.target_version === 'string'
            ? detail.target_version
            : null,
        migratedInstanceCount:
          typeof detail.migrated_instance_count === 'number'
            ? detail.migrated_instance_count
            : null
      });
      await invalidateModelProviderQueries();
    }
  });

  return {
    createMutation,
    updateMutation,
    updateInstanceInclusionMutation,
    updateMainInstanceSettingsMutation,
    previewMutation,
    validateMutation,
    refreshMutation,
    revealSecretMutation,
    deleteMutation,
    familyDeleteMutation,
    officialInstallMutation,
    uploadMutation,
    versionMutation
  };
}
