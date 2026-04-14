import { useDeferredValue, useState } from 'react';

import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import { Empty, Input, Result, Spin, Tag, Typography } from 'antd';

import {
  fetchSettingsApiDocsCatalog,
  fetchSettingsApiOperationSpec,
  settingsApiDocsCatalogQueryKey,
  settingsApiDocSpecQueryKey,
  type SettingsApiDocsCatalog
} from '../api/api-docs';
import './api-docs-panel.css';

function groupOperations(catalog: SettingsApiDocsCatalog | undefined, searchValue: string) {
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOperations = (catalog?.operations ?? []).filter((operation) => {
    const haystack = [
      operation.path,
      operation.method,
      operation.summary ?? '',
      operation.id,
      operation.tags.join(' ')
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
  const groups = new Map<string, typeof filteredOperations>();

  filteredOperations.forEach((operation) => {
    const group = operation.group || 'other';

    if (!groups.has(group)) {
      groups.set(group, []);
    }

    groups.get(group)?.push(operation);
  });

  return {
    filteredOperations,
    groups: Array.from(groups.entries())
  };
}

function updateOperationQuery(operationId: string) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('operation', operationId);
  window.history.pushState({}, '', `${nextUrl.pathname}${nextUrl.search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function ApiDocsPanel() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>
  });
  const selectedOperationId =
    typeof locationSearch.operation === 'string' ? locationSearch.operation : null;
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);

  const catalogQuery = useQuery({
    queryKey: settingsApiDocsCatalogQueryKey,
    queryFn: fetchSettingsApiDocsCatalog
  });
  const operationQuery = useQuery({
    queryKey: settingsApiDocSpecQueryKey(selectedOperationId ?? ''),
    queryFn: () => fetchSettingsApiOperationSpec(selectedOperationId!),
    enabled: Boolean(selectedOperationId)
  });
  const { groups } = groupOperations(catalogQuery.data, deferredSearchValue);

  if (catalogQuery.isLoading) {
    return (
      <div className="api-docs-panel__detail-state">
        <Spin size="large" />
        <Typography.Text type="secondary">正在加载接口目录</Typography.Text>
      </div>
    );
  }

  if (catalogQuery.isError) {
    return (
      <Result
        status="error"
        title="接口目录加载失败"
        subTitle="请确认当前账号仍具备 API 文档权限，并稍后重试。"
      />
    );
  }

  function renderDetailPane() {
    if (!selectedOperationId) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="info"
            title="选择一个接口查看详情"
            subTitle="左侧目录只加载摘要信息，点选后再按需拉取当前接口的完整 OpenAPI 文档。"
          />
        </div>
      );
    }

    if (operationQuery.isLoading) {
      return (
        <div className="api-docs-panel__detail-state">
          <Spin size="large" />
          <Typography.Text type="secondary">正在加载接口文档</Typography.Text>
        </div>
      );
    }

    if (operationQuery.isError) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="error"
            title="接口文档加载失败"
            subTitle="当前接口文档未能成功返回，请刷新后重试。"
          />
        </div>
      );
    }

    return (
      <ApiReferenceReact
        configuration={{
          content: operationQuery.data,
          hideClientButton: true,
          hideTestRequestButton: true,
          hiddenClients: true,
          documentDownloadType: 'none'
        }}
      />
    );
  }

  return (
    <div className="api-docs-panel">
      <div className="api-docs-panel__header">
        <div>
          <Typography.Title level={3}>API 文档</Typography.Title>
          <Typography.Paragraph className="api-docs-panel__subtitle">
            文档目录由控制面按权限返回，只在点选接口后再按需请求当前接口的完整 OpenAPI 详情。
          </Typography.Paragraph>
        </div>
        <Typography.Text className="api-docs-panel__count">
          共 {catalogQuery.data?.operations.length ?? 0} 个接口
        </Typography.Text>
      </div>

      <div className="api-docs-panel__body">
        <section className="api-docs-panel__catalog" aria-label="API 文档目录">
          <div className="api-docs-panel__catalog-toolbar">
            <Input
              allowClear
              placeholder="搜索接口"
              prefix={<SearchOutlined />}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
            <Typography.Text type="secondary">
              支持按路径、方法、摘要、标签和 operation id 过滤。
            </Typography.Text>
          </div>

          <div className="api-docs-panel__catalog-list">
            {groups.length === 0 ? (
              <Empty
                className="api-docs-panel__empty"
                description="没有匹配的接口"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              groups.map(([group, operations]) => (
                <div key={group} className="api-docs-panel__catalog-group">
                  <p className="api-docs-panel__catalog-group-title">{group}</p>
                  {operations.map((operation) => (
                    <button
                      key={operation.id}
                      type="button"
                      className="api-docs-panel__catalog-item"
                      data-active={selectedOperationId === operation.id}
                      onClick={() => updateOperationQuery(operation.id)}
                    >
                      <div className="api-docs-panel__catalog-item-header">
                        <span className="api-docs-panel__method">{operation.method}</span>
                        {operation.deprecated ? <Tag color="default">Deprecated</Tag> : null}
                      </div>
                      <div className="api-docs-panel__catalog-item-summary">
                        {operation.summary ?? operation.id}
                      </div>
                      <div className="api-docs-panel__catalog-item-path">{operation.path}</div>
                      <div className="api-docs-panel__catalog-item-meta">
                        <span>{operation.id}</span>
                        {operation.tags.map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="api-docs-panel__detail" aria-label="API 文档详情">
          {renderDetailPane()}
        </section>
      </div>
    </div>
  );
}
