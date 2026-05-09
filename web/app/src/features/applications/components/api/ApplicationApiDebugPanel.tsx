import { useMemo, useState } from 'react';

import { Button, Input, Segmented, Space, Typography } from 'antd';

import { getApplicationsApiBaseUrl } from '../../api/applications';

type DebugMode = 'native' | 'openai' | 'anthropic';

const examples: Record<DebugMode, unknown> = {
  native: {
    query: 'Summarize the incident',
    inputs: {},
    history: [],
    attachments: [],
    response_mode: 'blocking'
  },
  openai: {
    model: 'provider/model',
    messages: [{ role: 'user', content: 'Summarize the incident' }]
  },
  anthropic: {
    model: 'provider/model',
    max_tokens: 512,
    messages: [{ role: 'user', content: 'Summarize the incident' }]
  }
};

export function ApplicationApiDebugPanel({
  createdToken
}: {
  createdToken: string | null;
}) {
  const [mode, setMode] = useState<DebugMode>('native');
  const [apiKey, setApiKey] = useState('');
  const [bodyText, setBodyText] = useState(JSON.stringify(examples.native, null, 2));
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  const effectiveToken = apiKey.trim() || createdToken || '';
  const endpoint = useMemo(() => endpointForMode(mode), [mode]);

  async function runRequest() {
    setRunning(true);
    try {
      const response = await fetch(`${getApplicationsApiBaseUrl()}${endpoint}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${effectiveToken}`,
          'content-type': 'application/json'
        },
        body: bodyText
      });
      const text = await response.text();
      setResult(text);
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'request failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="application-api-panel">
      <Space direction="vertical" size={12} className="application-api-panel__stack">
        <Typography.Title level={4}>Debug</Typography.Title>
        <Segmented<DebugMode>
          value={mode}
          options={[
            { label: 'Native', value: 'native' },
            { label: 'OpenAI', value: 'openai' },
            { label: 'Anthropic', value: 'anthropic' }
          ]}
          onChange={(nextMode) => {
            setMode(nextMode);
            setBodyText(JSON.stringify(examples[nextMode], null, 2));
            setResult('');
          }}
        />
        <Input.Password
          aria-label="API Key"
          placeholder={createdToken ? '使用刚创建的内存 token' : '粘贴 API Key'}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <Typography.Text code>{endpoint}</Typography.Text>
        <Input.TextArea
          aria-label="请求体"
          rows={10}
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
        />
        <Button
          type="primary"
          loading={running}
          disabled={!effectiveToken}
          onClick={runRequest}
        >
          运行请求
        </Button>
        <Input.TextArea aria-label="响应" rows={10} value={result} readOnly />
      </Space>
    </section>
  );
}

function endpointForMode(mode: DebugMode) {
  switch (mode) {
    case 'openai':
      return '/v1/chat/completions';
    case 'anthropic':
      return '/v1/messages';
    default:
      return '/api/1flowbase/runs';
  }
}
