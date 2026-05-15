import { Button } from 'antd';
import { useMemo } from 'react';
import type { ReactNode } from 'react';

import {
  DataTable,
  DataTableColumnSettings,
  type DataTableColumn
} from '../../../../shared/ui/data-table/DataTable';
import type { ApplicationRunSummary } from '../../api/runtime';
import { APPLICATION_RUNS_TABLE_COLUMNS } from './application-runs-table-columns';
import type { ApplicationRunsTableConfiguration } from './useApplicationRunsTableConfiguration';

export function ApplicationRunsTableColumnSettings({
  configuration
}: {
  configuration: ApplicationRunsTableConfiguration;
}) {
  return (
    <DataTableColumnSettings<ApplicationRunSummary>
      className="application-runs-table__column-selector"
      columns={APPLICATION_RUNS_TABLE_COLUMNS}
      configuration={configuration}
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
  const tableColumns = useMemo<Array<DataTableColumn<ApplicationRunSummary>>>(
    () =>
      APPLICATION_RUNS_TABLE_COLUMNS.map((column) => {
        if (column.key !== 'action') {
          return column;
        }

        return {
          ...column,
          render: (_value: unknown, run: ApplicationRunSummary): ReactNode => (
            <Button type="link" onClick={() => onSelectRun(run.id)}>
              查看运行详情
            </Button>
          )
        };
      }),
    [onSelectRun]
  );

  return (
    <DataTable<ApplicationRunSummary>
      className="application-runs-table"
      columns={tableColumns}
      configuration={configuration}
      dataSource={runs}
      loading={loading}
      page={page}
      pageSize={pageSize}
      rowClassName={(record) =>
        record.id === selectedRunId ? 'application-runs-table__row--active' : ''
      }
      rowKey="id"
      total={total}
      onPageChange={onPageChange}
    />
  );
}
