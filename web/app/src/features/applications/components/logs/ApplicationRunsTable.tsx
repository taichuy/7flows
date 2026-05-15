import {
  CheckOutlined,
  DownOutlined,
  SettingOutlined
} from '@ant-design/icons';
import { Button, Pagination, Select, Table, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type {
  Dispatch,
  MouseEvent,
  ReactNode,
  SetStateAction,
  ThHTMLAttributes
} from 'react';
import type { ColumnsType } from 'antd/es/table';

import type { ApplicationRunSummary } from '../../api/runtime';

const STATUS_COLOR: Record<string, string> = {
  succeeded: 'green',
  failed: 'red',
  running: 'blue',
  waiting_human: 'gold',
  waiting_callback: 'orange'
};

const MIN_COLUMN_WIDTH = 110;
const LOCAL_STORAGE_PREFIX = 'applicationLogsRunsTableState';

type RunsTableField = {
  key: string;
  title: string;
  width: number;
  dataIndex?: keyof ApplicationRunSummary;
  render?: (value: unknown, run: ApplicationRunSummary) => ReactNode;
  ellipsis?: boolean;
};

type RunsTableState = {
  visibleColumnKeys: string[];
  columnWidths: Record<string, number>;
};

export type ApplicationRunsTableConfiguration = {
  visibleColumnKeys: string[];
  columnWidths: Record<string, number>;
  setVisibleColumnKeys: Dispatch<SetStateAction<string[]>>;
  setColumnWidths: Dispatch<SetStateAction<Record<string, number>>>;
};

const TABLE_COLUMNS: RunsTableField[] = [
  {
    key: 'title',
    title: '标题',
    dataIndex: 'title',
    width: 240,
    ellipsis: true,
    render: (value) => value ? `${value}` : '-'
  },
  {
    key: 'expand_id',
    title: 'expand_id',
    dataIndex: 'expand_id',
    width: 180,
    ellipsis: true,
    render: (value) => value ? `${value}` : '-'
  },
  {
    key: 'authorized_account',
    title: '授权人',
    dataIndex: 'authorized_account',
    width: 160,
    ellipsis: true,
    render: (value) => value ? `${value}` : '-'
  },
  {
    key: 'id',
    title: '运行 ID',
    dataIndex: 'id',
    width: 180,
    ellipsis: true
  },
  {
    key: 'run_mode',
    title: '模式',
    dataIndex: 'run_mode',
    width: 180
  },
  {
    key: 'target_node_id',
    title: '目标节点',
    dataIndex: 'target_node_id',
    width: 160,
    render: (value) => typeof value === 'string' && value ? value : '全流'
  },
  {
    key: 'status',
    title: '状态',
    width: 120,
    render: (_: unknown, run) => (
      <Tag color={STATUS_COLOR[run.status] ?? 'default'}>{run.status}</Tag>
    )
  },
  {
    key: 'started_at',
    title: '开始时间',
    dataIndex: 'started_at',
    width: 200,
    render: (value) => formatTimestamp(typeof value === 'string' ? value : null)
  },
  {
    key: 'updated_at',
    title: '更新时间',
    dataIndex: 'updated_at',
    width: 200,
    render: (value) => formatTimestamp(typeof value === 'string' ? value : null)
  },
  {
    key: 'action',
    title: '操作',
    width: 140
  }
];

const DEFAULT_VISIBLE_KEYS = TABLE_COLUMNS.map((column) => column.key);
const DEFAULT_COLUMN_WIDTHS = TABLE_COLUMNS.reduce<Record<string, number>>(
  (acc, column) => {
    acc[column.key] = column.width;

    return acc;
  },
  {}
);
function getStorageKey(applicationId: string) {
  return `${LOCAL_STORAGE_PREFIX}:${applicationId}`;
}

function readStoredState(applicationId: string): RunsTableState {
  if (typeof window === 'undefined') {
    return {
      visibleColumnKeys: DEFAULT_VISIBLE_KEYS,
      columnWidths: DEFAULT_COLUMN_WIDTHS
    };
  }

  const payload = window.localStorage.getItem(getStorageKey(applicationId));

  if (!payload) {
    return {
      visibleColumnKeys: DEFAULT_VISIBLE_KEYS,
      columnWidths: DEFAULT_COLUMN_WIDTHS
    };
  }

  try {
    const parsed = JSON.parse(payload) as Partial<RunsTableState>;
    const visibleKeys = Array.isArray(parsed.visibleColumnKeys)
      ? parsed.visibleColumnKeys.filter((key) =>
          TABLE_COLUMNS.some((column) => column.key === key)
        )
      : DEFAULT_VISIBLE_KEYS;
    const normalizedVisibleKeys = visibleKeys.length
      ? visibleKeys
      : DEFAULT_VISIBLE_KEYS;
    const parsedWidths =
      parsed.columnWidths && typeof parsed.columnWidths === 'object'
        ? (parsed.columnWidths as Record<string, unknown>)
        : {};
    const columnWidths = { ...DEFAULT_COLUMN_WIDTHS };

    TABLE_COLUMNS.forEach((column) => {
      const storedWidth = parsedWidths[column.key];

      if (
        typeof storedWidth === 'number' &&
        Number.isFinite(storedWidth) &&
        storedWidth >= MIN_COLUMN_WIDTH
      ) {
        columnWidths[column.key] = storedWidth;
      }
    });

    return {
      visibleColumnKeys: normalizedVisibleKeys,
      columnWidths
    };
  } catch {
    return {
      visibleColumnKeys: DEFAULT_VISIBLE_KEYS,
      columnWidths: DEFAULT_COLUMN_WIDTHS
    };
  }
}

function writeStoredState(applicationId: string, state: RunsTableState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    getStorageKey(applicationId),
    JSON.stringify(state)
  );
}

