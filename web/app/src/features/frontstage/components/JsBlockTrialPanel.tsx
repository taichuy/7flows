import {
  BLOCK_DATA_PERMISSIONS,
  type BlockDataPermission
} from '@1flowbase/page-protocol';
import { Alert, Button, Descriptions, Input, Space, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  RestrictedBlockRuntimePreview,
  type RestrictedBlockRuntimeActionEvent
} from './RestrictedBlockRuntimePreview';
import type { NormalizedFrontstageBlockCatalogEntry } from '../lib/block-catalog';
import {
  createFrontstageRestrictedBlockRuntimeSession,
  type FrontstageRestrictedBlockRuntimeHostOptions,
  type FrontstageRestrictedBlockRuntimeSession
} from '../lib/frontstage-restricted-block-runtime-host';
import type { FrontstageBlockInstance } from '../lib/page-document';
import {
  createRestrictedBlockRunPlan,
  type RestrictedBlockLoaderLimits
} from '../lib/restricted-block-loader';
import type { RestrictedBlockRuntimeHostSnapshot } from '../lib/restricted-block-runtime-host';

export type JsBlockTrialPanelRuntimeSessionFactory = (
  options: FrontstageRestrictedBlockRuntimeHostOptions
) => FrontstageRestrictedBlockRuntimeSession;

export interface JsBlockTrialPanelProps {
  block: FrontstageBlockInstance | null | undefined;
  catalogEntry: NormalizedFrontstageBlockCatalogEntry | null | undefined;
  code: string;
  contextSnapshot: Record<string, unknown>;
  limits?: RestrictedBlockLoaderLimits;
  runtimeSnapshot?: RestrictedBlockRuntimeHostSnapshot;
  runtimeSessionFactory?: JsBlockTrialPanelRuntimeSessionFactory;
  onCodeChange?: (code: string) => void;
  onContextSnapshotChange?: (contextSnapshot: Record<string, unknown>) => void;
  onLimitsChange?: (limits: RestrictedBlockLoaderLimits) => void;
  onRuntimeAction?: (event: RestrictedBlockRuntimeActionEvent) => void;
}

type JsonDraftKind = 'context' | 'limits';

interface JsonDraftError {
  kind: JsonDraftKind;
  message: string;
}

interface ActiveRuntimeSession {
  session: FrontstageRestrictedBlockRuntimeSession;
  unsubscribe: () => void;
}

const dataPermissionSet = new Set<string>(BLOCK_DATA_PERMISSIONS);

function stringifyDraft(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(
  value: string,
  label: string
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string } {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return { ok: false, message: `${label} 必须是 JSON object。` };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, message: `${label} 不是有效 JSON。` };
  }
}

function formatList(values: readonly unknown[] | undefined): string {
  if (!values || values.length === 0) {
    return '无';
  }
  return values.map(String).join(', ');
}

function formatKeys(value: Record<string, unknown>): string {
  return formatList(Object.keys(value));
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '未设置';
}

