import { useEffect, useMemo, useState } from 'react';

import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Empty, Input, Result, Select, Spin, Typography } from 'antd';

import './api-docs-explorer.css';

export interface ApiDocsCatalogOperation {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  tags: string[];
  group: string;
  deprecated: boolean;
}

export interface ApiDocsCatalogCategory {
  id: string;
  label: string;
  operation_count: number;
}

export interface ApiDocsCatalog {
  title: string;
  version: string;
  categories: ApiDocsCatalogCategory[];
}

export interface ApiDocsCategoryOperations {
  id: string;
  label: string;
  operations: ApiDocsCatalogOperation[];
}

export interface ApiDocsExplorerQueryState {
  categoryId: string | null;
  operationId: string | null;
}

type QueryKey = readonly unknown[];

type CategorySelectOption = {
  value: string;
  label: string;
  categoryId: string;
  operationCount: number;
  searchText: string;
};

type ApiDocsOperationWithCategory = ApiDocsCatalogOperation & {
  categoryId: string | null;
  categoryLabel: string | null;
};

export interface ApiDocsExplorerProps<TAuthenticationSnapshot = unknown> {
  queryState: ApiDocsExplorerQueryState;
  onQueryStateChange: (
    nextState: ApiDocsExplorerQueryState,
    mode?: 'push' | 'replace'
  ) => void;
  catalogQueryKey: QueryKey;
  fetchCatalog: () => Promise<ApiDocsCatalog>;
  categoryOperationsQueryKey: (categoryId: string) => QueryKey;
  fetchCategoryOperations: (
    categoryId: string
  ) => Promise<ApiDocsCategoryOperations>;
  operationSpecQueryKey: (operationId: string) => QueryKey;
  fetchOperationSpec: (operationId: string) => Promise<unknown>;
  baseServerUrl: string | (() => string);
  showAllOperationsWhenNoCategory?: boolean;
  authentication?: {
    queryKey: QueryKey;
    queryFn: () => Promise<TAuthenticationSnapshot>;
    buildConfig: (
      operationSpec: unknown,
      snapshot: TAuthenticationSnapshot | undefined
    ) => unknown;
  };
}

function normalizeSearchText(input: string): string {
  return input.toLowerCase().replace(/[\s\-/:_]+/g, '');
}

function buildCategorySearchText(category: ApiDocsCatalogCategory): string {
  return normalizeSearchText(
    `${category.id} ${category.label} ${category.operation_count}`
  );
}

function buildOperationSearchText(operation: ApiDocsCatalogOperation): string {
  return normalizeSearchText(
    `${operation.method} ${operation.path} ${operation.summary ?? ''} ${operation.description ?? ''} ${operation.group} ${operation.id}`
  );
}

