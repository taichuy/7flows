import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

import { useAuthStore } from '../../../state/auth-store';
import {
  deleteSettingsFileStorage,
  deleteSettingsFileTable,
  fetchSettingsFileStorages,
  fetchSettingsFileTables,
  settingsFileStoragesQueryKey,
  settingsFileTablesQueryKey,
  updateSettingsFileTableBinding,
  type SettingsFileStorage,
  type SettingsFileTable
} from '../api/file-management';
import { FileStorageDrawer } from './FileStorageDrawer';
import { FileTableDrawer } from './FileTableDrawer';
import './file-management-panel.css';

interface FileManagementPanelProps {
  isRoot: boolean;
  canViewTables: boolean;
  canCreateTables: boolean;
}

type DrawerMode = 'create' | 'view' | 'edit';

type StorageDrawerState =
  | { open: false; mode: null; record: null }
  | { open: true; mode: DrawerMode; record: SettingsFileStorage | null };

type TableDrawerState =
  | { open: false; mode: null; record: null }
  | { open: true; mode: DrawerMode; record: SettingsFileTable | null };

function getHealthStatusMeta(status: string) {
  switch (status) {
    case 'ready':
      return { color: 'green', label: 'ready' };
    case 'failed':
      return { color: 'red', label: 'failed' };
    default:
      return { color: 'default', label: status || 'unknown' };
  }
}

