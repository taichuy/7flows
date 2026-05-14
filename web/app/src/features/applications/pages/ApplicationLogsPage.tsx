import { SearchOutlined } from '@ant-design/icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Empty, Input, Result, Select, Typography } from 'antd';
import { useEffect, useState } from 'react';

import type { AgentFlowDebugMessage } from '../../agent-flow/api/runtime';
import { ConversationLogPanel } from '../../agent-flow/components/debug-console/ConversationLogPanel';
import {
  applicationRunDetailQueryKey,
  applicationRunsQueryKey,
  fetchApplicationRunDetail,
  fetchApplicationRuns,
  type ApplicationRunDetail,
  type ApplicationRunSummary
} from '../api/runtime';
import { ApplicationRunDetailPanel } from '../components/logs/ApplicationRunDetailPanel';
import { ApplicationLogsFloatingWindow } from '../components/logs/ApplicationLogsFloatingWindow';
import { ApplicationRunsTable } from '../components/logs/ApplicationRunsTable';
import './application-logs-page.css';

const FLOATING_WINDOW_TOP = 112;
const FLOATING_WINDOW_GAP = 16;
const FLOATING_WINDOW_RIGHT = 32;
const FLOATING_WINDOW_MIN_WIDTH = 360;
const FLOATING_WINDOW_MAX_HEIGHT = 720;
const DEFAULT_TIME_RANGE = '7';
const PAGE_SIZE = 20;

type ApplicationLogTimeRange = '1' | '7' | '28' | '90' | '365' | 'all';
type SearchableRunSummary = ApplicationRunSummary & {
  answer?: unknown;
  input_payload?: unknown;
  input_summary?: unknown;
  output_payload?: unknown;
  output_summary?: unknown;
  query?: unknown;
};

const TIME_RANGE_OPTIONS: Array<{
  label: string;
  value: ApplicationLogTimeRange;
}> = [
  { label: '今天', value: '1' },
  { label: '过去 7 天', value: '7' },
  { label: '过去 4 周', value: '28' },
  { label: '过去 3 月', value: '90' },
  { label: '过去 12 月', value: '365' },
  { label: '所有时间', value: 'all' }
];

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 720 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

function getFloatingWindowHeight() {
  const viewport = getViewportSize();

  return Math.max(
    320,
    Math.min(
      FLOATING_WINDOW_MAX_HEIGHT,
      viewport.height - FLOATING_WINDOW_TOP - FLOATING_WINDOW_RIGHT
    )
  );
}

function getRunDetailInitialRect() {
  const viewport = getViewportSize();

  return {
    left: viewport.width - FLOATING_WINDOW_MIN_WIDTH - FLOATING_WINDOW_RIGHT,
    top: FLOATING_WINDOW_TOP,
    width: FLOATING_WINDOW_MIN_WIDTH,
    height: getFloatingWindowHeight()
  };
}

function getConversationLogInitialRect() {
  const runDetailRect = getRunDetailInitialRect();

  return {
    left:
      runDetailRect.left -
      FLOATING_WINDOW_MIN_WIDTH -
      FLOATING_WINDOW_GAP,
    top: FLOATING_WINDOW_TOP,
    width: FLOATING_WINDOW_MIN_WIDTH,
    height: getFloatingWindowHeight()
  };
}

function stringifySearchValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getRunSummarySearchText(run: ApplicationRunSummary) {
  const searchableRun = run as SearchableRunSummary;

  return [
    run.id,
    run.title,
    run.expand_id,
    run.authorized_account,
    run.run_mode,
    run.status,
    run.target_node_id,
    searchableRun.query,
    searchableRun.answer,
    searchableRun.input_summary,
    searchableRun.output_summary,
    searchableRun.input_payload,
    searchableRun.output_payload
  ]
    .map(stringifySearchValue)
    .join(' ')
    .toLowerCase();
}

function getRunDetailSearchText(detail: ApplicationRunDetail | undefined) {
  if (!detail) {
    return '';
  }

  return [
    detail.flow_run.input_payload,
    detail.flow_run.output_payload,
    ...detail.node_runs.flatMap((nodeRun) => [
      nodeRun.input_payload,
      nodeRun.output_payload
    ])
  ]
    .map(stringifySearchValue)
    .join(' ')
    .toLowerCase();
}

