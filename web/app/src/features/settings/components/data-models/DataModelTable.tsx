import { useState } from 'react';

import { Button, Flex, Grid, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

import type {
  CreateSettingsDataModelInput,
  SettingsDataModel,
  SettingsDataSourceInstance,
  UpdateSettingsDataModelInput
} from '../../api/data-models';
import { DataModelFormDrawer } from './DataModelFormDrawer';

const builtinMainSourceModelCodes = new Set(['attachments', 'users', 'roles']);

function isBuiltinMainSourceModel(model: SettingsDataModel) {
  return (
    model.source_kind === 'main_source' &&
    builtinMainSourceModelCodes.has(model.code)
  );
}

export function DataModelTable({
  models,
  selectedSource,
  selectedModelId,
  loading,
  saving,
  canManage,
  onSelectModel,
  onEditModel,
  onDeleteModel,
  onCreateModel,
  onUpdateModel
}: {
  models: SettingsDataModel[];
  selectedSource: SettingsDataSourceInstance | null;
  selectedModelId: string | null;
  loading: boolean;
  saving: boolean;
  canManage: boolean;
  onSelectModel: (model: SettingsDataModel) => void;
  onEditModel: (model: SettingsDataModel) => void;
  onDeleteModel: (model: SettingsDataModel) => void;
  onCreateModel: (input: CreateSettingsDataModelInput) => void;
  onUpdateModel: (
    model: SettingsDataModel,
    input: UpdateSettingsDataModelInput
  ) => void;
}) {
  const screens = Grid.useBreakpoint();
  const useMobileList = Boolean(screens.xs && !screens.md);
  const [drawerState, setDrawerState] = useState<
    | { open: false; mode: 'create'; model: null }
    | { open: true; mode: 'create'; model: null }
  >({ open: false, mode: 'create', model: null });
  const [deleteTarget, setDeleteTarget] = useState<SettingsDataModel | null>(
    null
  );

  const columns: ColumnsType<SettingsDataModel> = [
    {
      title: 'Data Model',
      dataIndex: 'title',
      key: 'title',
      width: 220,
      render: (_, model) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{model.title}</Typography.Text>
          <Typography.Text type="secondary">{model.code}</Typography.Text>
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (value: string) => <Tag>状态 {value}</Tag>
    },
    {
      title: 'API',
      dataIndex: 'api_exposure_status',
      key: 'api_exposure_status',
      width: 240,
      render: (value: string) => <Tag>API {value}</Tag>
    },
    {
      title: '表 ID',
      dataIndex: 'external_table_id',
      key: 'external_table_id',
      width: 180,
      render: (_, model) =>
        model.source_kind === 'external_source' ? (
          <Typography.Text type="secondary">
            {model.external_table_id ?? '-'}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        )
    },
    {
      title: '字段',
      key: 'fields',
      width: 96,
      render: (_, model) => model.fields.length
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, model) => {
        const canDeleteModel = !isBuiltinMainSourceModel(model);

        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              disabled={!canManage}
              onClick={(event) => {
                event.stopPropagation();
                onEditModel(model);
              }}
            >
              编辑
            </Button>
            {canDeleteModel ? (
              <Button
                danger
                type="link"
                size="small"
                aria-label={`删除数据表 ${model.title}`}
                disabled={!canManage}
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget(model);
                }}
              >
                删除
              </Button>
            ) : null}
          </Space>
        );
      }
    }
  ];

  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
        <Typography.Title level={4} className="data-model-panel__section-title">
          数据表
        </Typography.Title>
        <Button
          type="primary"
          disabled={!canManage || !selectedSource}
          onClick={() =>
            setDrawerState({ open: true, mode: 'create', model: null })
          }
        >
          新建数据表
        </Button>
      </Flex>
      {!useMobileList ? (
        <Table
          rowKey="id"
          size="middle"
          loading={loading}
          columns={columns}
          dataSource={models}
          pagination={false}
          scroll={{ x: 840 }}
          rowSelection={{
            type: 'radio',
            selectedRowKeys: selectedModelId ? [selectedModelId] : [],
            onChange: ([modelId]) => {
              const model = models.find((item) => item.id === modelId);
              if (model) {
                onSelectModel(model);
              }
            }
          }}
          onRow={(model) => ({
            onClick: () => onSelectModel(model)
          })}
        />
      ) : null}
      {useMobileList ? (
        <div className="data-model-panel__mobile-list">
          {models.map((model) => (
            <div
              key={model.id}
              role="button"
              tabIndex={0}
              className="data-model-panel__mobile-item"
              onClick={() => onSelectModel(model)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  onSelectModel(model);
                }
              }}
            >
              <span>
                <Typography.Text strong>{model.title}</Typography.Text>
                <Typography.Text type="secondary">{model.code}</Typography.Text>
                {model.source_kind === 'external_source' ? (
                  <Typography.Text type="secondary">
                    {model.external_table_id ?? '-'}
                  </Typography.Text>
                ) : null}
              </span>
              <span>
                <Tag>状态 {model.status}</Tag>
                <Tag>字段 {model.fields.length}</Tag>
              </span>
              <span className="data-model-panel__mobile-actions">
                <Typography.Text type="secondary">
                  API {model.api_exposure_status}
                </Typography.Text>
                {canManage ? (
                  <Space size={4}>
                    <Button
                      type="link"
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditModel(model);
                      }}
                    >
                      编辑
                    </Button>
                    {!isBuiltinMainSourceModel(model) ? (
                      <Button
                        danger
                        type="link"
                        size="small"
                        aria-label={`删除数据表 ${model.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(model);
                        }}
                      >
                        删除
                      </Button>
                    ) : null}
                  </Space>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <DataModelFormDrawer
        open={drawerState.open}
        mode={drawerState.mode}
        model={drawerState.model}
        source={selectedSource}
        saving={saving}
        onClose={() =>
          setDrawerState({ open: false, mode: 'create', model: null })
        }
        onCreate={onCreateModel}
        onUpdate={onUpdateModel}
      />
      <Modal
        title="确认删除数据表"
        open={Boolean(deleteTarget)}
        okText="确认"
        okType="danger"
        cancelText="取消"
        okButtonProps={{ 'aria-label': '确认' }}
        onCancel={() => setDeleteTarget(null)}
        onOk={() => {
          if (deleteTarget) {
            onDeleteModel(deleteTarget);
          }
          setDeleteTarget(null);
        }}
      >
        {deleteTarget
          ? `确定删除数据表 "${deleteTarget.title}" (${deleteTarget.code}) 吗？此操作会同步删除运行表和字段配置。`
          : null}
      </Modal>
    </Flex>
  );
}
