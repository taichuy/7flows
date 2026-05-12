import { useCallback, useMemo, useState } from 'react';

import { ApiDocsExplorer } from '../../../../shared/ui/api-docs/ApiDocsExplorer';
import { getApplicationsApiBaseUrl } from '../../api/applications';
import {
  applicationApiDocsCatalogQueryKey,
  applicationApiDocsCategoryOperationsQueryKey,
  applicationApiDocsOperationSpecQueryKey,
  fetchApplicationApiDocsCatalog,
  fetchApplicationApiDocsCategoryOperations,
  fetchApplicationApiDocsOperationSpec,
  getApplicationApiDocsLocale
} from '../../api/public-api';

export function ApplicationApiDocsPanel({
  applicationId
}: {
  applicationId: string;
}) {
  const docsLocale = useMemo(() => getApplicationApiDocsLocale(), []);
  const [queryState, setQueryState] = useState<{
    categoryId: string | null;
    operationId: string | null;
  }>({ categoryId: null, operationId: null });
  const handleQueryStateChange = useCallback(
    (nextState: { categoryId: string | null; operationId: string | null }) =>
      setQueryState(nextState),
    []
  );

  return (
    <section className="application-api-panel">
      <ApiDocsExplorer
        queryState={queryState}
        onQueryStateChange={handleQueryStateChange}
        catalogQueryKey={applicationApiDocsCatalogQueryKey(
          applicationId,
          docsLocale
        )}
        fetchCatalog={() =>
          fetchApplicationApiDocsCatalog(applicationId, docsLocale)
        }
        categoryOperationsQueryKey={(categoryId) =>
          applicationApiDocsCategoryOperationsQueryKey(
            applicationId,
            categoryId,
            docsLocale
          )
        }
        fetchCategoryOperations={(categoryId) =>
          fetchApplicationApiDocsCategoryOperations(
            applicationId,
            categoryId,
            docsLocale
          )
        }
        operationSpecQueryKey={(operationId) =>
          applicationApiDocsOperationSpecQueryKey(
            applicationId,
            operationId,
            docsLocale
          )
        }
        fetchOperationSpec={(operationId) =>
          fetchApplicationApiDocsOperationSpec(
            applicationId,
            operationId,
            docsLocale
          )
        }
        baseServerUrl={getApplicationsApiBaseUrl}
        showAllOperationsWhenNoCategory
      />
    </section>
  );
}