export function ApplicationLogsPage({
  applicationId
}: {
  applicationId: string;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [openConversationLogMessage, setOpenConversationLogMessage] =
    useState<AgentFlowDebugMessage | null>(null);
  const [timeRange, setTimeRange] =
    useState<ApplicationLogTimeRange>(DEFAULT_TIME_RANGE);
  const [keywordSearch, setKeywordSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeFloatingWindow, setActiveFloatingWindow] = useState<
    'conversation-log' | 'run-detail'
  >('run-detail');
  const runsQuery = useQuery({
    queryKey: applicationRunsQueryKey(applicationId, {
      page,
      pageSize: PAGE_SIZE,
      timeRangeDays: timeRange === 'all' ? null : Number(timeRange)
    }),
    queryFn: () =>
      fetchApplicationRuns(applicationId, {
        page,
        pageSize: PAGE_SIZE,
        timeRangeDays: timeRange === 'all' ? null : Number(timeRange)
      })
  });
  const runsPage = runsQuery.data;
  const runs = runsPage?.items ?? [];
  const total = runsPage?.total ?? 0;
  const normalizedKeyword = keywordSearch.trim().toLowerCase();
  const runDetailQueries = useQueries({
    queries: runs.map((run) => ({
      queryKey: applicationRunDetailQueryKey(applicationId, run.id),
      queryFn: () => fetchApplicationRunDetail(applicationId, run.id),
      enabled: normalizedKeyword.length > 0
    }))
  });
  const runDetailsById = new Map<string, ApplicationRunDetail>();

  runs.forEach((run, index) => {
    const detail = runDetailQueries[index]?.data;

    if (detail) {
      runDetailsById.set(run.id, detail);
    }
  });

  const visibleRuns = runs.filter((run) => {
    if (!normalizedKeyword) {
      return true;
    }

    return (
      getRunSummarySearchText(run).includes(normalizedKeyword) ||
      getRunDetailSearchText(runDetailsById.get(run.id)).includes(
        normalizedKeyword
      )
    );
  });
  const searchingRunDetails =
    Boolean(normalizedKeyword) &&
    runDetailQueries.some((query) => query.isFetching);

  useEffect(() => {
    setPage(1);
  }, [applicationId, timeRange]);

  function selectRun(runId: string | null) {
    setSelectedRunId(runId);
    setOpenConversationLogMessage(null);
    setActiveFloatingWindow('run-detail');
  }

  if (runsQuery.isPending) {
    return <Result status="info" title="正在加载运行日志" />;
  }

  if (runsQuery.isError) {
    return <Result status="error" title="运行日志加载失败" />;
  }

  const logsHeader = (
    <div className="application-logs-page__header">
      <Typography.Title level={4}>运行日志</Typography.Title>
      <Typography.Paragraph type="secondary">
        这里展示应用运行记录，点击后可用浮窗查看对话和节点输入输出。
      </Typography.Paragraph>
      <div className="application-logs-page__filters" role="search">
        <Select<ApplicationLogTimeRange>
          aria-label="时间间隔"
          className="application-logs-page__filter-select"
          options={TIME_RANGE_OPTIONS}
          value={timeRange}
          onChange={setTimeRange}
        />
        <Input
          allowClear
          aria-label="关键字搜索"
          className="application-logs-page__filter-search"
          placeholder="搜索对话和回答"
          prefix={<SearchOutlined />}
          value={keywordSearch}
          onChange={(event) => setKeywordSearch(event.target.value)}
        />
        <Typography.Text type="secondary">
          默认按创建时间倒序展示，最新运行优先。
        </Typography.Text>
      </div>
    </div>
  );
  const logsList = (
    <section
      className="application-logs-page__list"
      data-testid="application-logs-list"
    >
      {runs.length === 0 ? (
        <Empty
          description="当前应用还没有运行记录"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : visibleRuns.length === 0 && !searchingRunDetails ? (
        <Empty
          description="没有符合筛选条件的运行记录"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <ApplicationRunsTable
          loading={searchingRunDetails}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          runs={visibleRuns}
          selectedRunId={selectedRunId}
          onPageChange={setPage}
          onSelectRun={selectRun}
        />
      )}
    </section>
  );

  return (
    <div className="application-logs-page" data-testid="application-logs-page">
      <div className="application-logs-page__stack">
        {logsHeader}
        {logsList}
      </div>
      {openConversationLogMessage ? (
        <ApplicationLogsFloatingWindow
          active={activeFloatingWindow === 'conversation-log'}
          initialRect={getConversationLogInitialRect}
          testId="application-logs-floating-conversation-log"
          title="对话日志"
          onActivate={() => setActiveFloatingWindow('conversation-log')}
        >
          <div className="application-logs-page__conversation-log-panel">
            <ConversationLogPanel
              message={openConversationLogMessage}
              onClose={() => setOpenConversationLogMessage(null)}
            />
          </div>
        </ApplicationLogsFloatingWindow>
      ) : null}
      {selectedRunId ? (
        <ApplicationLogsFloatingWindow
          active={activeFloatingWindow === 'run-detail'}
          initialRect={getRunDetailInitialRect}
          testId="application-logs-floating-run-detail"
          title="运行详情"
          onActivate={() => setActiveFloatingWindow('run-detail')}
        >
          <ApplicationRunDetailPanel
            applicationId={applicationId}
            onClose={() => selectRun(null)}
            onOpenMessageLog={(message) => {
              setOpenConversationLogMessage(message);
              setActiveFloatingWindow('conversation-log');
            }}
            runId={selectedRunId}
          />
        </ApplicationLogsFloatingWindow>
      ) : null}
    </div>
  );
}
