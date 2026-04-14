import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { Empty, Result, Select, Spin, Typography } from 'antd';

import {
  fetchSettingsApiDocsCatalog,
  fetchSettingsApiDocsCategorySpec,
  settingsApiDocsCatalogQueryKey,
  settingsApiDocsCategorySpecQueryKey
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

function updateCategoryQuery(categoryId: string | null, mode: 'push' | 'replace' = 'push') {
  const nextUrl = new URL(window.location.href);

  if (categoryId) {
    nextUrl.searchParams.set('category', categoryId);
  } else {
    nextUrl.searchParams.delete('category');
  }

  nextUrl.searchParams.delete('operation');

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
  const categoryOptions: CategorySelectOption[] = categories.map((category) => ({
    value: category.id,
    label: category.label,
    categoryId: category.id,
    operationCount: category.operation_count,
    searchText: buildApiDocsCategorySearchText(category)
  }));

  useEffect(() => {
    if (!selectedCategoryId || requestedCategoryId === selectedCategoryId) {
      return;
    }

    updateCategoryQuery(selectedCategoryId, 'replace');
  }, [requestedCategoryId, selectedCategoryId]);

  const categorySpecQuery = useQuery({
    queryKey: settingsApiDocsCategorySpecQueryKey(selectedCategoryId ?? ''),
    queryFn: () => fetchSettingsApiDocsCategorySpec(selectedCategoryId!),
    enabled: Boolean(selectedCategoryId)
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
    if (categories.length === 0) {
      return (
        <section className="api-docs-panel__category-selector" aria-label="当前分类">
          <div className="api-docs-panel__category-selector-copy">
            <Typography.Text strong>当前分类</Typography.Text>
            <Typography.Text type="secondary">已收录 0 个分类</Typography.Text>
          </div>
          <Empty description="暂无接口分类" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </section>
      );
    }

    return (
      <section className="api-docs-panel__category-selector" aria-label="当前分类">
        <div className="api-docs-panel__category-selector-header">
          <div className="api-docs-panel__category-selector-copy">
            <Typography.Text strong>当前分类</Typography.Text>
            <Typography.Text type="secondary">
              已收录 {categories.length} 个分类
            </Typography.Text>
          </div>
          <Typography.Text className="api-docs-panel__category-selector-current">
            当前分类 {selectedCategory?.operation_count ?? 0} 个接口
          </Typography.Text>
        </div>

        <Select
          aria-label="接口分类"
          className="api-docs-panel__category-select"
          showSearch
          value={selectedCategoryId ?? undefined}
          options={categoryOptions}
          placeholder="选择接口分类"
          optionRender={(option) => {
            const category = option.data as CategorySelectOption;

            return (
              <div className="api-docs-panel__category-option">
                <div className="api-docs-panel__category-option-copy">
                  <span className="api-docs-panel__category-option-label">{category.label}</span>
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
            String((option as CategorySelectOption | undefined)?.searchText ?? '').includes(
              normalizeApiDocsCategorySearchText(input)
            )
          }
          onChange={(nextCategoryId) => updateCategoryQuery(nextCategoryId)}
          notFoundContent="未找到匹配分类"
        />
      </section>
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

    if (categorySpecQuery.isLoading) {
      return (
        <div className="api-docs-panel__detail-state">
          <Spin size="large" />
          <Typography.Text type="secondary">
            正在加载 {selectedCategory?.label ?? '当前分类'} 的接口文档
          </Typography.Text>
        </div>
      );
    }

    if (categorySpecQuery.isError) {
      return (
        <div className="api-docs-panel__detail-state">
          <Result
            status="error"
            title="接口文档加载失败"
            subTitle="当前分类文档未能成功返回，请刷新后重试。"
          />
        </div>
      );
    }

    return (
      <div className="api-docs-panel__detail-viewer">
        <ApiReferenceReact
          configuration={{
            content: categorySpecQuery.data,
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
            顶部卡片只负责切换接口分类，Scalar 详情区直接展示当前分类下的完整 OpenAPI 文档。
          </Typography.Paragraph>
        </div>
        <Typography.Text className="api-docs-panel__count">
          共 {totalOperations} 个接口
        </Typography.Text>
      </div>

      {renderCategorySelector()}

      <section className="api-docs-panel__detail" aria-label="API 文档详情">
        {renderDetailPane()}
      </section>
    </div>
  );
}
