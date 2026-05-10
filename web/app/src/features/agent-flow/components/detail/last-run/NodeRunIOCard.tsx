import { App, Button, Card, Space, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import type { NodeLastRun } from '../../../api/runtime';
import { fetchRuntimeDebugArtifact } from '../../../api/runtime';
import { JsonPreviewBlock } from '../../../../../shared/ui/json-preview/JsonPreviewBlock';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function pickProcessPayload(debugPayload: unknown) {
  return isRecord(debugPayload) ? debugPayload : {};
}

export function NodeRunPayloadSections({
  inputPayload,
  debugPayload,
  outputPayload,
  onLoadArtifact
}: {
  inputPayload: unknown;
  debugPayload: unknown;
  outputPayload: unknown;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
}) {
  const processPayload = pickProcessPayload(debugPayload);

  return (
    <>
      <NodeRunJsonBlock
        payload={inputPayload}
        title="输入"
        onLoadArtifact={onLoadArtifact}
      />
      <NodeRunJsonBlock
        payload={processPayload}
        title="数据处理"
        onLoadArtifact={onLoadArtifact}
      />
      <NodeRunJsonBlock
        payload={outputPayload}
        title="输出"
        onLoadArtifact={onLoadArtifact}
      />
    </>
  );
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
  const [loadedPayload, setLoadedPayload] = useState<unknown>(null);
  const artifactRef = useMemo(
    () => findRuntimeDebugArtifactRef(payload),
    [payload]
  );
  const displayPayload = loadedPayload ?? payload;

  useEffect(() => {
    setLoadedPayload(null);
  }, [payload]);

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
    <JsonPreviewBlock
      actions={
        artifactRef ? (
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
        ) : null
      }
      height="220px"
      title={title}
      value={displayPayload}
    />
  );
}

export function NodeRunIOCard({ lastRun }: { lastRun: NodeLastRun }) {
  const applicationId = lastRun.flow_run.application_id;

  return (
    <Card title="节点输入输出">
      <div className="agent-flow-node-run-json-list">
        <NodeRunPayloadSections
          inputPayload={lastRun.node_run.input_payload}
          debugPayload={lastRun.node_run.debug_payload}
          outputPayload={lastRun.node_run.output_payload}
          onLoadArtifact={(artifactRef) =>
            fetchRuntimeDebugArtifact(applicationId, artifactRef)
          }
        />
      </div>
    </Card>
  );
}
