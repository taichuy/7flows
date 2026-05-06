import { useEffect, useMemo, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Breadcrumb,
  Button,
  Descriptions,
  Drawer,
  Flex,
  Form,
  Select,
  Space,
  Tag,
  Typography,
  message
} from 'antd';

import { useAuthStore } from '../../../../state/auth-store';
import {
  createSettingsDataModel,
  createSettingsDataModelField,
  deleteSettingsDataModelField,
  fetchSettingsDataModelAdvisorFindings,
  fetchSettingsDataModelRecordPreview,
  fetchSettingsDataModelScopeGrants,
  fetchSettingsDataModels,
  fetchSettingsDataSourceInstances,
  settingsDataModelAdvisorFindingsQueryKey,
  settingsDataModelRecordPreviewQueryKey,
  settingsDataModelsQueryKey,
  settingsDataModelScopeGrantsQueryKey,
  settingsDataSourcesQueryKey,
  updateSettingsDataModel,
  updateSettingsDataModelApiExposure,
  updateSettingsDataModelField,
  updateSettingsDataModelScopeGrant,
  updateSettingsDataSourceDefaults,
  type CreateSettingsDataModelFieldInput,
  type CreateSettingsDataModelInput,
  type SettingsDataModel,
  type SettingsDataModelField,
  type SettingsDataModelScopeGrant,
  type SettingsDataSourceInstance,
  type UpdateSettingsDataModelApiExposureInput,
  type UpdateSettingsDataModelFieldInput,
  type UpdateSettingsDataModelInput,
  type UpdateSettingsDataModelScopeGrantInput,
  type UpdateSettingsDataSourceDefaultsInput
} from '../../api/data-models';
import { DataModelDetail } from '../../components/data-models/DataModelDetail';
import {
  DataModelHelpTooltip,
  dataModelStatusHelp,
  defaultApiExposureStatusHelp
} from '../../components/data-models/DataModelHelpTooltip';
import { DataModelTable } from '../../components/data-models/DataModelTable';
import { DataSourcePanel } from '../../components/data-models/DataSourcePanel';
import '../../components/data-models/data-model-panel.css';
import { SettingsSectionSurface } from '../../components/SettingsSectionSurface';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

const emptySources: SettingsDataSourceInstance[] = [];
const emptyModels: SettingsDataModel[] = [];

type DefaultDataModelStatus =
  UpdateSettingsDataSourceDefaultsInput['default_data_model_status'];
type DefaultApiExposureStatus =
  UpdateSettingsDataSourceDefaultsInput['default_api_exposure_status'];

const dataModelStatusOptions = (
  [
    'draft',
    'published',
    'disabled',
    'broken'
  ] satisfies DefaultDataModelStatus[]
).map((value) => ({ label: `默认 ${value}`, value }));

const defaultApiExposureStatuses = [
  'draft',
  'published_not_exposed',
  'api_exposed_no_permission'
] satisfies DefaultApiExposureStatus[];

const apiExposureOptions = defaultApiExposureStatuses.map((value) => ({
  label: `默认 ${value}`,
  value
})) satisfies Array<{
  label: string;
  value: DefaultApiExposureStatus;
}>;

function toDefaultApiExposureStatus(
  status: SettingsDataSourceInstance['default_api_exposure_status']
): DefaultApiExposureStatus {
  return status === 'api_exposed_ready' ? 'published_not_exposed' : status;
}

function readSourceIdFromLocation() {
  if (typeof window === 'undefined') {
    return null;
  }

  return new URLSearchParams(window.location.search).get('source');
}

