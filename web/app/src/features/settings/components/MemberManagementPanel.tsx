import { useCallback, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography
} from 'antd';
import {
  EditOutlined,
  KeyOutlined,
  StopOutlined,
  UserAddOutlined
} from '@ant-design/icons';

import { useAuthStore } from '../../../state/auth-store';
import {
  createSettingsMember,
  disableSettingsMember,
  fetchSettingsMembers,
  replaceSettingsMemberRoles,
  resetSettingsMemberPassword,
  settingsMembersQueryKey,
  type SettingsMember
} from '../api/members';
import { fetchSettingsRoles, settingsRolesQueryKey } from '../api/roles';

const TEMP_PASSWORD = 'Temp@123456';

export function MemberManagementPanel({
  canManageMembers,
  canManageRoleBindings
}: {
  canManageMembers: boolean;
  canManageRoleBindings: boolean;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);

  const [createForm] = Form.useForm();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [roleEditMember, setRoleEditMember] = useState<SettingsMember | null>(null);
  const [editingRoleCodes, setEditingRoleCodes] = useState<string[]>([]);

  const membersQuery = useQuery({
    queryKey: settingsMembersQueryKey,
    queryFn: fetchSettingsMembers
  });
  const rolesQuery = useQuery({
    queryKey: settingsRolesQueryKey,
    queryFn: fetchSettingsRoles,
    enabled: canManageRoleBindings
  });

  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: settingsMembersQueryKey });

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return createSettingsMember(
        {
          account: String(values.account ?? ''),
          email: String(values.email ?? ''),
          phone: values.phone ? String(values.phone) : null,
          password: String(values.password ?? ''),
          name: String(values.name ?? ''),
          nickname: String(values.nickname ?? ''),
          introduction: String(values.introduction ?? ''),
          email_login_enabled: Boolean(values.email_login_enabled),
          phone_login_enabled: Boolean(values.phone_login_enabled)
        },
        csrfToken
      );
    },
    onSuccess: async () => {
      createForm.resetFields();
      setCreateModalOpen(false);
      await invalidateMembers();
    }
  });

  const disableMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return disableSettingsMember(memberId, csrfToken);
    },
    onSuccess: invalidateMembers
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return resetSettingsMemberPassword(
        memberId,
        { new_password: TEMP_PASSWORD },
        csrfToken
      );
    }
  });

  const replaceRolesMutation = useMutation({
    mutationFn: async ({
      memberId,
      roleCodes
    }: {
      memberId: string;
      roleCodes: string[];
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return replaceSettingsMemberRoles(
        memberId,
        { role_codes: roleCodes },
        csrfToken
      );
    },
    onSuccess: async () => {
      await invalidateMembers();
      setRoleEditMember(null);
    }
  });

  const handleCreateSubmit = useCallback(
    (values: Record<string, unknown>) => {
      createMutation.mutate(values);
    },
    [createMutation]
  );

  const handleOpenRoleEdit = useCallback((member: SettingsMember) => {
    setRoleEditMember(member);
    setEditingRoleCodes(member.role_codes);
  }, []);

  const handleRoleEditOk = useCallback(() => {
    if (roleEditMember) {
      replaceRolesMutation.mutate({
        memberId: roleEditMember.id,
        roleCodes: editingRoleCodes
      });
    }
  }, [roleEditMember, editingRoleCodes, replaceRolesMutation]);

  const roleOptions = useMemo(
    () =>
      (rolesQuery.data ?? []).map((role) => ({
        label: role.name,
        value: role.code
      })),
    [rolesQuery.data]
  );

  const columns = useMemo(
    () => [
      {
        title: '用户',
        key: 'user',
        render: (_: unknown, member: SettingsMember) => (
          <Space>
            <Avatar size="small" style={{ backgroundColor: '#00d084', flexShrink: 0 }}>
              {(member.name ?? member.account).charAt(0).toUpperCase()}
            </Avatar>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography.Text strong style={{ fontSize: 14 }}>
                {member.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {member.account}
                {member.nickname && member.nickname !== member.name
                  ? ` · ${member.nickname}`
                  : ''}
              </Typography.Text>
            </div>
          </Space>
        )
      },
      {
        title: '联系方式',
        key: 'contact',
        render: (_: unknown, member: SettingsMember) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography.Text style={{ fontSize: 13 }}>{member.email}</Typography.Text>
            {member.phone ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {member.phone}
              </Typography.Text>
            ) : null}
          </div>
        )
      },
      {
        title: '状态',
        key: 'status',
        width: 80,
        render: (_: unknown, member: SettingsMember) => (
          <Tag color={member.status === 'active' ? 'green' : 'default'}>
            {member.status === 'active' ? '启用' : '停用'}
          </Tag>
        )
      },
      {
        title: '角色',
        key: 'roles',
        render: (_: unknown, member: SettingsMember) =>
          canManageRoleBindings ? (
            <Space wrap size={4}>
              {member.role_codes.map((roleCode) => (
                <Tag key={roleCode}>{roleCode}</Tag>
              ))}
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                style={{ padding: '0 4px', fontSize: 12 }}
                onClick={() => handleOpenRoleEdit(member)}
              >
                编辑
              </Button>
            </Space>
          ) : (
            <Space wrap size={4}>
              {member.role_codes.map((roleCode) => (
                <Tag key={roleCode}>{roleCode}</Tag>
              ))}
            </Space>
          )
      },
      ...(canManageMembers
        ? [
            {
              title: '操作',
              key: 'action',
              width: 160,
              render: (_: unknown, member: SettingsMember) => (
                <Space size={4}>
                  {member.status === 'active' ? (
                    <Popconfirm
                      title="停用账号"
                      description={`确定要停用 ${member.name} 的账号吗？停用后该用户将无法登录。`}
                      onConfirm={() => disableMutation.mutate(member.id)}
                      okText="确认停用"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        loading={disableMutation.isPending}
                      >
                        停用
                      </Button>
                    </Popconfirm>
                  ) : null}
                  <Popconfirm
                    title="重置密码"
                    description={`将 ${member.name} 的密码重置为默认临时密码，用户登录后需立即修改。`}
                    onConfirm={() => resetPasswordMutation.mutate(member.id)}
                    okText="确认重置"
                    cancelText="取消"
                  >
                    <Button
                      size="small"
                      icon={<KeyOutlined />}
                      loading={resetPasswordMutation.isPending}
                    >
                      重置密码
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]
        : [])
    ],
    [
      canManageMembers,
      canManageRoleBindings,
      disableMutation,
      resetPasswordMutation,
      handleOpenRoleEdit
    ]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            用户管理
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            管理工作台成员账号、角色与登录状态
          </Typography.Text>
        </div>
        {canManageMembers ? (
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => setCreateModalOpen(true)}
          >
            新建用户
          </Button>
        ) : null}
      </div>

      <Table<SettingsMember>
        rowKey="id"
        loading={membersQuery.isLoading}
        dataSource={membersQuery.data ?? []}
        pagination={false}
        columns={columns}
        size="middle"
      />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        重置密码会将目标账号密码重置为默认临时密码，并要求用户登录后立即修改。
      </Typography.Text>

      {/* Create Member Modal */}
      <Modal
        title="新建用户"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        okText="创建"
        cancelText="取消"
        width={600}
        destroyOnHidden
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateSubmit}
          style={{ marginTop: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              label="账号"
              name="account"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="姓名"
              name="name"
              rules={[{ required: true, message: '请输入姓名' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="邮箱"
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效邮箱' }
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item label="手机号" name="phone">
              <Input />
            </Form.Item>
            <Form.Item
              label="昵称"
              name="nickname"
              rules={[{ required: true, message: '请输入昵称' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label="初始密码"
              name="password"
              initialValue={TEMP_PASSWORD}
              rules={[{ required: true, message: '请输入初始密码' }]}
            >
              <Input.Password />
            </Form.Item>
          </div>
          <Form.Item label="个人介绍" name="introduction">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', gap: 24 }}>
            <Form.Item
              label="邮箱登录"
              name="email_login_enabled"
              valuePropName="checked"
              initialValue
            >
              <Switch />
            </Form.Item>
            <Form.Item
              label="手机登录"
              name="phone_login_enabled"
              valuePropName="checked"
              initialValue={false}
            >
              <Switch />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* Role Edit Modal */}
      <Modal
        title={
          roleEditMember
            ? `编辑角色 — ${roleEditMember.name}`
            : '编辑角色'
        }
        open={Boolean(roleEditMember)}
        onCancel={() => setRoleEditMember(null)}
        onOk={handleRoleEditOk}
        confirmLoading={replaceRolesMutation.isPending}
        okText="保存"
        cancelText="取消"
        width={480}
        destroyOnHidden
      >
        {roleEditMember ? (
          <div style={{ marginTop: 16 }}>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginBottom: 12, fontSize: 13 }}
            >
              为用户 {roleEditMember.name}（{roleEditMember.account}）分配角色
            </Typography.Text>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              value={editingRoleCodes}
              onChange={setEditingRoleCodes}
              options={roleOptions}
              placeholder="选择角色"
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