export function ApiDocsExplorer<TAuthenticationSnapshot = unknown>({
  queryState,
  onQueryStateChange,
  catalogQueryKey,
  fetchCatalog,
  categoryOperationsQueryKey,
  fetchCategoryOperations,
  operationSpecQueryKey,
  fetchOperationSpec,
  baseServerUrl,
  showAllOperationsWhenNoCategory = false,
  authentication
}: ApiDocsExplorerProps<TAuthenticationSnapshot>) {
  const [operationSearch, setOperationSearch] = useState('');
  const catalogQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: fetchCatalog
  });
  const categories = catalogQuery.data?.categories ?? [];
  const selectedCategoryId =
    categories.find((category) => category.id === queryState.categoryId)?.id ??
    null;
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const totalOperations = categories.reduce(
    (total, category) => total + category.operation_count,
    0
  );
  const categoryOptions: CategorySelectOption[] = categories.map(
    (category) => ({
      value: category.id,
      label: category.label,
      categoryId: category.id,
      operationCount: category.operation_count,
      searchText: buildCategorySearchText(category)
    })
  );

  useEffect(() => {
    if (catalogQuery.isLoading || !queryState.categoryId || selectedCategoryId) {
      return;
    }

    onQueryStateChange({ categoryId: null, operationId: null }, 'replace');
  }, [
    catalogQuery.isLoading,
    onQueryStateChange,
    queryState.categoryId,
    selectedCategoryId
  ]);

  const categoryOperationsQuery = useQuery({
    queryKey: categoryOperationsQueryKey(selectedCategoryId ?? ''),
    queryFn: () => fetchCategoryOperations(selectedCategoryId!),
    enabled: Boolean(selectedCategoryId)
  });

  const allCategoryOperationsQueries = useQueries({
    queries: categories.map((category) => ({
      queryKey: categoryOperationsQueryKey(category.id),
      queryFn: () => fetchCategoryOperations(category.id),
      enabled: showAllOperationsWhenNoCategory && !selectedCategoryId
    }))
  });
  const allCategoryOperationsLoading =
    showAllOperationsWhenNoCategory &&
    !selectedCategoryId &&
    allCategoryOperationsQueries.some((query) => query.isLoading);
  const allCategoryOperationsError =
    showAllOperationsWhenNoCategory &&
    !selectedCategoryId &&
    allCategoryOperationsQueries.some((query) => query.isError);
  const allCategoryOperations = useMemo(
    () =>
      allCategoryOperationsQueries.flatMap((query, index) => {
        const category = categories[index];

        return (query.data?.operations ?? []).map((operation) => ({
          ...operation,
          categoryId: category?.id ?? null,
          categoryLabel: category?.label ?? null
        }));
      }),
    [allCategoryOperationsQueries, categories]
  );
  const selectedCategoryOperations = useMemo(
    () =>
      (categoryOperationsQuery.data?.operations ?? []).map((operation) => ({
        ...operation,
        categoryId: selectedCategoryId,
        categoryLabel: selectedCategory?.label ?? null
      })),
    [categoryOperationsQuery.data?.operations, selectedCategory?.label, selectedCategoryId]
  );
  const operations: ApiDocsOperationWithCategory[] =
    showAllOperationsWhenNoCategory && !selectedCategoryId
      ? allCategoryOperations
      : selectedCategoryOperations;
  const selectedOperationId =
    operations.find((operation) => operation.id === queryState.operationId)
      ?.id ?? null;
  const selectedOperation =
    operations.find((operation) => operation.id === selectedOperationId) ??
    null;

  const filteredOperations = useMemo(() => {
    const normalizedQuery = normalizeSearchText(operationSearch);

    if (!normalizedQuery) {
      return operations;
    }

    return operations.filter((operation) =>
      buildOperationSearchText(operation).includes(normalizedQuery)
    );
  }, [operationSearch, operations]);

  useEffect(() => {
    if (
      !selectedCategoryId ||
      categoryOperationsQuery.isLoading ||
      !queryState.operationId ||
      selectedOperationId
    ) {
      return;
    }

    onQueryStateChange(
      { categoryId: selectedCategoryId, operationId: null },
      'replace'
    );
  }, [
    categoryOperationsQuery.isLoading,
    onQueryStateChange,
    queryState.operationId,
    selectedCategoryId,
    selectedOperationId
  ]);

  useEffect(() => {
    if (
      !showAllOperationsWhenNoCategory ||
      selectedCategoryId ||
      allCategoryOperationsLoading ||
      !queryState.operationId ||
      selectedOperationId
    ) {
      return;
    }

    onQueryStateChange({ categoryId: null, operationId: null }, 'replace');
  }, [
    allCategoryOperationsLoading,
    onQueryStateChange,
    queryState.operationId,
    selectedCategoryId,
    selectedOperationId,
    showAllOperationsWhenNoCategory
  ]);

  const operationSpecQuery = useQuery({
    queryKey: operationSpecQueryKey(selectedOperationId ?? ''),
    queryFn: () => fetchOperationSpec(selectedOperationId!),
    enabled: Boolean(selectedOperationId)
  });
  const authenticationQuery = useQuery({
    queryKey: authentication?.queryKey ?? ['api-docs', 'authentication-disabled'],
    queryFn: () => authentication!.queryFn(),
    enabled: Boolean(authentication && selectedOperationId)
  });

  function renderCategorySelector() {
    return (
      <section className="api-docs-panel__toolbar" aria-label="文档筛选">
        <div className="api-docs-panel__header-control">
          <Select
            aria-label="接口分类"
            className="api-docs-panel__category-select"
            showSearch
            allowClear
            disabled={categories.length === 0}
            value={selectedCategoryId ?? undefined}
            options={categoryOptions}
            placeholder={
              categories.length === 0
                ? '暂无接口分类'
                : showAllOperationsWhenNoCategory
                  ? '全部接口'
                  : '选择接口分类'
            }
            optionRender={(option) => {
              const category = option.data as CategorySelectOption;

              return (
                <div className="api-docs-panel__category-option">
                  <div className="api-docs-panel__category-option-copy">
                    <span className="api-docs-panel__category-option-label">
                      {category.label}
                    </span>
                    <span
                      className="api-docs-panel__category-option-id"
                      aria-hidden="true"
                    >
                      {category.categoryId}
                    </span>
                  </div>
                  <span
                    className="api-docs-panel__category-option-count"
                    aria-hidden="true"
                  >
                    {category.operationCount} 个接口
                  </span>
                </div>
              );
            }}
            filterOption={(input, option) =>
              String(
                (option as CategorySelectOption | undefined)?.searchText ?? ''
              ).includes(normalizeSearchText(input))
            }
            onChange={(nextCategoryId) =>
              onQueryStateChange({
                categoryId: nextCategoryId ?? null,
                operationId: null
              })
            }
            notFoundContent="未找到匹配分类"
          />
        </div>
        <Typography.Text className="api-docs-panel__count">
          共 {totalOperations} 个接口
        </Typography.Text>
      </section>
    );
  }

  function renderOperationPane() {
    if (categories.length === 0) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">
                当前暂无可访问分类
              </Typography.Text>
            </div>
          </div>
          <div className="api-docs-panel__pane-body">
            <Empty
              description="暂无接口分类"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        </section>
      );
    }

    if (!selectedCategoryId && !showAllOperationsWhenNoCategory) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">
                在上方先选分类后展示接口
              </Typography.Text>
            </div>
          </div>
          <div className="api-docs-panel__pane-body">
            <Result
              status="info"
              title="选择一个分类后查看接口列表"
              subTitle="分类选择放在头部，下方列表只负责当前分类下的接口浏览。"
            />
          </div>
        </section>
      );
    }

    if (
      selectedCategoryId
        ? categoryOperationsQuery.isLoading
        : allCategoryOperationsLoading
    ) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">
                正在加载 {selectedCategory?.label ?? '全部分类'} 的接口
              </Typography.Text>
            </div>
          </div>
          <div className="api-docs-panel__pane-state">
            <Spin size="large" />
          </div>
        </section>
      );
    }

    if (
      selectedCategoryId
        ? categoryOperationsQuery.isError
        : allCategoryOperationsError
    ) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">
                {selectedCategoryId ? '当前分类' : '全部分类'}接口加载失败
              </Typography.Text>
            </div>
          </div>
          <div className="api-docs-panel__pane-body">
            <Result
              status="error"
              title="接口列表加载失败"
              subTitle="请刷新后重试，或切换到其他分类。"
            />
          </div>
        </section>
      );
    }

    return (
      <section className="api-docs-panel__pane" aria-label="接口列表">
        <div className="api-docs-panel__pane-header">
          <div className="api-docs-panel__pane-copy">
            <Typography.Text strong>接口列表</Typography.Text>
            <Typography.Text type="secondary">
              {selectedCategory?.label ?? '全部分类'} 共 {operations.length} 个接口
            </Typography.Text>
          </div>
        </div>
        <div className="api-docs-panel__pane-toolbar">
          <Input
            aria-label="搜索接口"
            allowClear
            placeholder="搜索接口"
            value={operationSearch}
            onChange={(event) => setOperationSearch(event.target.value)}
          />
        </div>
        <div className="api-docs-panel__pane-body">
          {!operations.length ? (
            <Empty
              description={selectedCategoryId ? '当前分类暂无接口' : '暂无接口'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : filteredOperations.length === 0 ? (
            <Empty
              description="未找到匹配接口"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <div className="api-docs-panel__list">
              {filteredOperations.map((operation) => (
                <button
                  key={operation.id}
                  type="button"
                  className="api-docs-panel__list-button api-docs-panel__list-button--operation"
                  aria-pressed={selectedOperationId === operation.id}
                  onClick={() =>
                    onQueryStateChange({
                      categoryId: selectedCategoryId,
                      operationId: operation.id
                    })
                  }
                >
                  <span className="api-docs-panel__list-button-main">
                    <span className="api-docs-panel__operation-heading">
                      <span
                        className={`api-docs-panel__operation-method api-docs-panel__operation-method--${operation.method.toLowerCase()}`}
                      >
                        {operation.method}
                      </span>
                      <span className="api-docs-panel__operation-path">
                        {operation.path}
                      </span>
                    </span>
                    <span className="api-docs-panel__list-button-subtitle">
                      {operation.summary ??
                        operation.description ??
                        operation.id}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderDetailPane() {
    if (
      (!selectedCategoryId && !showAllOperationsWhenNoCategory) ||
      !selectedOperationId
    ) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="info"
            title="选择接口后查看详情"
            subTitle={
              showAllOperationsWhenNoCategory
                ? '从左侧接口列表打开要查看的接口。'
                : '先在上方选择分类，再从左侧接口列表打开要查看的接口。'
            }
          />
        </div>
      );
    }

    if (operationSpecQuery.isLoading) {
      return (
        <div className="api-docs-panel__detail-state">
          <Spin size="large" />
          <Typography.Text type="secondary">
            正在加载 {selectedOperation?.path ?? '当前接口'} 的详情
          </Typography.Text>
        </div>
      );
    }

    if (operationSpecQuery.isError) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="error"
            title="接口详情加载失败"
            subTitle="当前接口文档未能成功返回，请刷新后重试。"
          />
        </div>
      );
    }

    return (
      <div className="api-docs-panel__detail-viewer">
        <ApiReferenceReact
          configuration={{
            authentication: authentication?.buildConfig(
              operationSpecQuery.data,
              authenticationQuery.data
            ),
            baseServerURL:
              typeof baseServerUrl === 'function'
                ? baseServerUrl()
                : baseServerUrl,
            content: operationSpecQuery.data,
            showSidebar: false
          }}
        />
      </div>
    );
  }

  let content = null;

  if (catalogQuery.isLoading) {
    content = (
      <div className="api-docs-panel__detail-state">
        <Spin size="large" />
        <Typography.Text type="secondary">正在加载接口目录</Typography.Text>
      </div>
    );
  } else if (catalogQuery.isError) {
    content = (
      <Result
        status="error"
        title="接口目录加载失败"
        subTitle="请确认当前账号仍具备 API 文档权限，并稍后重试。"
      />
    );
  } else {
    content = (
      <>
        {renderCategorySelector()}
        <div className="api-docs-panel__workspace">
          {renderOperationPane()}
          <section className="api-docs-panel__detail" aria-label="API 文档详情">
            {renderDetailPane()}
          </section>
        </div>
      </>
    );
  }

  return <div className="api-docs-panel">{content}</div>;
}
