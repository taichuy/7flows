import { useEffect } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';

import {
  applicationApiMappingQueryKey,
  applicationApiPublicationQueryKey,
  fetchApplicationApiMapping,
  saveApplicationApiMapping,
  type ApplicationApiMapping,
  type ApplicationApiPublication
} from '../../api/public-api';

const selectorPattern = /^[A-Za-z0-9_.-]+$/;

export function ApplicationApiMappingPanel({
  applicationId,
  csrfToken,
  publication
}: {
  applicationId: string;
  csrfToken: string;
  publication: ApplicationApiPublication | null;
}) {
  const [form] = Form.useForm<ApplicationApiMapping>();
  const queryClient = useQueryClient();
  const mappingQuery = useQuery({
    queryKey: applicationApiMappingQueryKey(applicationId),
    queryFn: () => fetchApplicationApiMapping(applicationId)
  });
  const saveMutation = useMutation({
    mutationFn: (mapping: ApplicationApiMapping) =>
      saveApplicationApiMapping(applicationId, mapping, csrfToken),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: applicationApiMappingQueryKey(applicationId)
      });
      void queryClient.invalidateQueries({
        queryKey: applicationApiPublicationQueryKey(applicationId)
      });
    }
  });

  useEffect(() => {
    if (mappingQuery.data) {
      form.setFieldsValue(mappingQuery.data);
    }
  }, [form, mappingQuery.data]);

  const currentMappingText = mappingQuery.data
    ? JSON.stringify(mappingQuery.data)
    : '';
  const publishedMappingText = publication
    ? JSON.stringify(publication.mapping_snapshot)
    : '';

  return (
    <section className="application-api-panel">
      <Space direction="vertical" size={12} className="application-api-panel__stack">
        <Typography.Title level={4}>Mapping</Typography.Title>
        <Typography.Text type="secondary">
          `model_target` 留空时，model 只保留在请求 metadata，不注入节点输入。
        </Typography.Text>
        {publication && currentMappingText !== publishedMappingText ? (
          <Alert
            type="warning"
            showIcon
            message="当前保存的 mapping 与 active publication snapshot 不一致"
          />
        ) : null}
        <Form<ApplicationApiMapping>
          form={form}
          layout="vertical"
          onFinish={(values) => saveMutation.mutate(normalizeMapping(values))}
        >
          <div className="application-api-mapping-grid">
            <SelectorItem name={['input', 'query_target']} label="query_target" required />
            <SelectorItem
              name={['input', 'model_target']}
              label="model_target"
              help="pass-through target；留空不注入节点输入"
            />
            <SelectorItem name={['input', 'inputs_target']} label="inputs_target" />
            <SelectorItem name={['input', 'history_target']} label="history_target" />
            <SelectorItem name={['input', 'attachments_target']} label="attachments_target" />
            <SelectorItem name={['output', 'answer_selector']} label="answer_selector" />
            <SelectorItem name={['output', 'usage_selector']} label="usage_selector" />
            <SelectorItem name={['output', 'files_selector']} label="files_selector" />
            <SelectorItem name={['output', 'error_selector']} label="error_selector" />
          </div>
          <Button type="primary" htmlType="submit" loading={saveMutation.isPending}>
            保存 Mapping
          </Button>
        </Form>
      </Space>
    </section>
  );
}

function SelectorItem({
  name,
  label,
  help,
  required
}: {
  name: (string | number)[];
  label: string;
  help?: string;
  required?: boolean;
}) {
  return (
    <Form.Item
      name={name}
      label={label}
      help={help}
      rules={[
        ...(required ? [{ required: true, message: `${label} 不能为空` }] : []),
        {
          validator: (_, value: string | null | undefined) => {
            if (!value) {
              return Promise.resolve();
            }
            return selectorPattern.test(value)
              ? Promise.resolve()
              : Promise.reject(new Error('只能包含字母、数字、下划线、点和连字符'));
          }
        }
      ]}
    >
      <Input allowClear />
    </Form.Item>
  );
}

function normalizeMapping(mapping: ApplicationApiMapping): ApplicationApiMapping {
  const emptyToNull = (value: string | null | undefined) => value?.trim() || null;

  return {
    input: {
      query_target: mapping.input.query_target.trim(),
      model_target: emptyToNull(mapping.input.model_target),
      inputs_target: emptyToNull(mapping.input.inputs_target),
      history_target: emptyToNull(mapping.input.history_target),
      attachments_target: emptyToNull(mapping.input.attachments_target)
    },
    output: {
      answer_selector: emptyToNull(mapping.output.answer_selector),
      usage_selector: emptyToNull(mapping.output.usage_selector),
      files_selector: emptyToNull(mapping.output.files_selector),
      error_selector: emptyToNull(mapping.output.error_selector)
    }
  };
}
