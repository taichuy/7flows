import { useState } from 'react';

import { Button, Descriptions, Flex, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type {
  CreateSettingsDataModelFieldInput,
  SettingsDataModel,
  SettingsDataModelAdvisorFinding,
  SettingsDataModelField,
  SettingsDataModelScopeGrant,
  SettingsRuntimeRecordPreview,
  UpdateSettingsDataModelApiExposureInput,
  UpdateSettingsDataModelFieldInput,
  UpdateSettingsDataModelInput
} from '../../api/data-models';
import { DataModelAdvisorTab } from './DataModelAdvisorTab';
import { DataModelApiTab } from './DataModelApiTab';
import { DataModelFieldDrawer } from './DataModelFieldDrawer';
import { DataModelFormDrawer } from './DataModelFormDrawer';
import {
  DataModelHelpTooltip,
  dataModelStatusHelp
} from './DataModelHelpTooltip';
import { DataModelPermissionsTab } from './DataModelPermissionsTab';
import { DataModelRecordPreview } from './DataModelRecordPreview';

const dataModelStatusOptions = ['draft', 'published', 'disabled', 'broken'].map(
  (value) => ({ label: value, value })
);

export function DataModelDetail({
  model,
  allModels,
  canManage,
  grants,
  grantsLoading,
  grantsSaving,
  advisorFindings,
  advisorLoading,
  recordPreview,
  recordPreviewLoading,
  modelSaving,
  fieldSaving,
  onUpdateModelStatus,
  onUpdateModel,
  onCreateField,
  onUpdateField,
  onDeleteField,
  onUpdateApiExposure,
  onSaveGrant
}: {
  model: SettingsDataModel;
  allModels: SettingsDataModel[];
  canManage: boolean;
  grants: SettingsDataModelScopeGrant[];
  grantsLoading: boolean;
  grantsSaving: boolean;
  advisorFindings: SettingsDataModelAdvisorFinding[];
  advisorLoading: boolean;
  recordPreview: SettingsRuntimeRecordPreview | undefined;
  recordPreviewLoading: boolean;
  modelSaving: boolean;
  fieldSaving: boolean;
  onUpdateModelStatus: (status: SettingsDataModel['status']) => void;
  onUpdateModel: (input: UpdateSettingsDataModelInput) => void;
  onCreateField: (input: CreateSettingsDataModelFieldInput) => void;
  onUpdateField: (
    field: SettingsDataModelField,
    input: UpdateSettingsDataModelFieldInput
  ) => void;
  onDeleteField: (field: SettingsDataModelField) => void;
  onUpdateApiExposure: (input: UpdateSettingsDataModelApiExposureInput) => void;
  onSaveGrant: Parameters<typeof DataModelPermissionsTab>[0]['onSave'];
}) {
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false);
  const [fieldDrawerState, setFieldDrawerState] = useState<
    | { open: false; mode: 'create'; field: null }
    | { open: true; mode: 'create'; field: null }
    | { open: true; mode: 'edit'; field: SettingsDataModelField }
  >({ open: false, mode: 'create', field: null });

  const fieldColumns: ColumnsType<SettingsDataModelField> = [
    {
      title: '字段',
      dataIndex: 'title',
      key: 'title',
      render: (_, field) => (
        <button
          type="button"
          className="data-model-panel__link-button"
          disabled={field.is_system === true || field.is_writable === false}
          onClick={() =>
            setFieldDrawerState({ open: true, mode: 'edit', field })
          }
        >
          <Typography.Text strong>{field.title}</Typography.Text>
          <Typography.Text type="secondary">{field.code}</Typography.Text>
        </button>
      )
    },
    {
      title: '类型',
      dataIndex: 'field_kind',
      key: 'field_kind',
      render: (value: string) => <Tag>{value}</Tag>
    },
    {
      title: '必填',
      dataIndex: 'is_required',
      key: 'is_required',
      render: (value: boolean) => (value ? '是' : '否')
    },
    {
      title: '唯一',
      dataIndex: 'is_unique',
      key: 'is_unique',
      render: (value: boolean) => (value ? '是' : '否')
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_, field) => (
        <Button
          type="link"
          size="small"
          disabled={
            !canManage || field.is_system === true || field.is_writable === false
          }
          onClick={() =>
            setFieldDrawerState({ open: true, mode: 'edit', field })
          }
        >
          编辑
        </Button>
      )
    }
  ];

  const relationFields = model.fields.filter(
    (field) => field.relation_target_model_id
  );

  return (
    <section className="data-model-panel__detail" aria-label="Data Model 详情">
      <div
        className="data-model-panel__detail-summary"
        data-testid="data-model-detail-summary"
      >
        <div className="data-model-panel__identity">
          <Typography.Title level={4}>{model.title}</Typography.Title>
          <Typography.Text type="secondary">{model.code}</Typography.Text>
        </div>
        <Descriptions
          className="data-model-panel__metadata"
          size="small"
          column={{ xs: 1, sm: 2, lg: 4 }}
          items={[
            { key: 'source', label: '来源', children: model.source_kind },
            {
              key: 'runtime',
              label: 'Runtime',
              children: model.runtime_availability
            },
            ...(model.source_kind === 'external_source'
              ? [
                  {
                    key: 'external_table_id',
                    label: '表 ID',
                    children: model.external_table_id ?? '-'
                  }
                ]
              : []),
            {
              key: 'table',
              label: '物理表',
              children: model.physical_table_name
            }
          ]}
        />
      </div>

      <div
        className="data-model-panel__detail-actions"
        data-testid="data-model-detail-actions"
      >
        <div className="data-model-panel__status-control">
          <label htmlFor="data-model-status-select">Data Model 状态</label>
          <div className="data-model-panel__control-with-help">
            <select
              id="data-model-status-select"
              className="data-model-panel__native-select"
              value={model.status}
              disabled={!canManage || modelSaving}
              aria-label="Data Model 状态"
              onChange={(event) =>
                onUpdateModelStatus(
                  event.target.value as SettingsDataModel['status']
                )
              }
            >
              {dataModelStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <DataModelHelpTooltip
              label="Data Model 状态"
              title={dataModelStatusHelp}
            />
          </div>
        </div>
        <Button disabled={!canManage} onClick={() => setModelDrawerOpen(true)}>
          编辑
        </Button>
      </div>

      <Tabs
        items={[
          {
            key: 'fields',
            label: '字段',
            children: (
              <Flex vertical gap={12}>
                <Flex justify="flex-end">
                  <Button
                    type="primary"
                    disabled={!canManage}
                    onClick={() =>
                      setFieldDrawerState({
                        open: true,
                        mode: 'create',
                        field: null
                      })
                    }
                  >
                    新增字段
                  </Button>
                </Flex>
                <Table
                  rowKey="id"
                  size="small"
                  columns={fieldColumns}
                  dataSource={model.fields}
                  pagination={false}
                />
                <DataModelFieldDrawer
                  open={fieldDrawerState.open}
                  mode={fieldDrawerState.mode}
                  field={fieldDrawerState.field}
                  modelOptions={allModels}
                  saving={fieldSaving}
                  canManage={canManage}
                  onClose={() =>
                    setFieldDrawerState({
                      open: false,
                      mode: 'create',
                      field: null
                    })
                  }
                  onCreate={onCreateField}
                  onUpdate={onUpdateField}
                  onDelete={onDeleteField}
                />
              </Flex>
            )
          },
          {
            key: 'relations',
            label: '关系',
            children: (
              <Table
                rowKey="id"
                size="small"
                columns={[
                  { title: '字段', dataIndex: 'title', key: 'title' },
                  {
                    title: '目标模型',
                    dataIndex: 'relation_target_model_id',
                    key: 'relation_target_model_id'
                  }
                ]}
                dataSource={relationFields}
                pagination={false}
              />
            )
          },
          {
            key: 'permissions',
            label: '权限',
            children: (
              <DataModelPermissionsTab
                grants={grants}
                loading={grantsLoading}
                saving={grantsSaving}
                onSave={onSaveGrant}
              />
            )
          },
          {
            key: 'api',
            label: 'API',
            children: (
              <DataModelApiTab
                model={model}
                canManage={canManage}
                saving={modelSaving}
                onUpdateApiExposure={onUpdateApiExposure}
              />
            )
          },
          {
            key: 'records',
            label: '记录预览',
            children: (
              <DataModelRecordPreview
                preview={recordPreview}
                loading={recordPreviewLoading}
              />
            )
          },
          {
            key: 'advisor',
            label: 'Advisor',
            children: (
              <DataModelAdvisorTab
                findings={advisorFindings}
                loading={advisorLoading}
              />
            )
          }
        ]}
      />
      <DataModelFormDrawer
        open={modelDrawerOpen}
        mode="edit"
        model={model}
        source={null}
        saving={modelSaving}
        onClose={() => setModelDrawerOpen(false)}
        onCreate={() => undefined}
        onUpdate={(_model, input) => {
          onUpdateModel(input);
          setModelDrawerOpen(false);
        }}
      />
    </section>
  );
}
