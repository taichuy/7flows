import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Table, Typography, message } from 'antd';

import { applicationDetailQueryKey } from '../../api/applications';
import {
  applicationApiKeysQueryKey,
  createApplicationApiKey,
  fetchApplicationApiKeys,
  revokeApplicationApiKey,
  type ApplicationApiKey,
  type CreatedApplicationApiKey
} from '../../api/public-api';

export function ApplicationApiKeysPanel({
  applicationId,
  csrfToken,
  onCreatedToken
}: {
  applicationId: string;
  csrfToken: string;
  onCreatedToken: (token: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApplicationApiKey | null>(null);
  const [form] = Form.useForm<{ name: string }>();
  const keysQuery = useQuery({
    queryKey: applicationApiKeysQueryKey(applicationId),
    queryFn: () => fetchApplicationApiKeys(applicationId)
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: applicationApiKeysQueryKey(applicationId)
    });
    void queryClient.invalidateQueries({
      queryKey: applicationDetailQueryKey(applicationId)
    });
  };
  const createMutation = useMutation({
    mutationFn: (name: string) => createApplicationApiKey(applicationId, name, csrfToken),
    onSuccess: (key) => {
      setCreatedKey(key);
      onCreatedToken(key.token);
      setCreateOpen(false);
      form.resetFields();
      invalidate();
    }
  });
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApplicationApiKey(applicationId, keyId, csrfToken),
    onSuccess: () => {
      message.success('API Key 已撤销');
      invalidate();
    }
  });

  return (
    <section className="application-api-panel">
      <div className="application-api-panel__header">
        <div>
          <Typography.Title level={4}>API Keys</Typography.Title>
          <Typography.Text type="secondary">完整 token 只在创建后显示一次。</Typography.Text>
        </div>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          创建 Key
        </Button>
      </div>
      <Table<ApplicationApiKey>
        rowKey="id"
        loading={keysQuery.isLoading}
        dataSource={keysQuery.data ?? []}
        pagination={false}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '前缀', dataIndex: 'token_prefix' },
          { title: '创建时间', dataIndex: 'created_at' },
          {
            title: '操作',
            key: 'actions',
            render: (_, record) => (
              <Button
                danger
                size="small"
                loading={revokeMutation.isPending}
                onClick={() => revokeMutation.mutate(record.id)}
              >
                撤销
              </Button>
            )
          }
        ]}
      />
      <Modal
        title="创建 API Key"
        open={createOpen}
        destroyOnHidden
        okText="创建"
        confirmLoading={createMutation.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values.name)}
        >
          <Form.Item
            name="name"
            label="Key 名称"
            rules={[{ required: true, message: '请输入 Key 名称' }]}
          >
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="保存这次创建的 API Key"
        open={Boolean(createdKey)}
        destroyOnHidden
        okText="关闭"
        cancelButtonProps={{ style: { display: 'none' } }}
        onOk={() => setCreatedKey(null)}
        onCancel={() => setCreatedKey(null)}
      >
        <Space direction="vertical" className="application-api-token-modal">
          <Typography.Text type="secondary">
            关闭后页面不再显示完整 token。
          </Typography.Text>
          <Typography.Text code copyable>
            {createdKey?.token}
          </Typography.Text>
        </Space>
      </Modal>
    </section>
  );
}
