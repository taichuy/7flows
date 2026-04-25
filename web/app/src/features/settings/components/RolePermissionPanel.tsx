import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Tabs,
  Tag,
  Tree,
  Typography,
  message
} from 'antd';
import type { TreeDataNode } from 'antd';
import {
  SearchOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TeamOutlined,
  SafetyCertificateOutlined
} from '@ant-design/icons';

import { useAuthStore } from '../../../state/auth-store';
import {
  fetchSettingsPermissions,
  settingsPermissionsQueryKey,
  type SettingsPermission
} from '../api/permissions';
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
import { SettingsSectionSurface } from './SettingsSectionSurface';

// 分类映射，根据要求
const RESOURCE_MAP: Record<
  string,
  { tab: string; label: string; order: number }
> = {
  role_permission: {
    tab: '基础配置',
    label: '权限 (role_permission)',
    order: 1
  },
  user: { tab: '基础配置', label: '用户 (user)', order: 2 },
  team: { tab: '基础配置', label: '团队 (team)', order: 3 },
  external_data_source: {
    tab: '基础配置',
    label: '数据源 (external_data_source)',
    order: 4
  },

  application: { tab: '系统管理', label: '应用 (application)', order: 1 },
  embedded_app: { tab: '系统管理', label: '子系统 (embedded_app)', order: 2 },
  plugin_config: {
    tab: '系统管理',
    label: '插件配置 (plugin_config)',
    order: 3
  },
  state_model: { tab: '系统管理', label: '模型供应商 (state_model)', order: 4 },

  route_page: { tab: '路由页面', label: '路由权限 (route_page)', order: 1 },

  flow: { tab: 'Agent 应用', label: '工作流 (flow)', order: 1 },
  publish_endpoint: {
    tab: 'Agent 应用',
    label: '发布 (publish_endpoint)',
    order: 2
  }
};

const TAB_ORDER = ['基础配置', '系统管理', '路由页面', 'Agent 应用', '其他'];