export function useApplicationRunsTableConfiguration(
  applicationId: string
): ApplicationRunsTableConfiguration {
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => {
    return readStoredState(applicationId).visibleColumnKeys;
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    return readStoredState(applicationId).columnWidths;
  });

  useEffect(() => {
    const state = readStoredState(applicationId);

    setVisibleColumnKeys(state.visibleColumnKeys);
    setColumnWidths(state.columnWidths);
  }, [applicationId]);

  useEffect(() => {
    writeStoredState(applicationId, {
      visibleColumnKeys,
      columnWidths
    });
  }, [applicationId, visibleColumnKeys, columnWidths]);

  return {
    visibleColumnKeys,
    columnWidths,
    setVisibleColumnKeys,
    setColumnWidths
  };
}

type ResizeHeaderCellProps = ThHTMLAttributes<HTMLElement> & {
  onResizeMouseDown?: (event: MouseEvent<HTMLElement>) => void;
};

function ResizeHeaderCell({
  className,
  children,
  onResizeMouseDown,
  ...rest
}: ResizeHeaderCellProps) {
  return (
    <th
      {...rest}
      className={`application-runs-table__header-cell ${className ?? ''}`}
    >
      <span className="application-runs-table__header-title">{children}</span>
      <span
        aria-hidden="true"
        className="application-runs-table__header-resize-handle"
        onMouseDown={onResizeMouseDown}
      />
    </th>
  );
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function ApplicationRunsTableColumnSettings({
  configuration
}: {
  configuration: ApplicationRunsTableConfiguration;
}) {
  const {
    visibleColumnKeys,
    setVisibleColumnKeys,
    setColumnWidths
  } = configuration;

  function handleColumnsChange(nextVisible: string[]) {
    if (nextVisible.length === 0) {
      return;
    }

    const columnKeys = TABLE_COLUMNS.map((column) => column.key);
    const next = columnKeys.filter((columnKey) =>
      nextVisible.includes(columnKey)
    );

    setVisibleColumnKeys(next);
  }

  const columnSelectOptions = TABLE_COLUMNS.map((column) => ({
    label: column.title,
    value: column.key,
    disabled:
      visibleColumnKeys.length === 1 && visibleColumnKeys.includes(column.key)
  }));

  return (
    <Select<string[]>
      aria-label="字段配置"
      className="application-runs-table__column-selector"
      classNames={{
        popup: {
          root: 'application-runs-table__column-selector-popup'
        }
      }}
      maxTagCount={0}
      maxTagPlaceholder={() => '字段配置'}
      mode="multiple"
      optionFilterProp="label"
      options={columnSelectOptions}
      placement="bottomRight"
      popupMatchSelectWidth={220}
      prefix={<SettingOutlined aria-hidden="true" />}
      size="small"
      suffixIcon={
        <DownOutlined
          aria-hidden="true"
          className="application-runs-table__column-selector-trigger-caret"
        />
      }
      value={visibleColumnKeys}
      virtual={false}
      popupRender={(originNode) => (
        <div>
          {originNode}
          <div className="application-runs-table__column-selector-footer">
            <Button
              block
              icon={<CheckOutlined aria-hidden="true" />}
              size="small"
              type="text"
              onClick={() => {
                setVisibleColumnKeys(DEFAULT_VISIBLE_KEYS);
                setColumnWidths(DEFAULT_COLUMN_WIDTHS);
              }}
            >
              重置默认字段
            </Button>
          </div>
        </div>
      )}
      onChange={handleColumnsChange}
    />
  );
}

export function ApplicationRunsTable({
  loading = false,
  page,
  pageSize,
  total,
  runs,
  selectedRunId,
  configuration,
  onPageChange,
  onSelectRun
}: {
  loading?: boolean;
  page: number;
  pageSize: number;
  total: number;
  runs: ApplicationRunSummary[];
  selectedRunId?: string | null;
  configuration: ApplicationRunsTableConfiguration;
  onPageChange: (page: number) => void;
  onSelectRun: (runId: string) => void;
}) {
  const { visibleColumnKeys, columnWidths, setColumnWidths } = configuration;

  function startResize(columnKey: string, startWidth: number, event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();

    const initialX = event.clientX;
    const start = Math.max(MIN_COLUMN_WIDTH, startWidth);

    function onMouseMove(mouseEvent: globalThis.MouseEvent) {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH,
        Math.round(start + (mouseEvent.clientX - initialX))
      );

      setColumnWidths((current) => {
        if (current[columnKey] === nextWidth) {
          return current;
        }

        return {
          ...current,
          [columnKey]: nextWidth
        };
      });
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  const appliedVisibleColumnKeys = useMemo(() => {
    return TABLE_COLUMNS.map((column) => column.key).filter((key) =>
      visibleColumnKeys.includes(key)
    );
  }, [visibleColumnKeys]);

  const tableColumns = useMemo<ColumnsType<ApplicationRunSummary>>(() => {
    const visibleFields = TABLE_COLUMNS.filter((column) =>
      appliedVisibleColumnKeys.includes(column.key)
    );

    return visibleFields.map((column) => {
      const width =
        columnWidths[column.key] &&
        columnWidths[column.key] >= MIN_COLUMN_WIDTH
          ? columnWidths[column.key]
          : column.width;
      const isActionColumn = column.key === 'action';

      return {
        key: column.key,
        title: column.title,
        dataIndex: column.dataIndex,
        width,
        ellipsis: column.ellipsis,
        render: (value: unknown, run: ApplicationRunSummary) => {
          if (isActionColumn) {
            return (
              <Button type="link" onClick={() => onSelectRun(run.id)}>
                查看运行详情
              </Button>
            );
          }

          if (column.render) {
            return column.render(value, run);
          }

          return (value as string | null | number) ?? '-';
        },
        onHeaderCell: () => ({
          onResizeMouseDown: (event: MouseEvent<HTMLElement>) =>
            startResize(column.key, width, event),
          width
        }) as ResizeHeaderCellProps
      };
    });
  }, [columnWidths, appliedVisibleColumnKeys, startResize]);

  const fixedTableWidth = useMemo(() => {
    return tableColumns.reduce((sum, column) => {
      const fixedWidth =
        typeof column.width === 'number' ? column.width : MIN_COLUMN_WIDTH;

      return sum + fixedWidth;
    }, 0);
  }, [tableColumns]);

  return (
    <section className="application-runs-table">
      <div className="application-runs-table__scroll-area">
        <Table<ApplicationRunSummary>
          rowKey="id"
          dataSource={runs}
          loading={loading}
          style={{ minWidth: fixedTableWidth }}
          tableLayout="fixed"
          components={{
            header: {
              cell: ResizeHeaderCell
            }
          }}
          pagination={false}
          rowClassName={(record) =>
            record.id === selectedRunId ? 'application-runs-table__row--active' : ''
          }
          columns={tableColumns}
        />
      </div>
      <Pagination
        className="application-runs-table__pagination"
        current={page}
        pageSize={pageSize}
        total={total}
        showSizeChanger={false}
        showTotal={(paginationTotal) => `共 ${paginationTotal} 条`}
        onChange={onPageChange}
      />
    </section>
  );
}
