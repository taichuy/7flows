import {
  type DataTableConfiguration,
  usePersistedDataTableConfiguration
} from '../../../../shared/ui/data-table/data-table-state';
import type { ApplicationRunSummary } from '../../api/runtime';
import { APPLICATION_RUNS_TABLE_COLUMNS } from './application-runs-table-columns';

const LOCAL_STORAGE_PREFIX = 'applicationLogsRunsTableState';

export type ApplicationRunsTableConfiguration = DataTableConfiguration;

function getStorageKey(applicationId: string) {
  return `${LOCAL_STORAGE_PREFIX}:${applicationId}`;
}

export function useApplicationRunsTableConfiguration(
  applicationId: string
): ApplicationRunsTableConfiguration {
  return usePersistedDataTableConfiguration<ApplicationRunSummary>({
    columns: APPLICATION_RUNS_TABLE_COLUMNS,
    storageKey: getStorageKey(applicationId)
  });
}