export function RolePermissionPanel({
  canManageRoles
}: {
  canManageRoles: boolean;
}) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const queryClient = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<SettingsRole | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // Queries
  const rolesQuery = useQuery({
    queryKey: settingsRolesQueryKey,
    queryFn: fetchSettingsRoles
  });

  const permissionsQuery = useQuery({
    queryKey: settingsPermissionsQueryKey,
    queryFn: fetchSettingsPermissions
  });

  const rolePermissionsQuery = useQuery({
    queryKey: settingsRolePermissionsQueryKey(selectedRoleCode ?? 'none'),
    queryFn: () => fetchSettingsRolePermissions(selectedRoleCode ?? ''),
    enabled: Boolean(selectedRoleCode)
  });

  // Local state for fast UI updates
  const [localCheckedCodes, setLocalCheckedCodes] = useState<string[]>([]);

  useEffect(() => {
    setLocalCheckedCodes(rolePermissionsQuery.data?.permission_codes ?? []);
  }, [rolePermissionsQuery.data?.permission_codes]);

  useEffect(() => {
    if (!selectedRoleCode && rolesQuery.data?.length) {
      setSelectedRoleCode(rolesQuery.data[0].code);
    }
  }, [rolesQuery.data, selectedRoleCode]);

  const filteredRoles = useMemo(() => {
    if (!rolesQuery.data) return [];
    return rolesQuery.data.filter(
      (r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [rolesQuery.data, searchQuery]);

  const selectedRole = useMemo(() => {
    return rolesQuery.data?.find((r) => r.code === selectedRoleCode) || null;
  }, [rolesQuery.data, selectedRoleCode]);

  const tabsData = useMemo(() => {
    const allPerms = permissionsQuery.data ?? [];
    const tabsMap = new Map<string, Map<string, SettingsPermission[]>>();

    allPerms.forEach((p) => {
      const resKey = p.resource || 'other';
      const mapInfo = RESOURCE_MAP[resKey];
      const tabName = mapInfo ? mapInfo.tab : '其他';

      if (!tabsMap.has(tabName)) {
        tabsMap.set(tabName, new Map());
      }
      const resMap = tabsMap.get(tabName)!;
      if (!resMap.has(resKey)) {
        resMap.set(resKey, []);
      }
      resMap.get(resKey)!.push(p);
    });

    return TAB_ORDER.filter((t) => tabsMap.has(t)).map((tabName) => {
      const resMap = tabsMap.get(tabName)!;
      const resources = Array.from(resMap.entries())
        .map(([resKey, perms]) => {
          const mapInfo = RESOURCE_MAP[resKey];
          return {
            key: resKey,
            label: mapInfo ? mapInfo.label : resKey,
            order: mapInfo ? mapInfo.order : 99,
            permissions: perms
          };
        })
        .sort((a, b) => a.order - b.order);

      const treeData: TreeDataNode[] = resources.map((res) => ({
        title: res.label,
        key: `resource:${res.key}`,
        children: res.permissions.map((p) => ({
          title: <span title={p.code}>{p.name}</span>,
          key: p.code
        }))
      }));

      const tabLeafKeys = resources.flatMap((res) =>
        res.permissions.map((p) => p.code)
      );

      return {
        key: tabName,
        label: tabName,
        treeData,
        tabLeafKeys
      };
    });
  }, [permissionsQuery.data]);

  const invalidateRoles = async () => {
    await queryClient.invalidateQueries({ queryKey: settingsRolesQueryKey });
    if (selectedRoleCode) {
      await queryClient.invalidateQueries({
        queryKey: settingsRolePermissionsQueryKey(selectedRoleCode)
      });
    }
  };

  const replacePermissionsMutation = useMutation({
    mutationFn: async (permissionCodes: string[]) => {
      if (!csrfToken || !selectedRoleCode) throw new Error('missing selection');
      return replaceSettingsRolePermissions(
        selectedRoleCode,
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
      // revert local state on error
      setLocalCheckedCodes(rolePermissionsQuery.data?.permission_codes ?? []);
    }
  });

  const createMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!csrfToken) throw new Error('missing csrf token');
      return createSettingsRole(
        {
          code: String(values.code ?? ''),
          name: String(values.name ?? ''),
          introduction: String(values.introduction ?? ''),
          auto_grant_new_permissions: Boolean(
            values.auto_grant_new_permissions
          ),
          is_default_member_role: Boolean(values.is_default_member_role)
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
    onError: () => messageApi.error('角色创建失败')
  });

  const updateMutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (!csrfToken || !editingRole)
        throw new Error('missing csrf token or editing role');
      return updateSettingsRole(
        editingRole.code,
        {
          name: String(values.name ?? ''),
          introduction: String(values.introduction ?? ''),
          auto_grant_new_permissions: Boolean(
            values.auto_grant_new_permissions
          ),
          is_default_member_role: Boolean(values.is_default_member_role)
        },
        csrfToken
      );
    },
    onSuccess: async () => {
      messageApi.success('角色更新成功');
      setEditingRole(null);
      await invalidateRoles();
    },
    onError: () => messageApi.error('角色更新失败')
  });

  const deleteMutation = useMutation({
    mutationFn: async (roleCode: string) => {
      if (!csrfToken) throw new Error('missing csrf token');
      return deleteSettingsRole(roleCode, csrfToken);
    },
    onSuccess: async (_, variables) => {
      messageApi.success('角色已删除');
      if (selectedRoleCode === variables) {
        setSelectedRoleCode(rolesQuery.data?.[0]?.code ?? null);
      }
      await invalidateRoles();
    },
    onError: () => messageApi.error('角色删除失败')
  });

  const handleEditClick = (role: SettingsRole) => {
    setEditingRole(role);
    editForm.setFieldsValue({
      name: role.name,
      // @ts-expect-error type
      introduction: role.introduction ?? '',
      auto_grant_new_permissions: role.auto_grant_new_permissions,
      is_default_member_role: role.is_default_member_role
    });
  };

  return (
    <SettingsSectionSurface
      title="权限管理"
      description="管理工作台角色与查看权限绑定，使用左右布局快速切换选择角色并分配模块功能。"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          width: '100%',
          minHeight: 'calc(100vh - 120px)'
        }}
      >
        {contextHolder}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            border: '1px solid #f0f0f0',
            borderRadius: '8px',
            background: '#fff',
            overflow: 'hidden'
          }}
        >
          {/* 左侧：角色列表 */}
          <div
            style={{
              width: 280,
              borderRight: '1px solid #f0f0f0',
              display: 'flex',
              flexDirection: 'column',
              background: '#fafafa',
              flexShrink: 0
            }}
          >
            <div
              style={{
                padding: 16,
                borderBottom: '1px solid #f0f0f0',
                background: '#fff'
              }}
            >
              <Space
                direction="vertical"
                size="middle"
                style={{ width: '100%' }}
              >
                {canManageRoles && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    block
                    onClick={() => setIsCreateModalOpen(true)}
                  >
                    新建角色
                  </Button>
                )}
                <Input
                  placeholder="搜索角色..."
                  prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  allowClear
                />
              </Space>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {rolesQuery.isLoading ? (
                <div
                  style={{ padding: 16, textAlign: 'center', color: '#bfbfbf' }}
                >
                  加载中...
                </div>
              ) : filteredRoles.length === 0 ? (
                <div
                  style={{ padding: 32, textAlign: 'center', color: '#bfbfbf' }}
                >
                  暂无角色
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  {filteredRoles.map((role) => {
                    const isActive = selectedRoleCode === role.code;
                    return (
                      <div
                        key={role.code}
                        onClick={() => setSelectedRoleCode(role.code)}
                        style={{
                          padding: '12px 16px',
                          cursor: 'pointer',
                          background: isActive ? '#e6f4ff' : 'transparent',
                          borderRight: isActive
                            ? '3px solid #1677ff'
                            : '3px solid transparent',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 4
                          }}
                        >
                          <Typography.Text
                            strong={isActive}
                            style={{ color: isActive ? '#1677ff' : 'inherit' }}
                          >
                            {role.name}
                          </Typography.Text>
                          {role.is_builtin && (
                            <Tag
                              color="gold"
                              style={{ margin: 0, border: 'none' }}
                            >
                              内置
                            </Tag>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                          {role.code}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 右侧：权限配置详情 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {selectedRole ? (
              <>
                {/* 头部信息 */}
                <div
                  style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexShrink: 0
                  }}
                >
                  <div>
                    <Typography.Title
                      level={4}
                      style={{ margin: 0, marginBottom: 8 }}
                    >
                      <SafetyCertificateOutlined
                        style={{ marginRight: 8, color: '#1677ff' }}
                      />
                      {selectedRole.name}
                    </Typography.Title>
                    <Space size="large" style={{ color: '#595959' }}>
                      <span>编码：{selectedRole.code}</span>
                      <span>作用域：{selectedRole.scope_kind}</span>
                      {/* @ts-expect-error type */}
                      {selectedRole.introduction && (
                        <span>说明：{selectedRole.introduction}</span>
                      )}
                      {selectedRole.auto_grant_new_permissions ? (
                        <Tag color="blue">自动接收新增权限</Tag>
                      ) : null}
                      {selectedRole.is_default_member_role ? (
                        <Tag color="green">默认新用户角色</Tag>
                      ) : null}
                    </Space>
                  </div>
                  {canManageRoles && selectedRole.is_editable && (
                    <Space>
                      <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEditClick(selectedRole)}
                      >
                        编辑基本信息
                      </Button>
                      <Popconfirm
                        title="确定要删除该角色吗？"
                        onConfirm={() =>
                          deleteMutation.mutate(selectedRole.code)
                        }
                        okText="删除"
                        okButtonProps={{ danger: true }}
                      >
                        <Button danger icon={<DeleteOutlined />}>
                          删除角色
                        </Button>
                      </Popconfirm>
                    </Space>
                  )}
                </div>

                {/* 权限多 Tab 配置 */}
                <div
                  style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}
                >
                  {permissionsQuery.isLoading ||
                  rolePermissionsQuery.isLoading ? (
                    <div style={{ padding: 32, textAlign: 'center' }}>
                      加载权限数据中...
                    </div>
                  ) : (
                    <Tabs
                      defaultActiveKey={TAB_ORDER[0]}
                      items={tabsData.map((tab) => ({
                        key: tab.key,
                        label: tab.label,
                        children: (
                          <div style={{ paddingBottom: 32 }}>
                            <Tree
                              checkable
                              disabled={
                                !canManageRoles || !selectedRole.is_editable
                              }
                              checkedKeys={localCheckedCodes.filter((code) =>
                                tab.tabLeafKeys.includes(code)
                              )}
                              onCheck={(checkedKeysValue) => {
                                const keys = Array.isArray(checkedKeysValue)
                                  ? checkedKeysValue
                                  : checkedKeysValue.checked;
                                const newlyCheckedLeaves = keys
                                  .map(String)
                                  .filter((k) => !k.startsWith('resource:'));

                                const otherCheckedCodes =
                                  localCheckedCodes.filter(
                                    (c) => !tab.tabLeafKeys.includes(c)
                                  );
                                const newCodes = [
                                  ...otherCheckedCodes,
                                  ...newlyCheckedLeaves
                                ];

                                setLocalCheckedCodes(newCodes);
                                replacePermissionsMutation.mutate(newCodes);
                              }}
                              treeData={tab.treeData}
                              defaultExpandAll={false}
                            />
                          </div>
                        )
                      }))}
                    />
                  )}
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  color: '#bfbfbf'
                }}
              >
                <Space direction="vertical" align="center">
                  <TeamOutlined style={{ fontSize: 48 }} />
                  <Typography.Text type="secondary">
                    请在左侧选择一个角色查看详情
                  </Typography.Text>
                </Space>
              </div>
            )}
          </div>
        </div>

        <Modal
          title="新建角色"
          open={isCreateModalOpen}
          onCancel={() => {
            setIsCreateModalOpen(false);
            createForm.resetFields();
          }}
          onOk={() => createForm.submit()}
          confirmLoading={createMutation.isPending}
          destroyOnHidden
        >
          <Form
            form={createForm}
            layout="vertical"
            onFinish={(values) => createMutation.mutate(values)}
            initialValues={{
              auto_grant_new_permissions: false,
              is_default_member_role: false
            }}
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
              <Input.TextArea
                placeholder="简要描述该角色的职责和适用范围"
                rows={3}
              />
            </Form.Item>
            <Form.Item
              name="auto_grant_new_permissions"
              valuePropName="checked"
              extra="开启后，仅对未来新增的权限自动授予当前角色。"
            >
              <Checkbox>自动接收后续新增权限</Checkbox>
            </Form.Item>
            <Form.Item
              name="is_default_member_role"
              valuePropName="checked"
              extra="同一工作空间只能有一个默认新用户角色。"
            >
              <Checkbox>默认新用户角色</Checkbox>
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="编辑角色"
          open={!!editingRole}
          onCancel={() => setEditingRole(null)}
          onOk={() => editForm.submit()}
          confirmLoading={updateMutation.isPending}
          destroyOnHidden
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
            <Form.Item
              name="auto_grant_new_permissions"
              valuePropName="checked"
              extra="开启后，仅对未来新增的权限自动授予当前角色。"
            >
              <Checkbox>自动接收后续新增权限</Checkbox>
            </Form.Item>
            <Form.Item
              name="is_default_member_role"
              valuePropName="checked"
              extra="同一工作空间只能有一个默认新用户角色。"
            >
              <Checkbox>默认新用户角色</Checkbox>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </SettingsSectionSurface>
  );
}
