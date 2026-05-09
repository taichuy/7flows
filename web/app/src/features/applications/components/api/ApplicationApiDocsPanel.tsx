import { useCallback, useState } from 'react';

import { Alert, Space, Typography } from 'antd';

import { ApiDocsExplorer } from '../../../../shared/ui/api-docs/ApiDocsExplorer';
import { getApplicationsApiBaseUrl } from '../../api/applications';
import {
  applicationApiDocsCatalogQueryKey,
  applicationApiDocsCategoryOperationsQueryKey,
  applicationApiDocsOperationSpecQueryKey,
  fetchApplicationApiDocsCatalog,
  fetchApplicationApiDocsCategoryOperations,
  fetchApplicationApiDocsOperationSpec,
  type ApplicationApiPublication
} from '../../api/public-api';

export function ApplicationApiDocsPanel({
  applicationId,
  applicationName,
  publication,
  defaultCategoryId
}: {
  applicationId: string;
  applicationName: string;
  publication: ApplicationApiPublication | null;
  defaultCategoryId: string;
}) {
  const [queryState, setQueryState] = useState<{
    categoryId: string | null;
    operationId: string | null;
  }>({ categoryId: defaultCategoryId, operationId: null });
  const handleQueryStateChange = useCallback(
    (nextState: { categoryId: string | null; operationId: string | null }) =>
      setQueryState(nextState),
    []
  );

  return (
    <section className="application-api-panel">
      <Space direction="vertical" size={12} className="application-api-docs-head">
        <Typography.Title level={4}>{applicationName} API 文档</Typography.Title>
        <Alert
          type={publication?.api_enabled ? 'success' : 'warning'}
          showIcon
          message={
            publication
              ? `active publication v${publication.version_sequence}`
              : '尚未发布公开 API'
          }
          description="OpenAI 与 Anthropic 兼容端点当前只支持 text-chat 子集；tools、文件/图片块和等待态恢复请使用 Native API。"
        />
      </Space>
      <ApiDocsExplorer
        queryState={queryState}
        onQueryStateChange={handleQueryStateChange}
        catalogQueryKey={applicationApiDocsCatalogQueryKey(applicationId)}
        fetchCatalog={() => fetchApplicationApiDocsCatalog(applicationId)}
        categoryOperationsQueryKey={(categoryId) =>
          applicationApiDocsCategoryOperationsQueryKey(applicationId, categoryId)
        }
        fetchCategoryOperations={(categoryId) =>
          fetchApplicationApiDocsCategoryOperations(applicationId, categoryId)
        }
        operationSpecQueryKey={(operationId) =>
          applicationApiDocsOperationSpecQueryKey(applicationId, operationId)
        }
        fetchOperationSpec={(operationId) =>
          fetchApplicationApiDocsOperationSpec(applicationId, operationId)
        }
        baseServerUrl={getApplicationsApiBaseUrl}
      />
    </section>
  );
}
