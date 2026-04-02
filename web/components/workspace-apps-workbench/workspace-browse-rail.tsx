import { Button, Card, Input, Space, Tag, Typography } from "antd";

import type {
  WorkspaceModeTab,
  WorkspaceQuickCreateEntry,
  WorkspaceScopePill,
  WorkspaceStatusFilter
} from "@/components/workspace-apps-workbench/shared";
import type { WorkspaceAppSearchFormState } from "@/lib/workspace-app-query-state";

const { Paragraph, Text, Title } = Typography;

function WorkspaceScopePills({ scopePills }: { scopePills: WorkspaceScopePill[] }) {
  if (scopePills.length === 0) {
    return null;
  }

  return (
    <Space className="workspace-scope-pills" aria-label="Workspace scopes" size={8} wrap>
      {scopePills.map((scopePill) => (
        <Button href={scopePill.href} key={scopePill.key} size="small" type="default">
          {scopePill.label}：{scopePill.value}
        </Button>
      ))}
    </Space>
  );
}

export function WorkspaceBrowseRail({
  currentScopeSummary,
  modeTabs,
  statusFilters,
  scopePills,
  requestedKeyword,
  searchState,
  focusedCreateHref,
  workspaceUtilityEntry
}: {
  currentScopeSummary: string;
  modeTabs: WorkspaceModeTab[];
  statusFilters: WorkspaceStatusFilter[];
  scopePills: WorkspaceScopePill[];
  requestedKeyword: string;
  searchState: WorkspaceAppSearchFormState;
  focusedCreateHref: string;
  workspaceUtilityEntry: WorkspaceQuickCreateEntry | null;
}) {
  return (
    <section
      className="workspace-filter-rail workspace-filter-rail-inline"
      aria-label="Workspace filters"
      data-component="workspace-browse-rail"
    >
      <Card className="workspace-catalog-card" variant="borderless">
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <div className="workspace-filter-rail-header workspace-filter-rail-header-inline">
            <div className="workspace-filter-rail-copy">
              <Text type="secondary">Board controls</Text>
              <Title level={4}>应用目录</Title>
              <Paragraph className="workspace-muted workspace-card-copy">
                {currentScopeSummary}
              </Paragraph>
            </div>

            <Space size={8} wrap>
              {workspaceUtilityEntry ? (
                <Button href={workspaceUtilityEntry.href}>{workspaceUtilityEntry.title}</Button>
              ) : null}
              <Button href={focusedCreateHref} type="primary">
                创建应用
              </Button>
            </Space>
          </div>

          <form action="/workspace" className="workspace-search-form workspace-search-form-board workspace-search-form-studio">
            {searchState.filter ? <input name="filter" type="hidden" value={searchState.filter} /> : null}
            {searchState.mode ? <input name="mode" type="hidden" value={searchState.mode} /> : null}
            {searchState.track ? <input name="track" type="hidden" value={searchState.track} /> : null}
            <Space.Compact block>
              <Input defaultValue={requestedKeyword} name="keyword" placeholder="搜索应用或治理焦点" type="search" />
              <Button htmlType="submit" type="primary">
                搜索
              </Button>
              {searchState.clearHref ? <Button href={searchState.clearHref}>清除</Button> : null}
            </Space.Compact>
          </form>

          <div className="workspace-filter-rail-body workspace-filter-rail-body-inline">
            <div className="workspace-filter-rail-group">
              <span className="workspace-filter-rail-label">应用类型</span>
              <Space className="workspace-filter-rail-tab-list" aria-label="App modes" size={8} wrap>
                {modeTabs.map((modeTab) => (
                  <Button
                    href={modeTab.href}
                    key={modeTab.key}
                    size="small"
                    type={modeTab.active ? "primary" : "default"}
                  >
                    {modeTab.label} {modeTab.count}
                  </Button>
                ))}
              </Space>
            </div>

            <div className="workspace-filter-rail-group">
              <span className="workspace-filter-rail-label">状态</span>
              <Space className="workspace-filter-row workspace-filter-row-board workspace-filter-rail-chip-list" size={8} wrap>
                {statusFilters.map((statusFilter) => (
                  <Button
                    href={statusFilter.href}
                    key={statusFilter.key}
                    size="small"
                    type={statusFilter.active ? "primary" : "default"}
                  >
                    {statusFilter.label}
                  </Button>
                ))}
              </Space>
            </div>

            {scopePills.length > 0 ? (
              <div className="workspace-filter-rail-group">
                <span className="workspace-filter-rail-label">当前聚焦</span>
                <WorkspaceScopePills scopePills={scopePills} />
              </div>
            ) : null}
          </div>

          <Space size={8} wrap>
            <Tag color="processing">搜索、筛选与主操作已收口到同一工具栏</Tag>
          </Space>
        </Space>
      </Card>
    </section>
  );
}