function writeSourceIdToLocation(sourceId: string | null) {
  const url = new URL(window.location.href);
  if (sourceId) {
    url.searchParams.set('source', sourceId);
  } else {
    url.searchParams.delete('source');
  }

  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export function SettingsDataModelsSection({
  canManage
}: {
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    readSourceIdFromLocation
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);

  const sourcesQuery = useQuery({
    queryKey: settingsDataSourcesQueryKey,
    queryFn: fetchSettingsDataSourceInstances
  });

  const sources = sourcesQuery.data ?? emptySources;
  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources]
  );
  const effectiveSourceId = selectedSource?.id ?? null;

  const modelsQuery = useQuery({
    queryKey: settingsDataModelsQueryKey(effectiveSourceId ?? ''),
    queryFn: () => fetchSettingsDataModels(effectiveSourceId ?? ''),
    enabled: Boolean(effectiveSourceId)
  });

  const models = modelsQuery.data ?? emptyModels;
  const editingModel = useMemo(
    () => models.find((model) => model.id === editingModelId) ?? null,
    [editingModelId, models]
  );
  const previousEffectiveSourceIdRef = useRef(effectiveSourceId);

  useEffect(() => {
    const previousEffectiveSourceId = previousEffectiveSourceIdRef.current;
    previousEffectiveSourceIdRef.current = effectiveSourceId;

    if (
      previousEffectiveSourceId !== null &&
      previousEffectiveSourceId !== effectiveSourceId
    ) {
      setSelectedModelId(null);
      setEditingModelId(null);
    }
  }, [effectiveSourceId]);

  useEffect(() => {
    const handlePopState = () => {
      setSelectedSourceId(readSourceIdFromLocation());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (
      selectedSourceId &&
      sources.length > 0 &&
      !sources.some((source) => source.id === selectedSourceId)
    ) {
      setSelectedSourceId(null);
      writeSourceIdToLocation(null);
    }
  }, [selectedSourceId, sources]);

  const openSourceManager = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    writeSourceIdToLocation(sourceId);
  };

  const closeSourceManager = () => {
    setSelectedSourceId(null);
    setSelectedModelId(null);
    setEditingModelId(null);
    writeSourceIdToLocation(null);
  };

  const scopeGrantsQuery = useQuery({
    queryKey: settingsDataModelScopeGrantsQueryKey(editingModel?.id ?? ''),
    queryFn: () => fetchSettingsDataModelScopeGrants(editingModel?.id ?? ''),
    enabled: Boolean(editingModel)
  });

  const advisorQuery = useQuery({
    queryKey: settingsDataModelAdvisorFindingsQueryKey(editingModel?.id ?? ''),
    queryFn: () =>
      fetchSettingsDataModelAdvisorFindings(editingModel?.id ?? ''),
    enabled: Boolean(editingModel)
  });

  const recordPreviewQuery = useQuery({
    queryKey: settingsDataModelRecordPreviewQueryKey(editingModel?.code ?? ''),
    queryFn: () =>
      fetchSettingsDataModelRecordPreview(editingModel?.code ?? ''),
    enabled: Boolean(editingModel)
  });

  const updateDefaultsMutation = useMutation({
    mutationFn: ({
      source,
      patch
    }: {
      source: SettingsDataSourceInstance;
      patch: Pick<
        UpdateSettingsDataSourceDefaultsInput,
        'default_data_model_status' | 'default_api_exposure_status'
      >;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return updateSettingsDataSourceDefaults(source.id, patch, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('默认状态已保存');
      await queryClient.invalidateQueries({
        queryKey: settingsDataSourcesQueryKey
      });
    }
  });

  const updateModelMutation = useMutation({
    mutationFn: ({
      model,
      input
    }: {
      model: SettingsDataModel;
      input: UpdateSettingsDataModelInput;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return updateSettingsDataModel(model.id, input, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('Data Model 已保存');
      if (effectiveSourceId) {
        await queryClient.invalidateQueries({
          queryKey: settingsDataModelsQueryKey(effectiveSourceId)
        });
      }
    }
  });

  const createModelMutation = useMutation({
    mutationFn: (input: CreateSettingsDataModelInput) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return createSettingsDataModel(input, csrfToken);
    },
    onSuccess: async (model) => {
      messageApi.success('Data Model 已创建');
      setSelectedModelId(model.id);
      if (effectiveSourceId) {
        await queryClient.invalidateQueries({
          queryKey: settingsDataModelsQueryKey(effectiveSourceId)
        });
      }
    }
  });

  const updateApiExposureMutation = useMutation({
    mutationFn: ({
      model,
      input
    }: {
      model: SettingsDataModel;
      input: UpdateSettingsDataModelApiExposureInput;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return updateSettingsDataModelApiExposure(model.id, input, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('API 暴露请求已保存');
      if (effectiveSourceId) {
        await queryClient.invalidateQueries({
          queryKey: settingsDataModelsQueryKey(effectiveSourceId)
        });
      }
    }
  });

  const createFieldMutation = useMutation({
    mutationFn: ({
      model,
      input
    }: {
      model: SettingsDataModel;
      input: CreateSettingsDataModelFieldInput;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return createSettingsDataModelField(model.id, input, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('字段已创建');
      if (effectiveSourceId) {
        await queryClient.invalidateQueries({
          queryKey: settingsDataModelsQueryKey(effectiveSourceId)
        });
      }
    }
  });

  const updateFieldMutation = useMutation({
    mutationFn: ({
      model,
      field,
      input
    }: {
      model: SettingsDataModel;
      field: SettingsDataModelField;
      input: UpdateSettingsDataModelFieldInput;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return updateSettingsDataModelField(model.id, field.id, input, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('字段已保存');
      if (effectiveSourceId) {
        await queryClient.invalidateQueries({
          queryKey: settingsDataModelsQueryKey(effectiveSourceId)
        });
      }
    }
  });

  const deleteFieldMutation = useMutation({
    mutationFn: ({
      model,
      field
    }: {
      model: SettingsDataModel;
      field: SettingsDataModelField;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return deleteSettingsDataModelField(model.id, field.id, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('字段已删除');
      if (effectiveSourceId) {
        await queryClient.invalidateQueries({
          queryKey: settingsDataModelsQueryKey(effectiveSourceId)
        });
      }
    }
  });

  const saveGrantMutation = useMutation({
    mutationFn: ({
      grant,
      input
    }: {
      grant: SettingsDataModelScopeGrant;
      input: UpdateSettingsDataModelScopeGrantInput;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }
      return updateSettingsDataModelScopeGrant(
        grant.data_model_id,
        grant.id,
        input,
        csrfToken
      );
    },
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({
        queryKey: settingsDataModelScopeGrantsQueryKey(
          variables.grant.data_model_id
        )
      });
    }
  });

  const errorMessage =
    getErrorMessage(sourcesQuery.error) ??
    getErrorMessage(modelsQuery.error) ??
    getErrorMessage(scopeGrantsQuery.error) ??
    getErrorMessage(advisorQuery.error) ??
    getErrorMessage(recordPreviewQuery.error) ??
    getErrorMessage(updateDefaultsMutation.error) ??
    getErrorMessage(updateModelMutation.error) ??
    getErrorMessage(createModelMutation.error) ??
    getErrorMessage(updateApiExposureMutation.error) ??
    getErrorMessage(createFieldMutation.error) ??
    getErrorMessage(updateFieldMutation.error) ??
    getErrorMessage(deleteFieldMutation.error) ??
    getErrorMessage(saveGrantMutation.error);

  return (
    <SettingsSectionSurface
      title="数据源"
      description="管理内建主数据源和外部数据源的默认建模状态、API 暴露策略与 Data Model 访问面。"
      hideHeader={Boolean(selectedSource)}
      status={
        errorMessage ? (
          <Alert type="error" showIcon message={errorMessage} />
        ) : null
      }
    >
      {contextHolder}
      <div className="data-model-panel">
        {selectedSource ? (
          <Flex vertical gap={16} className="data-model-panel__models">
            <div className="data-model-panel__manager-head">
              <Breadcrumb
                items={[
                  {
                    title: (
                      <Button
                        type="link"
                        className="data-model-panel__breadcrumb-link"
                        onClick={closeSourceManager}
                      >
                        数据源管理
                      </Button>
                    )
                  },
                  { title: selectedSource.display_name }
                ]}
              />
              <Flex
                justify="space-between"
                align="flex-start"
                gap={16}
                wrap="wrap"
              >
                <Space direction="vertical" size={4}>
                  <Space size={8} wrap>
                    <Typography.Title
                      level={4}
                      className="data-model-panel__section-title"
                    >
                      {selectedSource.display_name}
                    </Typography.Title>
                    <Tag
                      color={
                        selectedSource.status === 'ready' ? 'green' : 'default'
                      }
                    >
                      {selectedSource.status}
                    </Tag>
                  </Space>
                  <Typography.Text type="secondary">
                    {selectedSource.source_code}
                  </Typography.Text>
                </Space>
                <Button onClick={closeSourceManager}>返回</Button>
              </Flex>

              <div className="data-model-panel__source-detail">
                <Descriptions
                  size="small"
                  column={{ xs: 1, sm: 2, lg: 3 }}
                  items={[
                    { key: 'id', label: 'ID', children: selectedSource.id },
                    {
                      key: 'source_kind',
                      label: '来源类型',
                      children: selectedSource.source_kind
                    },
                    {
                      key: 'catalog',
                      label: 'Catalog',
                      children: selectedSource.catalog_refresh_status ?? '-'
                    }
                  ]}
                />
                <Form layout="inline" className="data-model-panel__defaults">
                  <Form.Item
                    label="默认 Data Model 状态"
                    htmlFor="data-source-default-model-status"
                  >
                    <div className="data-model-panel__control-with-help">
                      <Select
                        id="data-source-default-model-status"
                        value={selectedSource.default_data_model_status}
                        options={dataModelStatusOptions}
                        disabled={
                          selectedSource.source_kind === 'main_source' ||
                          updateDefaultsMutation.isPending
                        }
                        onChange={(value) =>
                          updateDefaultsMutation.mutate({
                            source: selectedSource,
                            patch: {
                              default_data_model_status: value,
                              default_api_exposure_status:
                                toDefaultApiExposureStatus(
                                  selectedSource.default_api_exposure_status
                                )
                            }
                          })
                        }
                      />
                      <DataModelHelpTooltip
                        label="默认 Data Model 状态"
                        title={dataModelStatusHelp}
                      />
                    </div>
                  </Form.Item>
                  <Form.Item
                    label="默认 API 暴露状态"
                    htmlFor="data-source-default-api-status"
                  >
                    <div className="data-model-panel__control-with-help">
                      <Select
                        id="data-source-default-api-status"
                        value={toDefaultApiExposureStatus(
                          selectedSource.default_api_exposure_status
                        )}
                        options={apiExposureOptions}
                        disabled={
                          selectedSource.source_kind === 'main_source' ||
                          updateDefaultsMutation.isPending
                        }
                        onChange={(value: DefaultApiExposureStatus) =>
                          updateDefaultsMutation.mutate({
                            source: selectedSource,
                            patch: {
                              default_data_model_status:
                                selectedSource.default_data_model_status,
                              default_api_exposure_status: value
                            }
                          })
                        }
                      />
                      <DataModelHelpTooltip
                        label="默认 API 暴露状态"
                        title={defaultApiExposureStatusHelp}
                      />
                    </div>
                  </Form.Item>
                </Form>
              </div>
            </div>
            <DataModelTable
              models={models}
              selectedSource={selectedSource}
              selectedModelId={selectedModelId}
              loading={modelsQuery.isLoading}
              saving={
                createModelMutation.isPending || updateModelMutation.isPending
              }
              canManage={canManage}
              onSelectModel={(model) => setSelectedModelId(model.id)}
              onEditModel={(model) => {
                setSelectedModelId(model.id);
                setEditingModelId(model.id);
              }}
              onCreateModel={(input) => createModelMutation.mutate(input)}
              onUpdateModel={(model, input) =>
                updateModelMutation.mutate({ model, input })
              }
            />

            <Drawer
              title={
                editingModel ? `编辑 ${editingModel.title}` : '编辑 Data Model'
              }
              open={Boolean(editingModel)}
              width={980}
              destroyOnHidden
              onClose={() => setEditingModelId(null)}
            >
              {editingModel ? (
                <DataModelDetail
                  model={editingModel}
                  allModels={models}
                  canManage={canManage}
                  grants={scopeGrantsQuery.data ?? []}
                  grantsLoading={scopeGrantsQuery.isLoading}
                  grantsSaving={saveGrantMutation.isPending}
                  advisorFindings={advisorQuery.data ?? []}
                  advisorLoading={advisorQuery.isLoading}
                  recordPreview={recordPreviewQuery.data}
                  recordPreviewLoading={recordPreviewQuery.isLoading}
                  modelSaving={
                    updateModelMutation.isPending ||
                    updateApiExposureMutation.isPending
                  }
                  fieldSaving={
                    createFieldMutation.isPending ||
                    updateFieldMutation.isPending ||
                    deleteFieldMutation.isPending
                  }
                  onUpdateModelStatus={(status) =>
                    updateModelMutation.mutate({
                      model: editingModel,
                      input: { status }
                    })
                  }
                  onUpdateModel={(input) =>
                    updateModelMutation.mutate({ model: editingModel, input })
                  }
                  onCreateField={(input) =>
                    createFieldMutation.mutate({ model: editingModel, input })
                  }
                  onUpdateField={(field, input) =>
                    updateFieldMutation.mutate({
                      model: editingModel,
                      field,
                      input
                    })
                  }
                  onDeleteField={(field) =>
                    deleteFieldMutation.mutate({ model: editingModel, field })
                  }
                  onUpdateApiExposure={(input) =>
                    updateApiExposureMutation.mutate({
                      model: editingModel,
                      input
                    })
                  }
                  onSaveGrant={(grant, input) =>
                    saveGrantMutation.mutate({ grant, input })
                  }
                />
              ) : null}
            </Drawer>
          </Flex>
        ) : (
          <DataSourcePanel
            sources={sources}
            loading={sourcesQuery.isLoading}
            onOpenSource={openSourceManager}
          />
        )}
      </div>
    </SettingsSectionSurface>
  );
}
