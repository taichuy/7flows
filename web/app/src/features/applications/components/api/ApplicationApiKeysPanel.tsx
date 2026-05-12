import { useState } from 'react';

import { DeleteOutlined, KeyOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Form, Input, Modal, Space, Table, Tooltip, Typography } from 'antd';

import { copyTextToClipboard } from '../../../../shared/ui/clipboard/copy-text';
import { applicationDetailQueryKey } from '../../api/applications';
import {
  applicationApiKeysQueryKey,
  createApplicationApiKey,
  fetchApplicationApiKeys,
  revokeApplicationApiKey,
  type ApplicationApiKey,
  type CreatedApplicationApiKey
} from '../../api/public-api';

const SHANGHAI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = SHANGHAI_DATE_TIME_FORMATTER.formatToParts(date);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return [
    `${partByType.get('year')}-${partByType.get('month')}-${partByType.get('day')}`,
    `${partByType.get('hour')}:${partByType.get('minute')}:${partByType.get('second')}`
  ].join(' ');
}

export function ApplicationApiKeysPanel({
  applicationId,
  csrfToken,
  onCreatedToken,
  variant = 'panel'
}: {
  applicationId: string;
  csrfToken: string;
  onCreatedToken: (token: string | null) => void;
  variant?: 'panel' | 'embedded';
}) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApplicationApiKey | null>(null);
  const [form] = Form.useForm<{ name: string }>();
  const keysQuery = useQuery({
    queryKey: applicationApiKeysQueryKey(applicationId),
    queryFn: () => fetchApplicationApiKeys(applicationId)
  });
  const createMutation = useMutation({
    mutationFn: (name: string) => createApplicationApiKey(applicationId, name, csrfToken),
    onSuccess: (key) => {
      setCreatedKey(key);
      onCreatedToken(key.token);
      setCreateOpen(false);
      form.resetFields();
      void queryClient.invalidateQueries({
        queryKey: applicationApiKeysQueryKey(applicationId)
      });
      void queryClient.invalidateQueries({
        queryKey: applicationDetailQueryKey(applicationId)
      });
    }
  });
  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => revokeApplicationApiKey(applicationId, keyId, csrfToken),
    onSuccess: () => {
      message.success('API Key 已删除');
      void queryClient.invalidateQueries({
        queryKey: applicationApiKeysQueryKey(applicationId)
      });
      void queryClient.invalidateQueries({
        queryKey: applicationDetailQueryKey(applicationId)
      });
    }
  });

  const keys = keysQuery.data ?? [];
  const maskTokenPreview = (value: string) => {
    return `${value}****`;
  };
  const copyCreatedToken = () => {
    const token = createdKey?.token;
    if (!token) {
      return;
    }
    copyTextToClipboard(token).then(
      () => message.success('API Key 已复制'),
      () => message.error('复制失败')
    );
  };
  const keyTable = (
    <Table<ApplicationApiKey>
      rowKey="id"
      loading={keysQuery.isLoading}
      dataSource={keys}
      pagination={false}
      columns={[
        { title: '名称', dataIndex: 'name' },
        {
          title: (
            <Space size={6}>
              <span>密钥</span>
              <Tooltip title="列表只显示可识别的 Key 前缀；完整 token 只在创建后显示一次，关闭后无法再次查看。">
                <QuestionCircleOutlined aria-label="密钥说明" />
              </Tooltip>
            </Space>
          ),
          dataIndex: 'token_prefix',
          width: 210,
          render: (value: string) => (
            <Typography.Text code>{maskTokenPreview(value)}</Typography.Text>
          )
        },
        {
          title: '创建时间',
          dataIndex: 'created_at',
          width: 200,
          render: (value: string) => formatDateTime(value)
        },
        {
          title: '操作',
          key: 'actions',
          width: 96,
          render: (_, record) => (
            <Button
              danger
              icon={<DeleteOutlined />}
              size="small"
              type="text"
              aria-label="删除"
              loading={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate(record.id)}
            />
          )
        }
      ]}
    />
  );

  if (variant === 'embedded') {
    return (
      <>
        <Button
          aria-label="API 密钥"
          className="application-api-key-trigger"
          icon={<KeyOutlined />}
          onClick={() => setListOpen(true)}
        >
          API 密钥
        </Button>
        <Modal
          title="API Keys"
          open={listOpen}
          destroyOnHidden
          width={840}
          footer={null}
          onCancel={() => setListOpen(false)}
        >
          <Space direction="vertical" size={16} className="application-api-key-list-modal">
            <div className="application-api-panel__header">
              <Typography.Text type="secondary">
                已创建 {keys.length} 个 Key。
              </Typography.Text>
              <Button type="primary" onClick={() => setCreateOpen(true)}>
                创建 Key
              </Button>
            </div>
            {keyTable}
          </Space>
        </Modal>
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
              <Input />
            </Form.Item>
          </Form>
        </Modal>
        <Modal
          title="保存这次创建的 API Key"
          open={Boolean(createdKey)}
          className="application-api-created-key-modal"
          destroyOnHidden
          onCancel={() => setCreatedKey(null)}
          footer={[
            <Button key="close" type="text" onClick={() => setCreatedKey(null)}>
              关闭
            </Button>,
            <Button
              key="copy"
              aria-label="复制"
              className="application-api-created-token-copy"
              onClick={copyCreatedToken}
            >
              复制
            </Button>
          ]}
        >
          <Space direction="vertical" className="application-api-token-modal">
            <Typography.Text>完整 token 只在创建后显示一次。</Typography.Text>
            <Typography.Text type="secondary">
              关闭后页面不再显示完整 token。
            </Typography.Text>
            <Typography.Text className="application-api-created-token">
              {createdKey?.token}
            </Typography.Text>
          </Space>
        </Modal>
      </>
    );
  }

  return (
    <section className="application-api-panel">
      <div className="application-api-panel__header">
        <div>
          <Typography.Title level={4}>API Keys</Typography.Title>
          <Typography.Text type="secondary">用于调用当前应用公开 API。</Typography.Text>
        </div>
        <Button type="primary" onClick={() => setCreateOpen(true)}>
          创建 Key
        </Button>
      </div>
      {keyTable}
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
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="保存这次创建的 API Key"
        open={Boolean(createdKey)}
        className="application-api-created-key-modal"
        destroyOnHidden
        onCancel={() => setCreatedKey(null)}
        footer={[
          <Button key="close" type="text" onClick={() => setCreatedKey(null)}>
            关闭
          </Button>,
          <Button
            key="copy"
            aria-label="复制"
            className="application-api-created-token-copy"
            onClick={copyCreatedToken}
          >
            复制
          </Button>
        ]}
      >
        <Space direction="vertical" className="application-api-token-modal">
          <Typography.Text>完整 token 只在创建后显示一次。</Typography.Text>
          <Typography.Text type="secondary">
            关闭后页面不再显示完整 token。
          </Typography.Text>
          <Typography.Text className="application-api-created-token">
            {createdKey?.token}
          </Typography.Text>
        </Space>
      </Modal>
    </section>
  );
}
