import { Alert, Button, Empty, Flex, Space, Tag, Typography } from 'antd';
import type { CSSProperties, FC, KeyboardEvent } from 'react';
import { useMemo } from 'react';

import type { FrontstagePageContent } from '../api/page-content';
import { RestrictedBlockRuntimePreview } from './RestrictedBlockRuntimePreview';
import type { FrontstagePageCanvasRuntimeSessionEntry } from '../hooks/use-frontstage-page-canvas-runtime-sessions';
import {
  createFrontstagePageDocument,
  type FrontstageBlockInstance,
  type FrontstagePageDocumentDiagnostic
} from '../lib/page-document';
import {
  createFrontstagePageRenderPlan,
  type FrontstageBlockRenderPlanItem
} from '../lib/page-canvas/render-plan';
import type {
  FrontstagePageCanvasRuntimeSource,
  FrontstagePageCanvasRuntimeSourceState
} from '../lib/page-canvas/runtime-source';
import type {
  FrontstagePageCanvasRuntimeRunPlanItem,
  FrontstagePageCanvasRuntimeRunPlanState
} from '../lib/page-canvas/runtime-run-plan';

type PageCanvasProps = {
  content?: FrontstagePageContent;
  isLoading?: boolean;
  hasError?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string | null) => void;
  onRetry?: () => void;
  runtimeSourceState?: FrontstagePageCanvasRuntimeSourceState | null;
  runtimeRunPlanState?: FrontstagePageCanvasRuntimeRunPlanState | null;
  runtimeSessionEntries?:
    | readonly FrontstagePageCanvasRuntimeSessionEntry[]
    | null;
};

function formatPageTitle(content: FrontstagePageContent): string {
  return content.page.title?.trim() || '未命名页面';
}

function formatOptional(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : '未设置';
}

function formatLayoutValue(value: unknown): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  return '未设置';
}

const preferredLayoutKeys = [
  'order',
  'region',
  'span',
  'width',
  'height',
  'gridColumn',
  'gridRow',
  'column',
  'row'
];

