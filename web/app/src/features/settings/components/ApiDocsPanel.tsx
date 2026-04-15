import { useEffect, useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { Empty, Input, Result, Select, Spin, Typography } from 'antd';

import {
  fetchCurrentSession,
  getScalarApiBaseUrl
} from '../../auth/api/session';
import { installScalarClipboardPatch } from '../lib/scalar-clipboard';

installScalarClipboardPatch();

import {
  fetchSettingsApiDocsCatalog,
  fetchSettingsApiDocsCategoryOperations,
  fetchSettingsApiDocsOperationSpec,
  settingsApiDocsCatalogQueryKey,
  settingsApiDocsCategoryOperationsQueryKey,
  settingsApiDocsOperationSpecQueryKey
} from '../api/api-docs';
import {
  buildApiDocsCategorySearchText,
  normalizeApiDocsCategorySearchText
} from '../lib/api-docs-category-search';
import './api-docs-panel.css';

type CategorySelectOption = {
  value: string;
  label: string;
  categoryId: string;
  operationCount: number;
  searchText: string;
};

function normalizeOperationSearchText(input: string): string {
  return input.toLowerCase().replace(/[\s\-/:_]+/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildOperationSearchText(operation: {
  id: string;
  method: string;
  path: string;
  summary: string | null;
  description: string | null;
  group: string;
}): string {
  return normalizeOperationSearchText(
    `${operation.method} ${operation.path} ${operation.summary ?? ''} ${operation.description ?? ''} ${operation.group} ${operation.id}`
  );
}

function updateDocsQuery(
  {
    categoryId,
    operationId
  }: {
    categoryId: string | null;
    operationId: string | null;
  },
  mode: 'push' | 'replace' = 'push'
) {
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

const docsViewerSessionQueryKey = ['settings', 'docs', 'viewer-session'] as const;
const scalarPreferredSecurityScheme = ['sessionCookie', 'csrfHeader'] as const;

function collectPreferredSecuritySchemes(operationSpec: unknown) {
  const requiredSchemes = new Set<string>();
  const securityRequirements =
    isRecord(operationSpec) && Array.isArray(operationSpec.security) ? operationSpec.security : [];

  for (const requirement of securityRequirements) {
    if (!isRecord(requirement)) {
      continue;
    }

    for (const schemeName of Object.keys(requirement)) {
      requiredSchemes.add(schemeName);
    }
  }

  return scalarPreferredSecurityScheme.filter((schemeName) =>
    requiredSchemes.has(schemeName)
  );
}

function buildScalarAuthenticationConfig(
  operationSpec: unknown,
  sessionSnapshot: Awaited<ReturnType<typeof fetchCurrentSession>> | undefined
) {
  const securitySchemes = isRecord(operationSpec)
    && isRecord(operationSpec.components)
    && isRecord(operationSpec.components.securitySchemes)
      ? operationSpec.components.securitySchemes
      : {};
  const sessionCookieScheme = isRecord(securitySchemes.sessionCookie)
    ? securitySchemes.sessionCookie
    : {};
  const csrfHeaderScheme = isRecord(securitySchemes.csrfHeader)
    ? securitySchemes.csrfHeader
    : {};
  const preferredSecurityScheme = collectPreferredSecuritySchemes(operationSpec);

  if (
    Object.keys(sessionCookieScheme).length === 0 &&
    Object.keys(csrfHeaderScheme).length === 0
  ) {
    return undefined;
  }

  return {
    preferredSecurityScheme,
    securitySchemes: {
      sessionCookie: {
        ...sessionCookieScheme,
        value: sessionSnapshot?.session.id ?? ''
      },
      csrfHeader: {
        ...csrfHeaderScheme,
        value: sessionSnapshot?.csrf_token ?? ''
      }
    }
  };
}

export function ApiDocsPanel() {
  const locationSearch = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>
  });
  const requestedCategoryId =
    typeof locationSearch.category === 'string' ? locationSearch.category : null;
  const requestedOperationId =
    typeof locationSearch.operation === 'string' ? locationSearch.operation : null;
  const [operationSearch, setOperationSearch] = useState('');

  const catalogQuery = useQuery({
    queryKey: settingsApiDocsCatalogQueryKey,
    queryFn: fetchSettingsApiDocsCatalog
  });
  const categories = catalogQuery.data?.categories ?? [];
  const selectedCategoryId =
    categories.find((category) => category.id === requestedCategoryId)?.id ?? null;
  const selectedCategory =
    categories.find((category) => category.id === selectedCategoryId) ?? null;
  const totalOperations = categories.reduce(
    (total, category) => total + category.operation_count,
    0
  );
  const categoryOptions: CategorySelectOption[] = categories.map((category) => ({
    value: category.id,
    label: category.label,
    categoryId: category.id,
    operationCount: category.operation_count,
    searchText: buildApiDocsCategorySearchText(category)
  }));

  useEffect(() => {
    if (catalogQuery.isLoading || !requestedCategoryId || selectedCategoryId) {
      return;
    }

    updateDocsQuery({ categoryId: null, operationId: null }, 'replace');
  }, [catalogQuery.isLoading, requestedCategoryId, selectedCategoryId]);

  const categoryOperationsQuery = useQuery({
    queryKey: settingsApiDocsCategoryOperationsQueryKey(selectedCategoryId ?? ''),
    queryFn: () => fetchSettingsApiDocsCategoryOperations(selectedCategoryId!),
    enabled: Boolean(selectedCategoryId)
  });
  const operations = categoryOperationsQuery.data?.operations;
  const selectedOperationId =
    operations?.find((operation) => operation.id === requestedOperationId)?.id ?? null;
  const selectedOperation =
    operations?.find((operation) => operation.id === selectedOperationId) ?? null;

  const filteredOperations = useMemo(() => {
    const operationList = operations ?? [];
    const normalizedQuery = normalizeOperationSearchText(operationSearch);

    if (!normalizedQuery) {
      return operationList;
    }

    return operationList.filter((operation) =>
      buildOperationSearchText(operation).includes(normalizedQuery)
    );
  }, [operationSearch, operations]);

  useEffect(() => {
    if (
      !selectedCategoryId ||
      categoryOperationsQuery.isLoading ||
      !requestedOperationId ||
      selectedOperationId
    ) {
      return;
    }

    updateDocsQuery({ categoryId: selectedCategoryId, operationId: null }, 'replace');
  }, [
    categoryOperationsQuery.isLoading,
    requestedOperationId,
    selectedCategoryId,
    selectedOperationId
  ]);

  const operationSpecQuery = useQuery({
    queryKey: settingsApiDocsOperationSpecQueryKey(selectedOperationId ?? ''),
    queryFn: () => fetchSettingsApiDocsOperationSpec(selectedOperationId!),
    enabled: Boolean(selectedOperationId)
  });
  const docsViewerSessionQuery = useQuery({
    queryKey: docsViewerSessionQueryKey,
    queryFn: () => fetchCurrentSession(),
    enabled: Boolean(selectedOperationId)
  });

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

  function renderCategorySelector() {
    return (
      <section className="api-docs-panel__header-controls" aria-label="文档筛选">
        <div className="api-docs-panel__header-control">
          <div className="api-docs-panel__header-control-copy">
            <Typography.Text strong>接口分类</Typography.Text>
            <Typography.Text type="secondary">
              已收录 {categories.length} 个分类，切换分类后再浏览接口详情
            </Typography.Text>
          </div>
          <Select
            aria-label="接口分类"
            className="api-docs-panel__category-select"
            showSearch
            allowClear
            disabled={categories.length === 0}
            value={selectedCategoryId ?? undefined}
            options={categoryOptions}
            placeholder={categories.length === 0 ? '暂无接口分类' : '选择接口分类'}
            optionRender={(option) => {
              const category = option.data as CategorySelectOption;

              return (
                <div className="api-docs-panel__category-option">
                  <div className="api-docs-panel__category-option-copy">
                    <span className="api-docs-panel__category-option-label">
                      {category.label}
                    </span>
                    <span className="api-docs-panel__category-option-id" aria-hidden="true">
                      {category.categoryId}
                    </span>
                  </div>
                  <span className="api-docs-panel__category-option-count" aria-hidden="true">
                    {category.operationCount} 个接口
                  </span>
                </div>
              );
            }}
            filterOption={(input, option) =>
              String((option as CategorySelectOption | undefined)?.searchText ?? '').includes(
                normalizeApiDocsCategorySearchText(input)
              )
            }
            onChange={(nextCategoryId) =>
              updateDocsQuery({
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
              <Typography.Text type="secondary">当前暂无可访问分类</Typography.Text>
            </div>
          </div>
          <div className="api-docs-panel__pane-body">
            <Empty description="暂无接口分类" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        </section>
      );
    }

    if (!selectedCategoryId) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">在上方先选分类后展示接口</Typography.Text>
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

    if (categoryOperationsQuery.isLoading) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">
                正在加载 {selectedCategory?.label ?? '当前分类'} 的接口
              </Typography.Text>
            </div>
          </div>
          <div className="api-docs-panel__pane-state">
            <Spin size="large" />
          </div>
        </section>
      );
    }

    if (categoryOperationsQuery.isError) {
      return (
        <section className="api-docs-panel__pane" aria-label="接口列表">
          <div className="api-docs-panel__pane-header">
            <div className="api-docs-panel__pane-copy">
              <Typography.Text strong>接口列表</Typography.Text>
              <Typography.Text type="secondary">当前分类接口加载失败</Typography.Text>
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
              {selectedCategory?.label ?? '当前分类'} 共 {(operations ?? []).length} 个接口
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
          {!(operations ?? []).length ? (
            <Empty description="当前分类暂无接口" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : filteredOperations.length === 0 ? (
            <Empty description="未找到匹配接口" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="api-docs-panel__list">
              {filteredOperations.map((operation) => (
                <button
                  key={operation.id}
                  type="button"
                  className="api-docs-panel__list-button api-docs-panel__list-button--operation"
                  aria-pressed={selectedOperationId === operation.id}
                  onClick={() =>
                    updateDocsQuery({
                      categoryId: selectedCategoryId,
                      operationId: operation.id
                    })
                  }
                >
                  <span className="api-docs-panel__list-button-main">
                    <span className="api-docs-panel__operation-heading">
                      <span className={`api-docs-panel__operation-method api-docs-panel__operation-method--${operation.method.toLowerCase()}`}>
                        {operation.method}
                      </span>
                      <span className="api-docs-panel__operation-path">
                        {operation.path}
                      </span>
                    </span>
                    <span className="api-docs-panel__list-button-subtitle">
                      {operation.summary ?? operation.description ?? operation.id}
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
    if (!selectedCategoryId || !selectedOperationId) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="info"
            title="选择接口后查看详情"
            subTitle="先在上方选择分类，再从左侧接口列表打开要查看的接口。"
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
            authentication: buildScalarAuthenticationConfig(
              operationSpecQuery.data,
              docsViewerSessionQuery.data
            ),
            baseServerURL: getScalarApiBaseUrl(),
            content: operationSpecQuery.data,
            showSidebar: false
          }}
        />
      </div>
    );
  }

  return (
    <div className="api-docs-panel">
      <div className="api-docs-panel__header">
        <div className="api-docs-panel__header-top">
          <div>
            <Typography.Title level={3}>API 文档</Typography.Title>
            <Typography.Paragraph className="api-docs-panel__subtitle">
              头部下拉只负责切换分类，左侧列表浏览当前分类下的接口，右侧保持原生
              Scalar 单接口详情。
            </Typography.Paragraph>
          </div>
        </div>

        <div>
          {renderCategorySelector()}
        </div>
      </div>

      <div className="api-docs-panel__workspace">
        {renderOperationPane()}
        <section className="api-docs-panel__detail" aria-label="API 文档详情">
          {renderDetailPane()}
        </section>
      </div>
    </div>
  );
}
