import { useDeferredValue, useEffect, useState } from 'react';

import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { Empty, Input, Result, Select, Spin, Tag, Typography } from 'antd';

import {
  fetchSettingsApiDocsCatalog,
  fetchSettingsApiDocsCategoryOperations,
  fetchSettingsApiOperationSpec,
  settingsApiDocsCatalogQueryKey,
  settingsApiDocsCategoryOperationsQueryKey,
  settingsApiDocSpecQueryKey,
  type SettingsApiDocsCategoryOperations
} from '../api/api-docs';
import './api-docs-panel.css';

function filterOperations(
  operations: SettingsApiDocsCategoryOperations['operations'],
  searchValue: string
) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  return operations.filter((operation) => {
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
}

function updateDocsQuery({
  categoryId,
  operationId,
  mode = 'push'
}: {
  categoryId?: string | null;
  operationId?: string | null;
  mode?: 'push' | 'replace';
}) {
  const nextUrl = new URL(window.location.href);

  if (categoryId) {
    nextUrl.searchParams.set('category', categoryId);
  } else {
    nextUrl.searchParams.delete('category');
  }

  if (operationId) {
    nextUrl.searchParams.set('operation', operationId);
  } else {
    nextUrl.searchParams.delete('operation');
  }

  const nextPath = `${nextUrl.pathname}${nextUrl.search}`;

  if (mode === 'replace') {
    window.history.replaceState({}, '', nextPath);
  } else {
    window.history.pushState({}, '', nextPath);
  }

  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function ApiDocsPanel() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>
  });
  const requestedCategoryId =
    typeof locationSearch.category === 'string' ? locationSearch.category : null;
  const requestedOperationId =
    typeof locationSearch.operation === 'string' ? locationSearch.operation : null;
  const [searchValue, setSearchValue] = useState('');
  const deferredSearchValue = useDeferredValue(searchValue);

  const catalogQuery = useQuery({
    queryKey: settingsApiDocsCatalogQueryKey,
    queryFn: fetchSettingsApiDocsCatalog
  });
  const categories = catalogQuery.data?.categories ?? [];
  const selectedCategoryId =
    categories.find((category) => category.id === requestedCategoryId)?.id ?? categories[0]?.id ?? null;
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const totalOperations = categories.reduce(
    (total, category) => total + category.operation_count,
    0
  );

  useEffect(() => {
    if (!selectedCategoryId || requestedCategoryId === selectedCategoryId) {
      return;
    }

    updateDocsQuery({
      categoryId: selectedCategoryId,
      operationId: requestedOperationId,
      mode: 'replace'
    });
  }, [requestedCategoryId, requestedOperationId, selectedCategoryId]);

  const categoryOperationsQuery = useQuery({
    queryKey: settingsApiDocsCategoryOperationsQueryKey(selectedCategoryId ?? ''),
    queryFn: () => fetchSettingsApiDocsCategoryOperations(selectedCategoryId!),
    enabled: Boolean(selectedCategoryId)
  });
  const selectedOperation =
    categoryOperationsQuery.data?.operations.find(
      (operation) => operation.id === requestedOperationId
    ) ?? null;

  useEffect(() => {
    if (
      !selectedCategoryId ||
      !requestedOperationId ||
      !categoryOperationsQuery.data ||
      selectedOperation
    ) {
      return;
    }

    updateDocsQuery({
      categoryId: selectedCategoryId,
      operationId: null,
      mode: 'replace'
    });
  }, [
    categoryOperationsQuery.data,
    requestedOperationId,
    selectedCategoryId,
    selectedOperation
  ]);

  const operationQuery = useQuery({
    queryKey: settingsApiDocSpecQueryKey(selectedOperation?.id ?? ''),
    queryFn: () => fetchSettingsApiOperationSpec(selectedOperation!.id),
    enabled: Boolean(selectedOperation)
  });
  const filteredOperations = filterOperations(
    categoryOperationsQuery.data?.operations ?? [],
    deferredSearchValue
  );

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
    if (!selectedCategoryId) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="info"
            title="当前暂无可访问接口"
            subTitle="当前账号还没有可展示的 API 文档分类。"
          />
        </div>
      );
    }

    if (requestedOperationId && categoryOperationsQuery.isLoading) {
      return (
        <div className="api-docs-panel__detail-state">
          <Spin size="large" />
          <Typography.Text type="secondary">正在定位接口目录</Typography.Text>
        </div>
      );
    }

    if (!selectedOperation) {
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
      <div className="api-docs-panel__detail-viewer">
        <ApiReferenceReact
          configuration={{
            content: operationQuery.data,
            hideClientButton: true,
            hideTestRequestButton: true,
            hiddenClients: true,
            documentDownloadType: 'none'
          }}
        />
      </div>
    );
  }

  return (
    <div className="api-docs-panel">
      <div className="api-docs-panel__header">
        <div>
          <Typography.Title level={3}>API 文档</Typography.Title>
          <Typography.Paragraph className="api-docs-panel__subtitle">
            先按路径前缀加载接口分类，再在选中分类内按需拉取接口目录与完整 OpenAPI 详情。
          </Typography.Paragraph>
        </div>
        <Typography.Text className="api-docs-panel__count">
          共 {totalOperations} 个接口
        </Typography.Text>
      </div>

      <div className="api-docs-panel__body">
        <section className="api-docs-panel__catalog" aria-label="API 文档目录">
          <div className="api-docs-panel__catalog-toolbar">
            <div className="api-docs-panel__catalog-controls">
              <div className="api-docs-panel__catalog-select">
                <Typography.Text strong>接口分类</Typography.Text>
                <Select
                  aria-label="接口分类"
                  value={selectedCategoryId ?? undefined}
                  placeholder="选择接口分类"
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.label
                  }))}
                  onChange={(nextCategoryId) => {
                    setSearchValue('');
                    updateDocsQuery({
                      categoryId: nextCategoryId,
                      operationId: null
                    });
                  }}
                />
              </div>
              {selectedCategory ? (
                <Typography.Text type="secondary">
                  当前分类 {selectedCategory.operation_count} 个接口
                </Typography.Text>
              ) : null}
            </div>
            <Input
              allowClear
              placeholder="搜索接口"
              prefix={<SearchOutlined />}
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              disabled={!selectedCategoryId}
            />
            <Typography.Text type="secondary">
              支持按路径、方法、摘要、标签和 operation id 过滤。
            </Typography.Text>
          </div>

          <div className="api-docs-panel__catalog-list">
            {!selectedCategoryId ? (
              <Empty
                className="api-docs-panel__empty"
                description="暂无接口分类"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : categoryOperationsQuery.isLoading ? (
              <div className="api-docs-panel__catalog-state">
                <Spin />
                <Typography.Text type="secondary">正在加载分类接口</Typography.Text>
              </div>
            ) : categoryOperationsQuery.isError ? (
              <Result
                status="error"
                title="分类接口加载失败"
                subTitle="当前分类目录未能成功返回，请稍后重试。"
              />
            ) : filteredOperations.length === 0 ? (
              <Empty
                className="api-docs-panel__empty"
                description="没有匹配的接口"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              filteredOperations.map((operation) => (
                <button
                  key={operation.id}
                  type="button"
                  className="api-docs-panel__catalog-item"
                  data-active={selectedOperation?.id === operation.id}
                  onClick={() =>
                    updateDocsQuery({
                      categoryId: selectedCategoryId,
                      operationId: operation.id
                    })
                  }
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
