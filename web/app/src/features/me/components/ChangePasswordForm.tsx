import { Alert, Button, Form, Input, Space, Typography } from 'antd';

import type { ChangeMyPasswordInput } from '../api/me';

interface ChangePasswordValues {
  old_password: string;
  new_password: string;
  confirm_password: string;
}

export function ChangePasswordForm({
  className,
  submitting,
  errorMessage,
  onSubmit
}: {
  className?: string;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (input: ChangeMyPasswordInput) => Promise<void> | void;
}) {
  const [form] = Form.useForm<ChangePasswordValues>();

  return (
    <Space className={className} direction="vertical" size="large">
      <div>
        <Typography.Title level={3}>安全设置</Typography.Title>
        <Typography.Paragraph>
          更新密码后会立即清除当前会话，你需要使用新密码重新登录。
        </Typography.Paragraph>
      </div>

      {errorMessage ? <Alert type="error" message={errorMessage} showIcon /> : null}

      <Form<ChangePasswordValues>
        form={form}
        layout="vertical"
        onFinish={async (values) => {
          await onSubmit({
            old_password: values.old_password,
            new_password: values.new_password
          });
          form.resetFields();
        }}
      >
        <Form.Item
          label="密码"
          name="old_password"
          rules={[{ required: true, message: '请输入当前密码。' }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="new_password"
          rules={[{ required: true, message: '请输入新密码。' }]}
        >
          <Input.Password />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirm_password"
          dependencies={['new_password']}
          rules={[
            { required: true, message: '请再次输入新密码。' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || value === getFieldValue('new_password')) {
                  return Promise.resolve();
                }

                return Promise.reject(new Error('两次输入的新密码不一致。'));
              }
            })
          ]}
        >
          <Input.Password />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={submitting}>
          更新密码
        </Button>
      </Form>
    </Space>
  );
}
