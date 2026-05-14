import { useQuery } from '@tanstack/react-query';
import { Empty, Result, Space, Splitter, Typography } from 'antd';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { AgentFlowDebugMessage } from '../../agent-flow/api/runtime';
import { ConversationLogPanel } from '../../agent-flow/components/debug-console/ConversationLogPanel';
import {
  applicationRunsQueryKey,
  fetchApplicationRuns
} from '../api/runtime';
import { ApplicationRunDetailPanel } from '../components/logs/ApplicationRunDetailPanel';
import { ApplicationRunsTable } from '../components/logs/ApplicationRunsTable';
import './application-logs-page.css';

export function ApplicationLogsPage({
  applicationId
}: {
  applicationId: string;
}) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [openConversationLogMessage, setOpenConversationLogMessage] =
    useState<AgentFlowDebugMessage | null>(null);
  const [splitterHeight, setSplitterHeight] = useState<number | null>(null);
  const [runsTableBodyHeight, setRunsTableBodyHeight] = useState<number | null>(
    null
  );
  const listRef = useRef<HTMLElement | null>(null);
  const splitterRef = useRef<HTMLDivElement | null>(null);
  const runsQuery = useQuery({
    queryKey: applicationRunsQueryKey(applicationId),
    queryFn: () => fetchApplicationRuns(applicationId)
  });

  useEffect(() => {
    if (!selectedRunId) {
      setSplitterHeight(null);
      setRunsTableBodyHeight(null);
      return;
    }

    function updateWorkspaceMeasurements() {
      const splitterElement = splitterRef.current;

      if (!splitterElement) {
        return;
      }

      const availableHeight = Math.floor(
        window.innerHeight - splitterElement.getBoundingClientRect().top
      );

      if (availableHeight <= 0) {
        return;
      }

      setSplitterHeight((currentHeight) =>
        currentHeight === availableHeight ? currentHeight : availableHeight
      );

      const tableHeaderElement = splitterElement.querySelector<HTMLElement>(
        '.application-logs-page__list .ant-table-thead'
      );
      const tableHeaderHeight =
        Math.ceil(tableHeaderElement?.getBoundingClientRect().height ?? 0) ||
        56;
      const nextRunsTableBodyHeight = Math.max(
        160,
        availableHeight - tableHeaderHeight
      );

      setRunsTableBodyHeight((currentHeight) =>
        currentHeight === nextRunsTableBodyHeight
          ? currentHeight
          : nextRunsTableBodyHeight
      );
    }

    updateWorkspaceMeasurements();

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateWorkspaceMeasurements);

    if (resizeObserver && splitterRef.current) {
      resizeObserver.observe(splitterRef.current);
    }

    if (resizeObserver && listRef.current) {
      resizeObserver.observe(listRef.current);
    }

    window.addEventListener('resize', updateWorkspaceMeasurements);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateWorkspaceMeasurements);
    };
  }, [selectedRunId]);

  function selectRun(runId: string | null) {
    setSelectedRunId(runId);
    setOpenConversationLogMessage(null);
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
        这里展示应用运行记录，点击后可在右侧直接查看对话和节点输入输出。
      </Typography.Paragraph>
    </div>
  );
  const isDetailOpen = Boolean(selectedRunId);
  const logsListStyle =
    isDetailOpen && runsTableBodyHeight
      ? ({
          '--application-runs-table-body-height': `${runsTableBodyHeight}px`
        } as CSSProperties)
      : undefined;
  const logsList = (
    <section
      className="application-logs-page__list"
      ref={listRef}
      style={logsListStyle}
    >
      {runsQuery.data.length === 0 ? (
        <Empty
          description="当前应用还没有运行记录"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <ApplicationRunsTable
          runs={runsQuery.data}
          selectedRunId={selectedRunId}
          scrollY={
            isDetailOpen ? (runsTableBodyHeight ?? undefined) : undefined
          }
          onSelectRun={selectRun}
        />
      )}
    </section>
  );

  if (!selectedRunId) {
    return (
      <div className="application-logs-page">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {logsHeader}
          {logsList}
        </Space>
      </div>
    );
  }

  return (
    <div className="application-logs-page application-logs-page--detail-open">
      {logsHeader}
      <div
        className="application-logs-page__splitter"
        data-testid="application-logs-splitter"
        ref={splitterRef}
        style={splitterHeight ? { height: splitterHeight } : undefined}
      >
        <Splitter className="application-logs-page__splitter-control">
          <Splitter.Panel
            className="application-logs-page__splitter-panel"
            min={openConversationLogMessage ? 360 : 480}
          >
            {logsList}
          </Splitter.Panel>
          {openConversationLogMessage ? (
            <Splitter.Panel
              className="application-logs-page__splitter-panel"
              defaultSize={480}
              max="50%"
              min={360}
            >
              <div
                className="application-logs-page__conversation-log-panel"
                data-testid="application-logs-conversation-log-panel"
              >
                <ConversationLogPanel
                  message={openConversationLogMessage}
                  onClose={() => setOpenConversationLogMessage(null)}
                />
              </div>
            </Splitter.Panel>
          ) : null}
          <Splitter.Panel
            className="application-logs-page__splitter-panel"
            defaultSize={480}
            max={openConversationLogMessage ? '45%' : '60%'}
            min={360}
          >
            <ApplicationRunDetailPanel
              applicationId={applicationId}
              onClose={() => selectRun(null)}
              onOpenMessageLog={setOpenConversationLogMessage}
              runId={selectedRunId}
            />
          </Splitter.Panel>
        </Splitter>
      </div>
    </div>
  );
}
