import { useEffect, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Result, Tabs } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { applicationDetailQueryKey, type ApplicationDetail } from '../api/applications';
import {
  applicationApiMappingQueryKey,
  applicationApiPublicationQueryKey,
  fetchApplicationApiMapping,
  fetchApplicationApiPublication,
  publishApplicationApiVersion,
  setApplicationApiEnabled
} from '../api/public-api';
import { ApplicationApiDocsPanel } from '../components/api/ApplicationApiDocsPanel';
import { ApplicationApiKeysPanel } from '../components/api/ApplicationApiKeysPanel';
import { ApplicationApiMappingPanel } from '../components/api/ApplicationApiMappingPanel';
import { ApplicationApiStatusBar } from '../components/api/ApplicationApiStatusBar';
import './application-api-page.css';

export function ApplicationApiPage({
  application
}: {
  application: ApplicationDetail;
}) {
  const csrfToken = useAuthStore((state) => state.csrfToken) ?? '';
  const queryClient = useQueryClient();
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const publicationQuery = useQuery({
    queryKey: applicationApiPublicationQueryKey(application.id),
    queryFn: () => fetchApplicationApiPublication(application.id),
    retry: false
  });
  const mappingQuery = useQuery({
    queryKey: applicationApiMappingQueryKey(application.id),
    queryFn: () => fetchApplicationApiMapping(application.id)
  });
  const publication = publicationQuery.data ?? null;
  const invalidatePublication = () => {
    void queryClient.invalidateQueries({
      queryKey: applicationApiPublicationQueryKey(application.id)
    });
    void queryClient.invalidateQueries({
      queryKey: applicationDetailQueryKey(application.id)
    });
  };
  const publishMutation = useMutation({
    mutationFn: async () => {
      const mapping = mappingQuery.data ?? (await fetchApplicationApiMapping(application.id));
      return publishApplicationApiVersion(application.id, mapping, csrfToken);
    },
    onSuccess: invalidatePublication
  });
  const statusMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setApplicationApiEnabled(application.id, enabled, csrfToken),
    onSuccess: invalidatePublication
  });

  useEffect(() => () => setCreatedToken(null), []);

  if (!publication && publicationQuery.isLoading) {
    return <Result status="info" title="正在加载公开 API 状态" />;
  }

  const tabs = [
    {
      key: 'docs',
      label: 'API 文档',
      children: (
        <ApplicationApiDocsPanel applicationId={application.id} />
      )
    },
    {
      key: 'mapping',
      label: 'Mapping',
      children: (
        <ApplicationApiMappingPanel
          applicationId={application.id}
          csrfToken={csrfToken}
          publication={publication}
        />
      )
    }
  ];

  return (
    <div className="application-api-page">
      <ApplicationApiStatusBar
        publication={publication}
        loading={statusMutation.isPending}
        onToggleEnabled={(enabled) => statusMutation.mutate(enabled)}
      >
        <ApplicationApiKeysPanel
          applicationId={application.id}
          csrfToken={csrfToken}
          onCreatedToken={setCreatedToken}
          variant="embedded"
        />
      </ApplicationApiStatusBar>
      {!publication ? (
        <Alert
          type="warning"
          showIcon
          message="需要先发布公开 API"
          description="发布会保存当前 mapping snapshot，并让 API Key 调用 active publication。"
          action={
            <Button
              type="primary"
              loading={publishMutation.isPending || mappingQuery.isLoading}
              onClick={() => publishMutation.mutate()}
            >
              发布当前版本
            </Button>
          }
        />
      ) : null}
      <Tabs items={tabs} destroyOnHidden={false} />
    </div>
  );
}
