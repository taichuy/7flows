import { useEffect, useState } from 'react';

import { EditOutlined } from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  Row,
  Space,
  Tag,
  Typography
} from 'antd';

import type { MyProfile, UpdateMyProfileInput } from '../api/me';

interface ProfileFormValues {
  name: string;
  nickname: string;
  email: string;
  phone: string;
  avatar_url: string;
  introduction: string;
}

export function ProfileForm({
  me,
  statusLabel,
  submitting,
  errorMessage,
  onSubmit
}: {
  me: MyProfile;
  statusLabel: string;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (input: UpdateMyProfileInput) => Promise<void> | void;
}) {
  const [form] = Form.useForm<ProfileFormValues>();
  const [drawerVisible, setDrawerVisible] = useState(false);

  useEffect(() => {
    form.setFieldsValue({
      name: me.name,
      nickname: me.nickname,
      email: me.email,
      phone: me.phone ?? '',
      avatar_url: me.avatar_url ?? '',
      introduction: me.introduction
    });
  }, [form, me]);

  const handleEditClick = () => {
    setDrawerVisible(true);
  };

  const handleDrawerClose = () => {
    setDrawerVisible(false);
  };

  const handleFinish = async (values: ProfileFormValues) => {
    await onSubmit({
      name: values.name.trim(),
      nickname: values.nickname.trim(),
      email: values.email.trim(),
      phone: values.phone.trim() ? values.phone.trim() : null,
      avatar_url: values.avatar_url.trim() ? values.avatar_url.trim() : null,
      introduction: values.introduction.trim()
    });
    setDrawerVisible(false);
  };

  return (
    <>
      <Card
        className="me-profile-card"
        title={
          <div className="me-profile-card__header">
            <Typography.Title level={4}>个人信息</Typography.Title>
          </div>
        }
        extra={
          <Button
            className="me-profile-card__edit"
            type="primary"
            icon={<EditOutlined />}
            onClick={handleEditClick}
          >
            编辑资料
          </Button>
        }
        variant="borderless"
      >
        <Row gutter={[24, 24]}>
          <Col span={24} className="me-profile-card__summary">
            <Avatar size={80} src={me.avatar_url} className="me-profile-card__avatar">
              {me.name?.[0]?.toUpperCase() ?? me.account?.[0]?.toUpperCase()}
            </Avatar>
            <div>
              <Typography.Title level={3} className="me-profile-card__name">
                {me.nickname || me.name || me.account}
              </Typography.Title>
              <Space>
                <Tag className="me-profile-card__status" color="green">
                  {statusLabel}
                </Tag>
                <Tag className="me-profile-card__role" color="blue">
                  {me.effective_display_role}
                </Tag>
              </Space>
            </div>
          </Col>

          <Divider className="me-profile-card__divider" />

          <Col span={24}>
            <Descriptions 
              column={{ xs: 1, sm: 2, md: 3 }} 
              layout="vertical"
              variant="borderless"
              styles={{ label: { color: 'rgba(0, 0, 0, 0.45)', paddingBottom: 8 }, content: { color: 'rgba(0, 0, 0, 0.88)', fontWeight: 400, paddingBottom: 24 } }}
            >
              <Descriptions.Item label="账号名称">{me.account}</Descriptions.Item>
              <Descriptions.Item label="真实姓名">{me.name}</Descriptions.Item>
              <Descriptions.Item label="联系邮箱">{me.email}</Descriptions.Item>
              <Descriptions.Item label="手机号码">{me.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="系统权限" span={2}>
                {me.permissions.length > 0 ? (
                  <Space className="me-profile-card__permissions" size={[4, 8]} wrap>
                    {me.permissions.map((permission) => (
                      <Tag key={permission} className="me-profile-card__permission">
                        {permission}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Typography.Text className="me-profile-card__placeholder" type="secondary">
                    暂无显式权限
                  </Typography.Text>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="个人介绍" span={3}>
                {me.introduction || (
                  <Typography.Text className="me-profile-card__placeholder" type="secondary">
                    暂无介绍
                  </Typography.Text>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      <Drawer
        title="编辑个人信息"
        width={400}
        onClose={handleDrawerClose}
        open={drawerVisible}
        extra={
          <Space>
            <Button onClick={handleDrawerClose}>取消</Button>
            <Button type="primary" onClick={() => form.submit()} loading={submitting}>
              保存资料
            </Button>
          </Space>
        }
      >
        {errorMessage ? (
          <Alert type="error" message={errorMessage} showIcon style={{ marginBottom: 24 }} />
        ) : null}

        <Form<ProfileFormValues>
          form={form}
          layout="vertical"
          onFinish={handleFinish}
        >
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: '请输入姓名。' }]}
            extra="你的真实姓名，用于后台实名记录。"
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="昵称"
            name="nickname"
            rules={[{ required: true, message: '请输入昵称。' }]}
            extra="系统内的显示名称。"
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[{ required: true, type: 'email', message: '请输入有效的邮箱地址。' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="手机号" name="phone">
            <Input />
          </Form.Item>
          <Form.Item label="头像地址" name="avatar_url" extra="支持外链图片地址。">
            <Input placeholder="https://example.com/avatar.png" />
          </Form.Item>
          <Form.Item label="个人介绍" name="introduction">
            <Input.TextArea rows={4} placeholder="简单介绍一下自己..." />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
