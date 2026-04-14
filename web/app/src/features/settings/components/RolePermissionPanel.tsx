import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tree,
  Typography,
  message
} from 'antd';
import type { TreeDataNode } from 'antd';
import { PlusOutlined, EditOutlined, SafetyCertificateOutlined, DeleteOutlined } from '@ant-design/icons';

import { useAuthStore } from '../../../state/auth-store';
import { fetchSettingsPermissions, settingsPermissionsQueryKey, type SettingsPermission } from '../api/permissions';
import {
  createSettingsRole,
  deleteSettingsRole,
  fetchSettingsRolePermissions,
  fetchSettingsRoles,
  replaceSettingsRolePermissions,
  settingsRolePermissionsQueryKey,
  settingsRolesQueryKey,
  updateSettingsRole,
  type SettingsRole
} from '../api/roles';

// Helper to group permissions by resource into a Tree structure
function buildPermissionTree(permissions: SettingsPermission[]): TreeDataNode[] {
  const resourceMap = new Map<string, SettingsPermission[]>();
  
  permissions.forEach(p => {
    // If resource is empty, we fall back to action or 'other'
    const res = p.resource || 'other';
    if (!resourceMap.has(res)) {
      resourceMap.set(res, []);
    }
    resourceMap.get(res)!.push(p);
  });

  return Array.from(resourceMap.entries()).map(([resource, perms]) => ({
    title: resource,
    key: `resource:${resource}`,
    children: perms.map(p => ({
      title: `${p.name} (${p.code})`,
      key: p.code,
    }))
  }));
}