function isDisplayableLayoutValue(
  value: unknown
): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function formatLayoutEntries(
  layout: FrontstageBlockRenderPlanItem['layout']
): string[] {
  return Object.entries(layout)
    .filter(([, value]) => isDisplayableLayoutValue(value))
    .sort(([leftKey], [rightKey]) => {
      const leftIndex = preferredLayoutKeys.indexOf(leftKey);
      const rightIndex = preferredLayoutKeys.indexOf(rightKey);
      const normalizedLeftIndex =
        leftIndex === -1 ? preferredLayoutKeys.length : leftIndex;
      const normalizedRightIndex =
        rightIndex === -1 ? preferredLayoutKeys.length : rightIndex;

      if (normalizedLeftIndex === normalizedRightIndex) {
        return leftKey.localeCompare(rightKey);
      }

      return normalizedLeftIndex - normalizedRightIndex;
    })
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${String(value)}`);
}

function getDiagnosticTone(
  diagnostic: FrontstagePageDocumentDiagnostic
): 'error' | 'warning' {
  return diagnostic.severity === 'error' ? 'error' : 'warning';
}

const sectionStyle: CSSProperties = {
  border: '1px solid #f0f0f0',
  borderRadius: 6,
  padding: 12,
  background: '#fff'
};

const mutedSectionStyle: CSSProperties = {
  ...sectionStyle,
  background: '#fafafa'
};

const renderSlotFrameBaseStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #f0f0f0',
  borderRadius: 6,
  background: '#fff'
};

const renderSlotButtonBaseStyle: CSSProperties = {
  width: '100%',
  border: 0,
  background: 'transparent',
  padding: '10px 12px',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer'
};

const runtimePreviewAreaStyle: CSSProperties = {
  borderTop: '1px solid #f0f0f0',
  padding: '12px'
};

function getRuntimeSourceStatusText(
  source: FrontstagePageCanvasRuntimeSource
): string {
  switch (source.status) {
    case 'ready':
      return '代码已就绪';
    case 'loading':
      return '代码读取中';
    case 'missing':
      return '代码缺失';
    case 'failed':
      return '代码读取失败';
    case 'skipped':
      return '跳过运行';
  }
}

function getRuntimeSourceStatusColor(
  source: FrontstagePageCanvasRuntimeSource
): string {
  switch (source.status) {
    case 'ready':
      return 'success';
    case 'loading':
      return 'processing';
    case 'missing':
      return 'warning';
    case 'failed':
      return 'error';
    case 'skipped':
      return 'default';
  }
}

function getRuntimeRunPlanStatusText(
  runPlan: FrontstagePageCanvasRuntimeRunPlanItem
): string {
  switch (runPlan.status) {
    case 'run_plan_ready':
      return '运行计划已就绪';
    case 'source_not_ready':
      return '等待代码状态';
    case 'catalog_missing':
      return 'Catalog 未匹配';
    case 'rejected':
      return '运行计划失败';
  }
}

function getRuntimeRunPlanStatusColor(
  runPlan: FrontstagePageCanvasRuntimeRunPlanItem
): string {
  switch (runPlan.status) {
    case 'run_plan_ready':
      return 'success';
    case 'source_not_ready':
      return 'processing';
    case 'catalog_missing':
      return 'warning';
    case 'rejected':
      return 'error';
  }
}

function getRenderSlotStateText(
  item: FrontstageBlockRenderPlanItem,
  source?: FrontstagePageCanvasRuntimeSource | null
): string {
  if (source) {
    return getRuntimeSourceStatusText(source);
  }

  if (item.renderMode === 'restricted_js_block') {
    return item.canEnterRestrictedJsRuntime
      ? '可运行，等待运行时接入'
      : '等待运行时接入';
  }

  return '占位显示';
}

function getRenderSlotStateColor(
  item: FrontstageBlockRenderPlanItem,
  source?: FrontstagePageCanvasRuntimeSource | null
): string {
  if (source) {
    return getRuntimeSourceStatusColor(source);
  }

  return item.renderMode === 'placeholder' ? 'warning' : 'green';
}

function findRuntimeSourceForSlot({
  item,
  slotIndex,
  pageId,
  runtimeSourceState
}: {
  item: FrontstageBlockRenderPlanItem;
  slotIndex: number;
  pageId: string;
  runtimeSourceState?: FrontstagePageCanvasRuntimeSourceState | null;
}): FrontstagePageCanvasRuntimeSource | null {
  if (!runtimeSourceState || runtimeSourceState.pageId !== pageId) {
    return null;
  }

  return (
    runtimeSourceState.sources.find(
      (source) =>
        source.slotIndex === slotIndex &&
        source.sourceIndex === item.sourceIndex &&
        source.blockId === item.blockId &&
        source.codeRef === item.codeRef
    ) ?? null
  );
}

function findRuntimeRunPlanForSlot({
  item,
  slotIndex,
  pageId,
  runtimeRunPlanState
}: {
  item: FrontstageBlockRenderPlanItem;
  slotIndex: number;
  pageId: string;
  runtimeRunPlanState?: FrontstagePageCanvasRuntimeRunPlanState | null;
}): FrontstagePageCanvasRuntimeRunPlanItem | null {
  if (!runtimeRunPlanState || runtimeRunPlanState.pageId !== pageId) {
    return null;
  }

  return (
    runtimeRunPlanState.items.find(
      (runPlan) =>
        runPlan.slotIndex === slotIndex &&
        runPlan.blockId === item.blockId &&
        runPlan.codeRef === item.codeRef
    ) ?? null
  );
}

function findRuntimeSessionEntryForSlot({
  item,
  slotIndex,
  runtimeSessionEntries
}: {
  item: FrontstageBlockRenderPlanItem;
  slotIndex: number;
  runtimeSessionEntries?:
    | readonly FrontstagePageCanvasRuntimeSessionEntry[]
    | null;
}): FrontstagePageCanvasRuntimeSessionEntry | null {
  if (!runtimeSessionEntries || runtimeSessionEntries.length === 0) {
    return null;
  }

  return (
    runtimeSessionEntries.find(
      (entry) =>
        entry.slotIndex === slotIndex &&
        entry.sourceIndex === item.sourceIndex &&
        entry.blockId === item.blockId &&
        entry.codeRef === item.codeRef
    ) ??
    runtimeSessionEntries.find(
      (entry) =>
        entry.slotIndex === slotIndex &&
        entry.blockId === item.blockId &&
        entry.codeRef === item.codeRef
    ) ??
    runtimeSessionEntries.find((entry) => entry.slotIndex === slotIndex) ??
    null
  );
}

function RuntimeSessionPreview({
  entry,
  runPlan
}: {
  entry?: FrontstagePageCanvasRuntimeSessionEntry | null;
  runPlan?: FrontstagePageCanvasRuntimeRunPlanItem | null;
}) {
  if (entry && 'snapshot' in entry) {
    return (
      <div style={runtimePreviewAreaStyle}>
        <RestrictedBlockRuntimePreview snapshot={entry.snapshot} />
      </div>
    );
  }

  if (entry?.status === 'factory_failed') {
    return (
      <div style={runtimePreviewAreaStyle}>
        <Alert
          type="error"
          showIcon
          message="运行时预览不可用"
          description="受限运行时会话创建失败。"
        />
      </div>
    );
  }

  const placeholder = getRuntimePreviewPlaceholderText(entry, runPlan);
  if (!placeholder) {
    return null;
  }

  return (
    <div style={runtimePreviewAreaStyle}>
      <Typography.Text type="secondary">{placeholder}</Typography.Text>
    </div>
  );
}

function getRuntimePreviewPlaceholderText(
  entry?: FrontstagePageCanvasRuntimeSessionEntry | null,
  runPlan?: FrontstagePageCanvasRuntimeRunPlanItem | null
): string | null {
  const skippedReason = entry?.status === 'skipped' ? entry.skipReason : null;
  const runPlanStatus =
    runPlan && runPlan.status !== 'run_plan_ready' ? runPlan.status : null;
  const reason = skippedReason ?? runPlanStatus;

  switch (reason) {
    case 'source_not_ready':
      return '运行时预览等待代码就绪';
    case 'catalog_missing':
      return '运行时预览等待 Catalog 匹配';
    case 'rejected':
      return '运行时预览未生成';
    default:
      return runPlan?.status === 'run_plan_ready'
        ? '运行时预览等待运行时会话'
        : null;
  }
}

function RenderPlanSlot({
  item,
  source,
  runPlan,
  runtimeSessionEntry,
  isSelected,
  onSelectBlock
}: {
  item: FrontstageBlockRenderPlanItem;
  source?: FrontstagePageCanvasRuntimeSource | null;
  runPlan?: FrontstagePageCanvasRuntimeRunPlanItem | null;
  runtimeSessionEntry?: FrontstagePageCanvasRuntimeSessionEntry | null;
  isSelected: boolean;
  onSelectBlock?: (blockId: string | null) => void;
}) {
  const frameStyle: CSSProperties = {
    ...renderSlotFrameBaseStyle,
    borderColor: isSelected ? '#1677ff' : '#f0f0f0',
    background: isSelected ? '#e6f4ff' : '#fff'
  };
  const buttonStyle: CSSProperties = {
    ...renderSlotButtonBaseStyle,
    background: 'transparent'
  };

  const handleSelect = () => {
    onSelectBlock?.(item.blockId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  };

  const fallbackReasons =
    source?.status === 'skipped'
      ? source.fallbackReasons
      : item.fallbackReasons;

  return (
    <div style={frameStyle}>
      <button
        type="button"
        style={buttonStyle}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Flex justify="space-between" align="flex-start" gap={12} wrap>
            <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
              <Typography.Text strong ellipsis style={{ maxWidth: 360 }}>
                {item.blockId}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {item.contribution.code} · {item.codeRef}
              </Typography.Text>
            </Space>
            <Space size={6} wrap>
              <Tag
                color={item.renderMode === 'placeholder' ? 'default' : 'blue'}
              >
                {item.renderMode}
              </Tag>
              <Tag color={getRenderSlotStateColor(item, source)}>
                {getRenderSlotStateText(item, source)}
              </Tag>
              {runPlan ? (
                <Tag color={getRuntimeRunPlanStatusColor(runPlan)}>
                  {getRuntimeRunPlanStatusText(runPlan)}
                </Tag>
              ) : null}
              <Tag>#{item.order}</Tag>
            </Space>
          </Flex>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '112px minmax(0, 1fr)',
              rowGap: 4,
              columnGap: 8
            }}
          >
            <Typography.Text type="secondary">Runtime</Typography.Text>
            <Typography.Text>
              {item.runtime.kind} · {formatOptional(item.runtime.entry)}
            </Typography.Text>
            <Typography.Text type="secondary">Layout</Typography.Text>
            <Space size={6} wrap>
              {formatLayoutEntries(item.layout).map((entry) => (
                <Typography.Text key={entry} type="secondary">
                  {entry}
                </Typography.Text>
              ))}
            </Space>
          </div>

          {fallbackReasons.length > 0 ? (
            <Space size={6} wrap>
              {fallbackReasons.map((reason) => (
                <Tag key={`${reason.code}-${reason.path}`} color="warning">
                  {reason.code}
                </Tag>
              ))}
            </Space>
          ) : null}
        </Space>
      </button>
      <RuntimeSessionPreview entry={runtimeSessionEntry} runPlan={runPlan} />
    </div>
  );
}

function SelectedBlockPanel({
  block
}: {
  block: FrontstageBlockInstance | null;
}) {
  if (!block) {
    return (
      <div style={mutedSectionStyle}>
        <Typography.Text type="secondary">未选择区块</Typography.Text>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Typography.Text strong>已选区块</Typography.Text>
        <Flex wrap gap={8}>
          <Tag color="blue">{block.id}</Tag>
          <Tag>{block.contribution.code}</Tag>
          <Tag>{block.runtime.kind}</Tag>
        </Flex>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '96px minmax(0, 1fr)',
            rowGap: 6,
            columnGap: 8
          }}
        >
          <Typography.Text type="secondary">Code Ref</Typography.Text>
          <Typography.Text>{block.codeRef}</Typography.Text>
          <Typography.Text type="secondary">Plugin</Typography.Text>
          <Typography.Text>
            {formatOptional(block.contribution.pluginId)}
          </Typography.Text>
          <Typography.Text type="secondary">Runtime Entry</Typography.Text>
          <Typography.Text>
            {formatOptional(block.runtime.entry)}
          </Typography.Text>
          <Typography.Text type="secondary">Region</Typography.Text>
          <Typography.Text>
            {formatLayoutValue(block.layout.region)}
          </Typography.Text>
        </div>
      </Space>
    </div>
  );
}

export const PageCanvas: FC<PageCanvasProps> = ({
  content,
  isLoading,
  hasError,
  selectedBlockId = null,
  onSelectBlock,
  onRetry,
  runtimeSourceState,
  runtimeRunPlanState,
  runtimeSessionEntries
}) => {
  const document = useMemo(
    () => (content ? createFrontstagePageDocument(content) : null),
    [content]
  );
  const renderPlan = useMemo(
    () => (document ? createFrontstagePageRenderPlan(document) : null),
    [document]
  );
  const renderItems = renderPlan?.items ?? [];
  const selectedBlock =
    document?.blocks.find((block) => block.id === selectedBlockId) ?? null;

  if (isLoading) {
    return (
      <div style={mutedSectionStyle}>
        <Space direction="vertical" size={4}>
          <Typography.Text strong>页面内容加载中</Typography.Text>
          <Typography.Text type="secondary">
            正在读取页面内容和区块清单。
          </Typography.Text>
        </Space>
      </div>
    );
  }

  if (hasError) {
    return (
      <Alert
        type="error"
        showIcon
        message="页面内容加载失败"
        description="请检查网络后重试，画布不会使用过期内容进行渲染。"
        action={
          onRetry ? (
            <Button size="small" onClick={onRetry}>
              重试
            </Button>
          ) : null
        }
      />
    );
  }

  if (!content || !document || !renderPlan) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" size={2}>
            <Typography.Text>未选择页面内容</Typography.Text>
            <Typography.Text type="secondary">
              选择页面后将显示只读内容画布。
            </Typography.Text>
          </Space>
        }
      />
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Flex
        justify="space-between"
        align="center"
        wrap
        gap={12}
        style={sectionStyle}
      >
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{formatPageTitle(content)}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Root {document.rootUid}
          </Typography.Text>
        </Space>
        <Space size={8} wrap>
          <Tag>{document.blocks.length} 个区块</Tag>
          <Tag>{renderItems.length} 个槽位</Tag>
          <Tag
            color={renderPlan.diagnostics.length > 0 ? 'warning' : 'success'}
          >
            {renderPlan.diagnostics.length} 条诊断
          </Tag>
        </Space>
      </Flex>

      {renderPlan.diagnostics.length > 0 ? (
        <div data-testid="page-canvas-diagnostics" style={sectionStyle}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Typography.Text strong>文档诊断</Typography.Text>
            {renderPlan.diagnostics.map((diagnostic, index) => (
              <Alert
                key={`${diagnostic.code}-${diagnostic.path}-${index}`}
                type={getDiagnosticTone(diagnostic)}
                showIcon
                message={
                  <Space size={6} wrap>
                    <Typography.Text>{diagnostic.code}</Typography.Text>
                    <Typography.Text type="secondary">
                      {diagnostic.path}
                    </Typography.Text>
                  </Space>
                }
                description={diagnostic.message}
              />
            ))}
          </Space>
        </div>
      ) : null}

      {renderPlan.isEmpty ? (
        <div style={mutedSectionStyle}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Typography.Text type="secondary">页面内容为空</Typography.Text>
            }
          />
        </div>
      ) : (
        <Flex gap={12} align="flex-start" wrap>
          <div style={{ ...sectionStyle, flex: '1 1 auto', minWidth: 0 }}>
            <Space
              data-testid="page-canvas-render-slots"
              direction="vertical"
              size={8}
              style={{ width: '100%' }}
            >
              <Typography.Text strong>渲染槽位</Typography.Text>
              {renderItems.map((item, slotIndex) => (
                <RenderPlanSlot
                  key={item.blockId}
                  item={item}
                  source={findRuntimeSourceForSlot({
                    item,
                    slotIndex,
                    pageId: renderPlan.pageId,
                    runtimeSourceState
                  })}
                  runPlan={findRuntimeRunPlanForSlot({
                    item,
                    slotIndex,
                    pageId: renderPlan.pageId,
                    runtimeRunPlanState
                  })}
                  runtimeSessionEntry={findRuntimeSessionEntryForSlot({
                    item,
                    slotIndex,
                    runtimeSessionEntries
                  })}
                  isSelected={item.blockId === selectedBlockId}
                  onSelectBlock={onSelectBlock}
                />
              ))}
            </Space>
          </div>
          <div style={{ width: 320, flex: '1 0 280px', maxWidth: 360 }}>
            <SelectedBlockPanel block={selectedBlock} />
          </div>
        </Flex>
      )}
    </Space>
  );
};
