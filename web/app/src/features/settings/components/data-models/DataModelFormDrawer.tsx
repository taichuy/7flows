import { useEffect } from 'react';

import { Button, Drawer, Form, Input, Select } from 'antd';

import type {
  CreateSettingsDataModelInput,
  SettingsDataModel,
  SettingsDataSourceInstance,
  UpdateSettingsDataModelInput
} from '../../api/data-models';
import {
  DataModelHelpTooltip,
  dataModelStatusHelp
} from './DataModelHelpTooltip';

const dataModelStatusOptions = ['draft', 'published', 'disabled', 'broken'].map(
  (value) => ({ label: value, value })
);

interface DataModelFormValues {
  code: string;
  title: string;
  status: SettingsDataModel['status'];
  data_source_instance_id: string;
  external_table_id: string;
}

export function DataModelFormDrawer({
  open,
  mode,
  model,
  source,
  saving,
  onClose,
  onCreate,
  onUpdate
}: {
  open: boolean;
  mode: 'create' | 'edit';
  model: SettingsDataModel | null;
  source: SettingsDataSourceInstance | null;
  saving: boolean;
  onClose: () => void;
  onCreate: (input: CreateSettingsDataModelInput) => void;
  onUpdate: (
    model: SettingsDataModel,
    input: UpdateSettingsDataModelInput
  ) => void;
}) {
  const [form] = Form.useForm<DataModelFormValues>();
  const isExternalModel =
    mode === 'edit'
      ? model?.source_kind === 'external_source'
      : source?.source_kind === 'external_source';

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === 'edit' && model) {
      form.setFieldsValue({
        code: model.code,
        title: model.title,
        status: model.status,
        data_source_instance_id: model.data_source_instance_id ?? 'main_source',
        external_table_id: model.external_table_id ?? ''
      });
      return;
    }

    form.setFieldsValue({
      code: '',
      title: '',
      status: source?.default_data_model_status ?? 'published',
      data_source_instance_id: source?.id ?? 'main_source',
      external_table_id: ''
    });
  }, [form, mode, model, open, source]);

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (mode === 'edit' && model) {
      onUpdate(model, {
        title: values.title,
        status: values.status,
        external_table_id: isExternalModel ? values.external_table_id : null
      });
      onClose();
      return;
    }

    onCreate({
      scope_kind: 'workspace',
      code: values.code,
      title: values.title,
      status: values.status,
      data_source_instance_id:
        source?.source_kind === 'external_source' ? source.id : null,
      external_resource_key: isExternalModel ? values.external_table_id : null,
      external_table_id: isExternalModel ? values.external_table_id : null
    });
    onClose();
  };

  return (
    <Drawer
      title={mode === 'create' ? '新建 Data Model' : '编辑 Data Model'}
      open={open}
      width={520}
      onClose={onClose}
      extra={
        <Button
          type="primary"
          aria-label={mode === 'create' ? '创建' : '保存'}
          loading={saving}
          onClick={handleSubmit}
        >
          {mode === 'create' ? '创建' : '保存'}
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          status: source?.default_data_model_status ?? 'published',
          data_source_instance_id: source?.id ?? 'main_source'
        }}
      >
        <Form.Item
          name="code"
          label="Code"
          rules={[{ required: true, message: '请输入 Data Model Code' }]}
        >
          <Input disabled={mode === 'edit'} />
        </Form.Item>
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: '请输入标题' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="status"
          label="状态"
          rules={[{ required: true, message: '请选择状态' }]}
        >
          <div className="data-model-panel__control-with-help">
            <Select options={dataModelStatusOptions} />
            <DataModelHelpTooltip label="状态" title={dataModelStatusHelp} />
          </div>
        </Form.Item>
        <Form.Item name="data_source_instance_id" label="数据源">
          <Input disabled />
        </Form.Item>
        {isExternalModel ? (
          <Form.Item
            name="external_table_id"
            label="表 ID"
            rules={[{ required: true, message: '请输入表 ID' }]}
          >
            <Input />
          </Form.Item>
        ) : null}
      </Form>
    </Drawer>
  );
}
