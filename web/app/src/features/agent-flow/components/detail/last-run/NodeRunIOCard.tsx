import {
  CheckOutlined,
  CopyOutlined,
  DownOutlined,
  FullscreenOutlined
} from '@ant-design/icons';
import { App, Button, Card, Modal, Space, Tag, Tooltip } from 'antd';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';

import type { NodeLastRun } from '../../../api/runtime';
import { fetchRuntimeDebugArtifact } from '../../../api/runtime';
import { useClipboardCopy } from '../../../../../shared/ui/clipboard/use-clipboard-copy';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

function formatJson(payload: unknown) {
  return JSON.stringify(payload, null, 2);
}

function findRuntimeDebugArtifactRef(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedRef = findRuntimeDebugArtifactRef(item);
      if (nestedRef) {
        return nestedRef;
      }
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.__runtime_debug_artifact === true &&
    typeof record.artifact_ref === 'string'
  ) {
    return record.artifact_ref;
  }

  for (const nestedValue of Object.values(record)) {
    const nestedRef = findRuntimeDebugArtifactRef(nestedValue);
    if (nestedRef) {
      return nestedRef;
    }
  }

  return null;
}

const EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  lineNumbersMinChars: 2,
  fontSize: 12,
  lineHeight: 18,
  folding: true,
  renderLineHighlight: 'none' as const,
  overviewRulerBorder: false,
  automaticLayout: true,
  padding: {
    top: 8,
    bottom: 8
  },
  scrollbar: {
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8
  }
};

function JsonEditorFallback() {
  return (
    <div className="agent-flow-node-run-json-viewer__loading">
      正在加载 JSON 查看器
    </div>
  );
}

function JsonEditor({ height, value }: { height: string; value: string }) {
  return (
    <Suspense fallback={<JsonEditorFallback />}>
      <MonacoEditor
        defaultLanguage="json"
        height={height}
        options={EDITOR_OPTIONS}
        theme="vs"
        value={value}
      />
    </Suspense>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getProcessPayload(lastRun: NodeLastRun) {
  return pickProcessPayload(lastRun.node_run.debug_payload);
}

const PROCESS_PAYLOAD_KEYS = [
  'provider_events',
  'tool_calls',
  'mcp_calls',
  'reasoning_content',
  'process_events',
  'execution_events',
  'steps',
  'transforms',
  'calculations'
];

export function pickProcessPayload(debugPayload: unknown) {
  if (!isRecord(debugPayload)) {
    return {};
  }

  const processPayload: Record<string, unknown> = {};

  for (const key of PROCESS_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(debugPayload, key)) {
      processPayload[key] = debugPayload[key];
    }
  }

  return processPayload;
}

function isSameJsonValue(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function omitProcessPayloadFromOutput(
  outputPayload: unknown,
  processPayload: unknown
) {
  if (!isRecord(outputPayload) || !isRecord(processPayload)) {
    return outputPayload;
  }

  const entries = Object.entries(outputPayload).filter(
    ([key, value]) =>
      !Object.prototype.hasOwnProperty.call(processPayload, key) ||
      !isSameJsonValue(value, processPayload[key])
  );

  return Object.fromEntries(entries);
}

export function NodeRunJsonBlock({
  title,
  payload,
  onLoadArtifact
}: {
  title: string;
  payload: unknown;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  const { message } = App.useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loadedPayload, setLoadedPayload] = useState<unknown>(null);
  const { copied, copy } = useClipboardCopy();
  const artifactRef = useMemo(
    () => findRuntimeDebugArtifactRef(payload),
    [payload]
  );
  const displayPayload = loadedPayload ?? payload;
  const value = useMemo(() => formatJson(displayPayload), [displayPayload]);

  useEffect(() => {
    setLoadedPayload(null);
  }, [payload]);

  const handleCopy = async () => {
    try {
      await copy(value);
      message.success('已复制');
    } catch {
      message.error('复制失败');
    }
  };

  const handleLoadFullValue = async () => {
    if (!artifactRef || !onLoadArtifact) {
      return;
    }

    try {
      setLoadedPayload(await onLoadArtifact(artifactRef));
      message.success('已加载完整值');
    } catch {
      message.error('加载完整值失败');
    }
  };

  return (
    <section className="agent-flow-node-run-json-viewer">
      <pre
        aria-label={`${title} JSON`}
        className="agent-flow-node-run-json__a11y"
      >
        {value}
      </pre>
      <div className="agent-flow-node-run-json-viewer__header">
        <button
          aria-label={title}
          aria-expanded={!collapsed}
          className="agent-flow-node-run-json-viewer__toggle"
          onClick={() => setCollapsed((current) => !current)}
          type="button"
        >
          <DownOutlined className="agent-flow-node-run-json-viewer__toggle-icon" />
          <span className="agent-flow-node-run-json-viewer__title">
            {title}
          </span>
        </button>
        <div className="agent-flow-node-run-json-viewer__actions">
          {artifactRef ? (
            <Space size={6} wrap>
              <Tag color="warning">已截断</Tag>
              <Button
                disabled={!onLoadArtifact}
                onClick={handleLoadFullValue}
                size="small"
              >
                加载完整值
              </Button>
            </Space>
          ) : null}
          <Tooltip title="复制 JSON">
            <Button
              aria-label={`复制${title} JSON`}
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={handleCopy}
              size="small"
              type="text"
            />
          </Tooltip>
          <Tooltip title="放大查看">
            <Button
              aria-label={`放大查看${title} JSON`}
              disabled={collapsed}
              icon={<FullscreenOutlined />}
              onClick={() => setExpanded(true)}
              size="small"
              type="text"
            />
          </Tooltip>
        </div>
      </div>
      {!collapsed ? (
        <div className="agent-flow-node-run-json-viewer__editor">
          <JsonEditor height="220px" value={value} />
        </div>
      ) : null}
      <Modal
        centered
        className="agent-flow-node-run-json-modal"
        footer={null}
        onCancel={() => setExpanded(false)}
        open={expanded}
        title={`${title} JSON`}
        width="min(960px, calc(100vw - 48px))"
      >
        <div className="agent-flow-node-run-json-modal__editor">
          <JsonEditor height="70vh" value={value} />
        </div>
      </Modal>
    </section>
  );
}

export function NodeRunIOCard({ lastRun }: { lastRun: NodeLastRun }) {
  const applicationId = lastRun.flow_run.application_id;
  const processPayload = getProcessPayload(lastRun);
  const outputPayload = omitProcessPayloadFromOutput(
    lastRun.node_run.output_payload,
    processPayload
  );

  return (
    <Card title="节点输入输出">
      <div className="agent-flow-node-run-json-list">
        <NodeRunJsonBlock
          payload={lastRun.node_run.input_payload}
          title="输入"
          onLoadArtifact={(artifactRef) =>
            fetchRuntimeDebugArtifact(applicationId, artifactRef)
          }
        />
        <NodeRunJsonBlock
          payload={processPayload}
          title="数据处理"
          onLoadArtifact={(artifactRef) =>
            fetchRuntimeDebugArtifact(applicationId, artifactRef)
          }
        />
        <NodeRunJsonBlock
          payload={outputPayload}
          title="输出"
          onLoadArtifact={(artifactRef) =>
            fetchRuntimeDebugArtifact(applicationId, artifactRef)
          }
        />
      </div>
    </Card>
  );
}