export function RolePermissionPanel({
  canManageRoles
}: {
  canManageRoles: boolean;
}) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<SettingsRole | null>(null);
  const [permissionDrawerRole, setPermissionDrawerRole] = useState<SettingsRole | null>(null);
  
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const rolesQuery = useQuery({
    queryKey: settingsRolesQueryKey,
    queryFn: fetchSettingsRoles
  });
  
  const permissionsQuery = useQuery({
    queryKey: settingsPermissionsQueryKey,
    queryFn: fetchSettingsPermissions,
    enabled: !!permissionDrawerRole
  });

  const rolePermissionsQuery = useQuery({
    queryKey: settingsRolePermissionsQueryKey(permissionDrawerRole?.code ?? 'none'),
    queryFn: () => fetchSettingsRolePermissions(permissionDrawerRole?.code ?? ''),
    enabled: Boolean(permissionDrawerRole)
  });

  const treeData = useMemo(() => {
    return buildPermissionTree(permissionsQuery.data ?? []);
  }, [permissionsQuery.data]);

  const invalidateRoles = async () => {
    await queryClient.invalidateQueries({ queryKey: settingsRolesQueryKey });
    if (permissionDrawerRole) {
      await queryClient.invalidateQueries({
        queryKey: settingsRolePermissionsQueryKey(permissionDrawerRole.code)
      });
    }
  };

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!csrfToken) throw new Error('missing csrf token');
      return createSettingsRole(
        {
          code: String(values.code ?? ''),
          name: String(values.name ?? ''),
          introduction: String(values.introduction ?? '')
        },
        csrfToken
      );
    },
    onSuccess: async () => {
      messageApi.success('角色创建成功');
      createForm.resetFields();
      setIsCreateModalOpen(false);
      await invalidateRoles();
    },
    onError: () => {
      messageApi.error('角色创建失败');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!csrfToken || !editingRole) throw new Error('missing csrf token or editing role');
      return updateSettingsRole(
        editingRole.code,
        {
          name: String(values.name ?? ''),
          introduction: String(values.introduction ?? '')
        },
        csrfToken
      );
    },
    onSuccess: async () => {
      messageApi.success('角色更新成功');
      setEditingRole(null);
      await invalidateRoles();
    },
    onError: () => {
      messageApi.error('角色更新失败');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (roleCode: string) => {
      if (!csrfToken) throw new Error('missing csrf token');
      return deleteSettingsRole(roleCode, csrfToken);
    },
    onSuccess: async () => {
      messageApi.success('角色已删除');
      if (permissionDrawerRole?.code === deleteMutation.variables) {
        setPermissionDrawerRole(null);
      }
      await invalidateRoles();
    },
    onError: () => {
      messageApi.error('角色删除失败');
    }
  });

  const replacePermissionsMutation = useMutation({
    mutationFn: async (permissionCodes: string[]) => {
      if (!csrfToken || !permissionDrawerRole) throw new Error('missing selection');
      return replaceSettingsRolePermissions(
        permissionDrawerRole.code,
        { permission_codes: permissionCodes },
        csrfToken
      );
    },
    onSuccess: async () => {
      messageApi.success('权限更新成功');
      await invalidateRoles();
    },
    onError: () => {
      messageApi.error('权限更新失败');
    }
  });

  const handleEditClick = (role: SettingsRole) => {
    setEditingRole(role);
    editForm.setFieldsValue({
      name: role.name,
      // @ts-expect-error type
      introduction: role.introduction ?? ''
    });
  };

  const handleTreeCheck = (
    checkedKeys: React.Key[] | { checked: React.Key[]; halfChecked: React.Key[] }
  ) => {
    // antd tree onCheck returns either string[] or { checked: string[], halfChecked: string[] }
    // We only care about the checked leaf nodes (the actual permission codes)
    const keys = Array.isArray(checkedKeys) ? checkedKeys : checkedKeys.checked;
    const permissionCodes = keys
      .map(String)
      .filter((k: string) => !k.startsWith('resource:'));
    replacePermissionsMutation.mutate(permissionCodes);
  };

  const handleSelectAll = () => {
    if (!permissionsQuery.data) return;
    const allCodes = permissionsQuery.data.map(p => p.code);
    replacePermissionsMutation.mutate(allCodes);
  };

  const handleClearAll = () => {
    replacePermissionsMutation.mutate([]);
  };

  // Compute checked keys for Tree:
  // Antd Tree expects both parent and leaf keys in checkedKeys if parent is checked.
  // But since we extract only leaf keys to save to backend, 
  // we can just pass the leaf permission codes to checkedKeys.
  // The Tree component will automatically show parents as half-checked.
  const checkedPermissionCodes = rolePermissionsQuery.data?.permission_codes ?? [];
  const allPermissionsCount = permissionsQuery.data?.length ?? 0;
  const isAllSelected = allPermissionsCount > 0 && checkedPermissionCodes.length === allPermissionsCount;

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {contextHolder}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Typography.Title level={3}>权限管理</Typography.Title>
          <Typography.Paragraph type="secondary">
            管理工作台角色、查看权限绑定，并在授权范围内调整角色定义。
          </Typography.Paragraph>
        </div>
        {canManageRoles && (
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => setIsCreateModalOpen(true)}
          >
            新建角色
          </Button>
        )}
      </div>

      <Table<SettingsRole>
        rowKey="code"
        loading={rolesQuery.isLoading}
        dataSource={rolesQuery.data ?? []}
        pagination={false}
        columns={[
          {
            title: '角色名称',
            render: (_, role) => (
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{role.name}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>{role.code}</Typography.Text>
              </Space>
            )
          },
          {
            title: '作用域',
            dataIndex: 'scope_kind',
            render: (kind) => <Tag color={kind === 'global' ? 'blue' : 'default'}>{kind}</Tag>
          },
          {
            title: '类型',
            dataIndex: 'is_builtin',
            render: (isBuiltin) => <Tag color={isBuiltin ? 'gold' : 'green'}>{isBuiltin ? '内置' : '自定义'}</Tag>
          },
          {
            title: '权限数量',
            render: (_, role) => (
              <Tag icon={<SafetyCertificateOutlined />}>
                {role.permission_codes.length}
              </Tag>
            )
          },
          {
            title: '操作',
            width: 280,
            render: (_, role) =>
              canManageRoles ? (
                <Space size="middle">
                  <Button
                    type="text"
                    icon={<SafetyCertificateOutlined />}
                    onClick={() => setPermissionDrawerRole(role)}
                  >
                    配置权限
                  </Button>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEditClick(role)}
                    disabled={!role.is_editable}
                  >
                    编辑
                  </Button>
                  <Popconfirm
                    title="删除角色"
                    description={`确定要删除角色 "${role.name}" 吗？此操作不可恢复。`}
                    onConfirm={() => deleteMutation.mutate(role.code)}
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true, loading: deleteMutation.isPending && deleteMutation.variables === role.code }}
                    disabled={!role.is_editable}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={!role.is_editable}
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Typography.Text type="secondary">只读</Typography.Text>
              )
          }
        ]}
      />

      <Modal
        title="新建角色"
        open={isCreateModalOpen}
        onCancel={() => {
          setIsCreateModalOpen(false);
          createForm.resetFields();
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            label="角色名称"
            name="name"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：运营专员" />
          </Form.Item>
          <Form.Item
            label="角色编码"
            name="code"
            rules={[{ required: true, message: '请输入角色编码' }]}
            extra="编码需全局唯一，创建后不可修改。"
          >
            <Input placeholder="例如：role_ops_specialist" />
          </Form.Item>
          <Form.Item label="角色说明" name="introduction">
            <Input.TextArea placeholder="简要描述该角色的职责和适用范围" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑角色"
        open={!!editingRole}
        onCancel={() => setEditingRole(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => updateMutation.mutate(values)}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            label="角色名称"
            name="name"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="角色说明" name="introduction">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={
          <Space direction="vertical" size={0}>
            <span>配置权限</span>
            <Typography.Text type="secondary" style={{ fontSize: '12px', fontWeight: 'normal' }}>
              {permissionDrawerRole?.name} ({permissionDrawerRole?.code})
            </Typography.Text>
          </Space>
        }
        placement="right"
        width={500}
        onClose={() => setPermissionDrawerRole(null)}
        open={!!permissionDrawerRole}
        destroyOnClose
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
              为该角色分配系统权限。勾选后将自动保存。
            </Typography.Paragraph>
            <Space>
              <Button size="small" onClick={handleSelectAll} disabled={isAllSelected || !canManageRoles || !permissionDrawerRole?.is_editable}>
                全选
              </Button>
              <Button size="small" onClick={handleClearAll} disabled={checkedPermissionCodes.length === 0 || !canManageRoles || !permissionDrawerRole?.is_editable}>
                清空
              </Button>
            </Space>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
            {permissionsQuery.isLoading || rolePermissionsQuery.isLoading ? (
              <Typography.Text type="secondary">加载中...</Typography.Text>
            ) : (
              <Tree
                checkable
                disabled={!canManageRoles || !permissionDrawerRole?.is_editable}
                checkedKeys={checkedPermissionCodes}
                onCheck={handleTreeCheck}
                treeData={treeData}
                defaultExpandAll={false}
              />
            )}
          </div>
        </Space>
      </Drawer>
    </Space>
  );
}
