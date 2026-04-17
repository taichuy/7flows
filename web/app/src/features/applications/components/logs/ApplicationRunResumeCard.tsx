import { Button, Input, Space, Typography } from 'antd';
import { useState } from 'react';

import type { ApplicationRunDetail } from '../../api/runtime';

export function ApplicationRunResumeCard({
  detail,
  onResume,
  onCompleteCallback
}: {
  detail: ApplicationRunDetail;
  onResume: (
    checkpointId: string,
    inputPayload: Record<string, unknown>
  ) => Promise<unknown>;
  onCompleteCallback: (
    callbackTaskId: string,
    responsePayload: Record<string, unknown>
  ) => Promise<unknown>;
}) {
  const [humanInput, setHumanInput] = useState('');
  const [callbackJson, setCallbackJson] = useState('{\n  "result": {}\n}');
  const latestCheckpoint = detail.checkpoints[detail.checkpoints.length - 1] ?? null;
  const pendingCallback =
    detail.callback_tasks.find((task) => task.status === 'pending') ?? null;

  if (detail.flow_run.status === 'waiting_human' && latestCheckpoint) {
    const waitingNodeId =
      (latestCheckpoint.locator_payload?.node_id as string | undefined) ?? 'node-human';

    return (
      <div>
        <Typography.Title level={5}>继续执行</Typography.Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>
            {(latestCheckpoint.external_ref_payload?.prompt as string | undefined) ??
              '请提供人工输入'}
          </Typography.Text>
          <Input.TextArea
            aria-label="人工输入"
            rows={4}
            value={humanInput}
            onChange={(event) => setHumanInput(event.target.value)}
          />
          <Button
            type="primary"
            onClick={() =>
              void onResume(latestCheckpoint.id, {
                [waitingNodeId]: { input: humanInput }
              })
            }
          >
            提交并继续
          </Button>
        </Space>
      </div>
    );
  }

  if (detail.flow_run.status === 'waiting_callback' && pendingCallback) {
    return (
      <div>
        <Typography.Title level={5}>Callback 回填</Typography.Title>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text>{pendingCallback.callback_kind}</Typography.Text>
          <Input.TextArea
            aria-label="Callback 响应"
            rows={6}
            value={callbackJson}
            onChange={(event) => setCallbackJson(event.target.value)}
          />
          <Button
            type="primary"
            onClick={() =>
              void onCompleteCallback(
                pendingCallback.id,
                JSON.parse(callbackJson) as Record<string, unknown>
              )
            }
          >
            回填并继续
          </Button>
        </Space>
      </div>
    );
  }

  return null;
}