function toRuntimeLimitsDraft(
  value: Record<string, unknown>
):
  | { ok: true; value: RestrictedBlockLoaderLimits }
  | { ok: false; message: string } {
  const timeoutMs = readPositiveNumber(value, 'timeoutMs');
  if (timeoutMs === null) {
    return {
      ok: false,
      message: 'Runtime limits.timeoutMs 必须是正数。'
    };
  }

  const maxRenderDepth = readOptionalPositiveNumber(value, 'maxRenderDepth');
  if (!maxRenderDepth.ok) {
    return { ok: false, message: 'Runtime limits.maxRenderDepth 必须是正数。' };
  }

  const maxRenderNodes = readOptionalPositiveNumber(value, 'maxRenderNodes');
  if (!maxRenderNodes.ok) {
    return { ok: false, message: 'Runtime limits.maxRenderNodes 必须是正数。' };
  }

  const maxEventChainDepth = readOptionalPositiveNumber(
    value,
    'maxEventChainDepth'
  );
  if (!maxEventChainDepth.ok) {
    return {
      ok: false,
      message: 'Runtime limits.maxEventChainDepth 必须是正数。'
    };
  }

  const allowedActions = readStringArray(value, 'allowedActions');
  if (!allowedActions.ok) {
    return { ok: false, message: 'Runtime limits.allowedActions 必须是字符串数组。' };
  }

  const allowedEvents = readStringArray(value, 'allowedEvents');
  if (!allowedEvents.ok) {
    return { ok: false, message: 'Runtime limits.allowedEvents 必须是字符串数组。' };
  }

  const allowedDataModels = readStringArray(value, 'allowedDataModels');
  if (!allowedDataModels.ok) {
    return {
      ok: false,
      message: 'Runtime limits.allowedDataModels 必须是字符串数组。'
    };
  }

  const allowedDataOperations = readDataPermissions(
    value,
    'allowedDataOperations'
  );
  if (!allowedDataOperations.ok) {
    return {
      ok: false,
      message: 'Runtime limits.allowedDataOperations 只能包含 query/create/update/delete。'
    };
  }

  const limits: RestrictedBlockLoaderLimits = { timeoutMs };
  if (maxRenderDepth.value !== undefined) {
    limits.maxRenderDepth = maxRenderDepth.value;
  }
  if (maxRenderNodes.value !== undefined) {
    limits.maxRenderNodes = maxRenderNodes.value;
  }
  if (maxEventChainDepth.value !== undefined) {
    limits.maxEventChainDepth = maxEventChainDepth.value;
  }
  if (allowedActions.value !== undefined) {
    limits.allowedActions = allowedActions.value;
  }
  if (allowedEvents.value !== undefined) {
    limits.allowedEvents = allowedEvents.value;
  }
  if (allowedDataModels.value !== undefined) {
    limits.allowedDataModels = allowedDataModels.value;
  }
  if (allowedDataOperations.value !== undefined) {
    limits.allowedDataOperations = allowedDataOperations.value;
  }

  return { ok: true, value: limits };
}

function readPositiveNumber(
  value: Record<string, unknown>,
  key: string
): number | null {
  const nextValue = value[key];
  return typeof nextValue === 'number' &&
    Number.isFinite(nextValue) &&
    nextValue > 0
    ? nextValue
    : null;
}

function readOptionalPositiveNumber(
  value: Record<string, unknown>,
  key: string
): { ok: true; value?: number } | { ok: false } {
  if (value[key] === undefined) {
    return { ok: true };
  }

  const nextValue = readPositiveNumber(value, key);
  return nextValue === null ? { ok: false } : { ok: true, value: nextValue };
}

function readStringArray(
  value: Record<string, unknown>,
  key: string
): { ok: true; value?: string[] } | { ok: false } {
  const nextValue = value[key];
  if (nextValue === undefined) {
    return { ok: true };
  }

  return Array.isArray(nextValue) &&
    nextValue.every((item): item is string => typeof item === 'string')
    ? { ok: true, value: nextValue }
    : { ok: false };
}

function readDataPermissions(
  value: Record<string, unknown>,
  key: string
): { ok: true; value?: BlockDataPermission[] } | { ok: false } {
  const nextValue = value[key];
  if (nextValue === undefined) {
    return { ok: true };
  }

  return Array.isArray(nextValue) &&
    nextValue.every(
      (item): item is BlockDataPermission =>
        typeof item === 'string' && dataPermissionSet.has(item)
    )
    ? { ok: true, value: nextValue }
    : { ok: false };
}