export function FileManagementPanel({
  isRoot,
  canViewTables,
  canCreateTables
}: FileManagementPanelProps) {
  const csrfToken = useAuthStore((state) => state.csrfToken);

  const [storageSearch, setStorageSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [storageDrawer, setStorageDrawer] = useState<StorageDrawerState>({
    open: false,
    mode: null,
    record: null
  });
  const [tableDrawer, setTableDrawer] = useState<TableDrawerState>({
    open: false,
    mode: null,
    record: null
  });

  const {
    data: storages = [],
    isLoading: storagesLoading,
    refetch: refetchStorages
  } = useQuery({
    queryKey: settingsFileStoragesQueryKey,
    queryFn: fetchSettingsFileStorages,
    enabled: isRoot
  });

  const {
    data: tables = [],
    isLoading: tablesLoading,
    refetch: refetchTables
  } = useQuery({
    queryKey: settingsFileTablesQueryKey,
    queryFn: fetchSettingsFileTables,
    enabled: canViewTables
  });

  const filteredStorages = useMemo(
    () =>
      storages.filter((storage) => {
        const keyword = storageSearch.trim().toLowerCase();

        return (
          keyword.length === 0 ||
          storage.code.toLowerCase().includes(keyword) ||
          storage.title.toLowerCase().includes(keyword)
        );
      }),
    [storages, storageSearch]
  );

  const filteredTables = useMemo(
    () =>
      tables.filter((table) => {
        const keyword = tableSearch.trim().toLowerCase();

        return (
          keyword.length === 0 ||
          table.code.toLowerCase().includes(keyword) ||
          table.title.toLowerCase().includes(keyword)
        );
      }),
    [tables, tableSearch]
  );

  const ensureCsrfToken = () => {
    if (!csrfToken) {
      throw new Error('missing csrf token');
    }

    return csrfToken;
  };

  const handleDeleteStorage = (record: SettingsFileStorage) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除存储配置 "${record.title}" (${record.code}) 吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteSettingsFileStorage(record.id, ensureCsrfToken());
          message.success('存储配置已删除');
          await refetchStorages();
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : '删除失败，请重试'
          );
        }
      }
    });
  };

  const handleDeleteTable = (record: SettingsFileTable) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除文件表 "${record.title}" (${record.code}) 吗？此操作不可撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteSettingsFileTable(record.id, ensureCsrfToken());
          message.success('文件表已删除');
          await refetchTables();
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : '删除失败，请重试'
          );
        }
      }
    });
  };

  const handleUpdateBinding = async (tableId: string, storageId: string) => {
    await updateSettingsFileTableBinding(
      tableId,
      { bound_storage_id: storageId },
      ensureCsrfToken()
    );
  };

  const storageColumns: ColumnsType<SettingsFileStorage> = [
    {
      title: '标识',
      dataIndex: 'code',
      key: 'code',
      width: 160
    },
    {
      title: '名称',
      dataIndex: 'title',
      key: 'title',
      width: 180
    },
    {
      title: '驱动',
      dataIndex: 'driver_type',
      key: 'driver_type',
      width: 120,
      render: (driverType: string) => <Tag>{driverType}</Tag>
    },
    {
      title: '默认',
      dataIndex: 'is_default',
      key: 'is_default',
      width: 90,
      render: (value: boolean) =>
        value ? <Tag color="green">是</Tag> : <Tag>否</Tag>
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (value: boolean) =>
        value ? <Tag color="blue">是</Tag> : <Tag color="default">否</Tag>
    },
    {
      title: '健康状态',
      dataIndex: 'health_status',
      key: 'health_status',
      width: 120,
      render: (status: string) => {
        const meta = getHealthStatusMeta(status);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_value, record) => (
        <Space size="small">
          <Tooltip title="查看">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() =>
                setStorageDrawer({ open: true, mode: 'view', record })
              }
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() =>
                setStorageDrawer({ open: true, mode: 'edit', record })
              }
            >
              编辑
            </Button>
          </Tooltip>
          <Tooltip title={record.is_default ? '默认存储不可删除' : '删除'}>
            <Button
              type="link"
              size="small"
              danger
              disabled={record.is_default}
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteStorage(record)}
            >
              删除
            </Button>
          </Tooltip>
        </Space>
      )
    }
  ];

  const tableColumns: ColumnsType<SettingsFileTable> = [
    {
      title: '标识',
      dataIndex: 'code',
      key: 'code',
      width: 160
    },
    {
      title: '名称',
      dataIndex: 'title',
      key: 'title',
      width: 180
    },
    {
      title: '作用域',
      dataIndex: 'scope_kind',
      key: 'scope_kind',
      width: 120,
      render: (scopeKind: string) => <Tag>{scopeKind}</Tag>
    },
    {
      title: '绑定存储',
      dataIndex: 'bound_storage_title',
      key: 'bound_storage_title',
      width: 220,
      render: (title: string | null, record) => {
        if (title) {
          return title;
        }

        return (
          <Tag color="orange">
            {record.bound_storage_id ? '未命名存储' : '未绑定'}
          </Tag>
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'default'}>{status}</Tag>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: isRoot ? 220 : 96,
      render: (_value, record) => (
        <Space size="small">
          <Tooltip title="查看">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() =>
                setTableDrawer({ open: true, mode: 'view', record })
              }
            >
              查看
            </Button>
          </Tooltip>
          {isRoot ? (
            <Tooltip title="编辑">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() =>
                  setTableDrawer({ open: true, mode: 'edit', record })
                }
              >
                编辑
              </Button>
            </Tooltip>
          ) : null}
          {isRoot ? (
            <Tooltip title={record.is_builtin ? '内置文件表不可删除' : '删除'}>
              <Button
                type="link"
                size="small"
                danger
                disabled={record.is_builtin}
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteTable(record)}
              >
                删除
              </Button>
            </Tooltip>
          ) : null}
        </Space>
      )
    }
  ];

  const showCreateOnlyTable = !canViewTables && canCreateTables;

  const storagePanel = (
    <div className="fm-tab-panel">
      <div className="fm-tab-toolbar">
        <div className="fm-toolbar">
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setStorageDrawer({ open: true, mode: 'create', record: null })
            }
          >
            新增
          </Button>
          <Tooltip title="刷新">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => refetchStorages()}
            />
          </Tooltip>
          <Input.Search
            allowClear
            value={storageSearch}
            placeholder="搜索存储..."
            size="small"
            style={{ width: 220 }}
            onChange={(event) => setStorageSearch(event.target.value)}
          />
        </div>
      </div>

      <Table
        rowKey="id"
        size="small"
        pagination={false}
        loading={storagesLoading}
        columns={storageColumns}
        dataSource={filteredStorages}
      />
    </div>
  );

  const tablePanel = (
    <div className="fm-tab-panel">
      <div className="fm-tab-toolbar">
        <div className="fm-toolbar">
          {canCreateTables ? (
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={() =>
                setTableDrawer({ open: true, mode: 'create', record: null })
              }
            >
              新增
            </Button>
          ) : null}
          <Tooltip title="刷新">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => refetchTables()}
            />
          </Tooltip>
          <Input.Search
            allowClear
            value={tableSearch}
            placeholder="搜索文件表..."
            size="small"
            style={{ width: 220 }}
            onChange={(event) => setTableSearch(event.target.value)}
          />
        </div>
      </div>

      <Table
        rowKey="id"
        size="small"
        pagination={false}
        loading={tablesLoading}
        columns={tableColumns}
        dataSource={filteredTables}
      />
    </div>
  );

  const managementTabs = [
    ...(isRoot
      ? [{ key: 'storages', label: '存储配置', children: storagePanel }]
      : []),
    ...(canViewTables
      ? [{ key: 'tables', label: '文件表', children: tablePanel }]
      : [])
  ];

  return (
    <div className="file-management-panel">
      <div className="file-management-header">
        <h2>文件管理</h2>
        <p className="file-management-desc">
          管理系统中的文件存储与文件表配置。
        </p>
      </div>

      {managementTabs.length > 0 ? (
        <section className="fm-section fm-tabs-section">
          <Tabs items={managementTabs} />
        </section>
      ) : null}

      {showCreateOnlyTable ? (
        <section className="fm-section">
          <div className="fm-section-header">
            <h3>文件表</h3>
            <div className="fm-toolbar">
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() =>
                  setTableDrawer({ open: true, mode: 'create', record: null })
                }
              >
                新增
              </Button>
            </div>
          </div>
          <p className="fm-create-only-info">
            暂无权限查看文件表列表，您可以创建一个新文件表。
          </p>
        </section>
      ) : null}

      <FileStorageDrawer
        open={storageDrawer.open}
        mode={storageDrawer.mode ?? 'create'}
        record={storageDrawer.record}
        onClose={() =>
          setStorageDrawer({ open: false, mode: null, record: null })
        }
        onSuccess={() => {
          refetchStorages();
        }}
      />

      <FileTableDrawer
        open={tableDrawer.open}
        mode={tableDrawer.mode ?? 'create'}
        record={tableDrawer.record}
        storages={storages}
        onClose={() =>
          setTableDrawer({ open: false, mode: null, record: null })
        }
        onSuccess={() => {
          refetchTables();
        }}
        onUpdateBinding={handleUpdateBinding}
      />
    </div>
  );
}