export function JsBlockTrialPanel({
  block,
  catalogEntry,
  code,
  contextSnapshot,
  limits,
  runtimeSnapshot,
  runtimeSessionFactory = createFrontstageRestrictedBlockRuntimeSession,
  onCodeChange,
  onContextSnapshotChange,
  onLimitsChange,
  onRuntimeAction
}: JsBlockTrialPanelProps) {
  const [contextDraft, setContextDraft] = useState(() =>
    stringifyDraft(contextSnapshot)
  );
  const [limitsDraft, setLimitsDraft] = useState(() => stringifyDraft(limits));
  const [draftError, setDraftError] = useState<JsonDraftError | null>(null);
  const [internalRuntimeSnapshot, setInternalRuntimeSnapshot] =
    useState<RestrictedBlockRuntimeHostSnapshot | null>(null);
  const activeRuntimeSessionRef = useRef<ActiveRuntimeSession | null>(null);

  const disposeActiveRuntimeSession = useCallback(
    (options: { updateSnapshot?: boolean } = {}) => {
      const activeRuntimeSession = activeRuntimeSessionRef.current;
      if (!activeRuntimeSession) {
        return null;
      }

      activeRuntimeSessionRef.current = null;
      activeRuntimeSession.unsubscribe();
      const snapshot = activeRuntimeSession.session.dispose();
      if (options.updateSnapshot !== false) {
        setInternalRuntimeSnapshot(snapshot);
      }
      return snapshot;
    },
    []
  );

  useEffect(() => {
    setContextDraft(stringifyDraft(contextSnapshot));
  }, [contextSnapshot]);

  useEffect(() => {
    setLimitsDraft(stringifyDraft(limits));
  }, [limits]);

  const runPlan = useMemo(() => {
    if (!block || !catalogEntry) {
      return null;
    }

    return createRestrictedBlockRunPlan({
      block,
      catalogEntry,
      code,
      contextSnapshot,
      limits
    });
  }, [block, catalogEntry, code, contextSnapshot, limits]);

  useEffect(
    () => () => {
      disposeActiveRuntimeSession({ updateSnapshot: false });
    },
    [disposeActiveRuntimeSession]
  );

  useEffect(() => {
    if (!runPlan?.ok) {
      disposeActiveRuntimeSession();
    }
  }, [disposeActiveRuntimeSession, runPlan]);

  function applyContextDraft() {
    const parsed = parseJsonObject(contextDraft, 'Context snapshot');
    if (!parsed.ok) {
      setDraftError({ kind: 'context', message: parsed.message });
      return;
    }

    setDraftError(null);
    onContextSnapshotChange?.(parsed.value);
  }

  function applyLimitsDraft() {
    const parsed = parseJsonObject(limitsDraft, 'Runtime limits');
    if (!parsed.ok) {
      setDraftError({ kind: 'limits', message: parsed.message });
      return;
    }

    const runtimeLimits = toRuntimeLimitsDraft(parsed.value);
    if (!runtimeLimits.ok) {
      setDraftError({ kind: 'limits', message: runtimeLimits.message });
      return;
    }

    setDraftError(null);
    onLimitsChange?.(runtimeLimits.value);
  }

  function runRuntimeSession() {
    if (!runPlan?.ok) {
      return;
    }

    disposeActiveRuntimeSession({ updateSnapshot: false });

    const session = runtimeSessionFactory({ runPlan });
    const unsubscribe = session.subscribe((snapshot) => {
      setInternalRuntimeSnapshot(snapshot);
    });
    activeRuntimeSessionRef.current = { session, unsubscribe };
    setInternalRuntimeSnapshot(session.run());
  }

  function stopRuntimeSession() {
    disposeActiveRuntimeSession();
  }

  const canStopRuntimeSession = activeRuntimeSessionRef.current !== null;
  const activeRuntimeSnapshot = internalRuntimeSnapshot ?? runtimeSnapshot;

  if (!block) {
    return (
      <Alert
        type="info"
        showIcon
        message="请选择一个区块"
        description="JS Block 试运行计划需要当前选中的区块。"
      />
    );
  }

  if (!catalogEntry) {
    return (
      <Alert
        type="warning"
        showIcon
        message="缺少区块目录条目"
        description="当前区块无法匹配可用 catalog entry。"
      />
    );
  }

  return (
    <Space direction="vertical" size="small" style={{ width: '100%' }}>
      <Typography.Title level={5} style={{ margin: 0 }}>
        JS Block 试运行
      </Typography.Title>

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text strong>JS 代码</Typography.Text>
        <Input.TextArea
          aria-label="JS 代码"
          value={code}
          rows={5}
          readOnly={!onCodeChange}
          onChange={(event) => onCodeChange?.(event.target.value)}
        />
      </Space>

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text strong>Context snapshot</Typography.Text>
        <Input.TextArea
          aria-label="Context snapshot"
          value={contextDraft}
          rows={4}
          onChange={(event) => setContextDraft(event.target.value)}
        />
        <Button
          size="small"
          disabled={!onContextSnapshotChange}
          onClick={applyContextDraft}
        >
          更新 context
        </Button>
      </Space>

      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text strong>Runtime limits</Typography.Text>
        <Input.TextArea
          aria-label="Runtime limits"
          value={limitsDraft}
          rows={4}
          onChange={(event) => setLimitsDraft(event.target.value)}
        />
        <Button
          size="small"
          disabled={!onLimitsChange}
          onClick={applyLimitsDraft}
        >
          更新 limits
        </Button>
      </Space>

      {draftError ? (
        <Alert
          type="error"
          showIcon
          message={
            draftError.kind === 'context'
              ? 'Context 更新失败'
              : 'Limits 更新失败'
          }
          description={draftError.message}
        />
      ) : null}

      {runPlan?.ok ? (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Alert type="success" showIcon message="Run plan 已生成" />
          <Space size="small" wrap>
            <Button
              aria-label="运行"
              size="small"
              type="primary"
              onClick={runRuntimeSession}
            >
              {canStopRuntimeSession ? '重新运行' : '运行'}
            </Button>
            <Button
              aria-label="停止"
              size="small"
              disabled={!canStopRuntimeSession}
              onClick={stopRuntimeSession}
            >
              停止
            </Button>
          </Space>
          <Descriptions
            bordered
            size="small"
            column={1}
            title="Request 摘要"
            items={[
              {
                key: 'requestId',
                label: 'Request ID',
                children: runPlan.request.requestId
              },
              {
                key: 'blockId',
                label: 'Block ID',
                children: runPlan.request.blockId
              },
              {
                key: 'sourceLength',
                label: 'Source length',
                children: `${runPlan.request.source.length} chars`
              },
              {
                key: 'timeout',
                label: 'Timeout',
                children: `${runPlan.request.limits.timeoutMs}ms`
              },
              {
                key: 'props',
                label: 'Props keys',
                children: formatKeys(runPlan.request.props)
              },
              {
                key: 'context',
                label: 'Context keys',
                children: formatKeys(runPlan.request.contextSnapshot)
              }
            ]}
          />
          <Descriptions
            bordered
            size="small"
            column={1}
            title="Schema validation options"
            data-testid="js-block-trial-schema-options"
            items={[
              {
                key: 'maxDepth',
                label: 'Max depth',
                children: formatNumber(runPlan.schemaValidationOptions.maxDepth)
              },
              {
                key: 'maxNodes',
                label: 'Max nodes',
                children: formatNumber(runPlan.schemaValidationOptions.maxNodes)
              },
              {
                key: 'data',
                label: 'Data permissions',
                children: formatList(
                  runPlan.schemaValidationOptions.allowedDataPermissions
                )
              },
              {
                key: 'actions',
                label: 'Actions',
                children: formatList(
                  runPlan.schemaValidationOptions.allowedActions
                )
              },
              {
                key: 'events',
                label: 'Events',
                children: formatList(runPlan.schemaValidationOptions.allowedEvents)
              }
            ]}
          />
          <Descriptions
            bordered
            size="small"
            column={1}
            title="Mediator policy"
            data-testid="js-block-trial-mediator-policy"
            items={[
              {
                key: 'actions',
                label: 'Actions',
                children: formatList(runPlan.mediatorPolicy.allowedActions)
              },
              {
                key: 'events',
                label: 'Events',
                children: formatList(runPlan.mediatorPolicy.allowedEvents)
              },
              {
                key: 'models',
                label: 'Data models',
                children: formatList(runPlan.mediatorPolicy.allowedDataModels)
              },
              {
                key: 'operations',
                label: 'Data operations',
                children: formatList(runPlan.mediatorPolicy.allowedDataOperations)
              },
              {
                key: 'maxEventChainDepth',
                label: 'Max event chain depth',
                children: formatNumber(runPlan.mediatorPolicy.maxEventChainDepth)
              }
            ]}
          />
        </Space>
      ) : null}

      {runPlan && !runPlan.ok ? (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Alert
            type="error"
            showIcon
            message="Run plan 被拒绝"
            description={runPlan.message}
          />
          <Descriptions
            bordered
            size="small"
            column={1}
            title="Rejection"
            items={[
              { key: 'code', label: 'Code', children: runPlan.code },
              { key: 'path', label: 'Path', children: runPlan.path },
              { key: 'blockId', label: 'Block ID', children: runPlan.blockId },
              {
                key: 'catalogId',
                label: 'Catalog ID',
                children: runPlan.catalogId
              }
            ]}
          />
        </Space>
      ) : null}

      {activeRuntimeSnapshot ? (
        <RestrictedBlockRuntimePreview
          snapshot={activeRuntimeSnapshot}
          onAction={onRuntimeAction}
        />
      ) : null}
    </Space>
  );
}
