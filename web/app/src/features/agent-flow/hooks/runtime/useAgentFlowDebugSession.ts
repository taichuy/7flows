import { useQueryClient } from '@tanstack/react-query';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '../../../../state/auth-store';
import {
  buildFlowDebugRunInput,
  cancelFlowDebugRun,
  fetchApplicationRunDetail,
  fetchDebugVariableSnapshot,
  startFlowDebugRun,
  startFlowDebugRunStream,
  type AgentFlowDebugMessage,
  type AgentFlowRunContext,
  type AgentFlowTraceItem,
  type AgentFlowVariableGroup,
  type FlowDebugRunDetail,
  type FlowDebugRunStreamEvent,
  type NodeDebugPreviewVariableCache
} from '../../api/runtime';
import {
  applyDebugStreamEventToAssistantMessage,
  applyDebugStreamEventToTrace
} from '../../lib/debug-console/stream-events';
import {
  mapRunDetailToConversation,
  mapRunDetailToTrace
} from '../../lib/debug-console/run-detail-mapper';
import {
  buildRunContextFromDocument,
  getRunContextValues,
  mapRunContextToVariableGroups,
  mapRunDetailToVariableGroups,
  mapVariableCacheToVariableGroup,
  type NodeVariableDisplayMeta
} from '../../lib/debug-console/variable-groups';

const DEBUG_SESSION_STORAGE_VERSION = 1;
const DEBUG_SESSION_STORAGE_PREFIX = '1flowbase.agent-flow.debug-session';
const RUN_DETAIL_POLL_INTERVAL_MS = 200;
let debugMessageIdSequence = 0;

interface PersistedDebugSessionPayload {
  version: number;
  inputValues: Record<string, unknown>;
}

export type AgentFlowDebugSessionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'waiting_callback'
  | 'waiting_human'
  | 'cancelled'
  | 'failed';

export function buildAgentFlowDebugSessionStorageKey(
  applicationId: string,
  draftId: string
) {
  return `${DEBUG_SESSION_STORAGE_PREFIX}:${applicationId}:${draftId}`;
}

function readPersistedInputValues(
  storageKey: string
): Record<string, unknown> | null {
  const rawValue = window.localStorage.getItem(storageKey);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PersistedDebugSessionPayload;

    if (
      parsedValue.version !== DEBUG_SESSION_STORAGE_VERSION ||
      !parsedValue.inputValues ||
      typeof parsedValue.inputValues !== 'object'
    ) {
      return null;
    }

    return parsedValue.inputValues;
  } catch {
    return null;
  }
}

function writePersistedInputValues(
  storageKey: string,
  inputValues: Record<string, unknown>
) {
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({
      version: DEBUG_SESSION_STORAGE_VERSION,
      inputValues
    } satisfies PersistedDebugSessionPayload)
  );
}

function createUserMessage(prompt: string): AgentFlowDebugMessage {
  return {
    id: createDebugMessageId('user'),
    role: 'user',
    content: prompt,
    status: 'completed',
    runId: null,
    rawOutput: null,
    traceSummary: []
  };
}

function createRunningAssistantMessage(): AgentFlowDebugMessage {
  return {
    id: createDebugMessageId('assistant-pending'),
    role: 'assistant',
    content: '',
    status: 'running',
    runId: null,
    rawOutput: null,
    traceSummary: []
  };
}

function createDebugMessageId(prefix: string) {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${(debugMessageIdSequence += 1).toString(36)}`;

  return `${prefix}-${randomId}`;
}

function resolvePrompt(
  runContext: AgentFlowRunContext,
  prompt: string | undefined
): string {
  if (typeof prompt === 'string') {
    return prompt;
  }

  const queryField = runContext.fields.find((field) => field.key === 'query');

  return typeof queryField?.value === 'string' ? queryField.value : '';
}

function updateRunContextQuery(
  runContext: AgentFlowRunContext,
  prompt: string
): AgentFlowRunContext {
  return {
    ...runContext,
    fields: runContext.fields.map((field) =>
      field.key === 'query' ? { ...field, value: prompt } : field
    )
  };
}

function clearRunContextQuery(
  runContext: AgentFlowRunContext
): AgentFlowRunContext {
  return updateRunContextQuery(runContext, '');
}

function clearPersistedQueryValue(
  inputValues: Record<string, unknown>
): Record<string, unknown> {
  return { ...inputValues, query: '' };
}

function buildStreamEventDedupKeys(event: FlowDebugRunStreamEvent) {
  const keys: string[] = [];

  if (event.event_id) {
    keys.push(`eid:${event.event_id}`);
  }

  if ('run_id' in event && event.run_id && event.sequence !== undefined) {
    keys.push(`seq:${event.run_id}:${event.sequence}`);
  }

  return keys;
}

function replaceAssistantMessage(
  currentMessages: AgentFlowDebugMessage[],
  nextMessage: AgentFlowDebugMessage,
  fallbackMessageId?: string | null
) {
  let replaced = false;
  const nextMessages = currentMessages.map((message) => {
    const matchedById = fallbackMessageId
      ? message.id === fallbackMessageId
      : false;
    const matchedByRunId =
      nextMessage.runId !== null && message.runId === nextMessage.runId;

    if (!matchedById && !matchedByRunId) {
      return message;
    }

    replaced = true;
    return nextMessage;
  });

  return replaced ? nextMessages : [...nextMessages, nextMessage];
}

function replaceAssistantMessageWithError(
  currentMessages: AgentFlowDebugMessage[],
  errorMessage: string,
  options?: {
    fallbackMessageId?: string | null;
    runId?: string | null;
  }
) {
  let replaced = false;
  const nextMessages = currentMessages.map((message) => {
    const matchedById = options?.fallbackMessageId
      ? message.id === options.fallbackMessageId
      : false;
    const matchedByRunId = options?.runId
      ? message.runId === options.runId
      : false;

    if (!matchedById && !matchedByRunId) {
      return message;
    }

    replaced = true;
    return {
      ...message,
      status: 'failed',
      content: errorMessage
    } satisfies AgentFlowDebugMessage;
  });

  if (replaced) {
    return nextMessages;
  }

  return [
    ...nextMessages,
    {
      id: createDebugMessageId('assistant-error'),
      role: 'assistant',
      content: errorMessage,
      status: 'failed',
      runId: options?.runId ?? null,
      rawOutput: null,
      traceSummary: []
    } satisfies AgentFlowDebugMessage
  ];
}

function shouldPollRun(detail: FlowDebugRunDetail) {
  return detail.flow_run.status === 'running';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeVariablePayload(
  currentCache: NodeDebugPreviewVariableCache,
  nodeId: string,
  payload: Record<string, unknown>
) {
  return {
    ...currentCache,
    [nodeId]: {
      ...(currentCache[nodeId] ?? {}),
      ...payload
    }
  };
}

function mergeVariableCache(
  currentCache: NodeDebugPreviewVariableCache,
  nextCache: NodeDebugPreviewVariableCache
) {
  let mergedCache = currentCache;

  for (const [nodeId, payload] of Object.entries(nextCache)) {
    mergedCache = mergeVariablePayload(mergedCache, nodeId, payload);
  }

  return mergedCache;
}

function buildVariableCacheFromTraceItems(
  traceItems: AgentFlowTraceItem[],
  nodeMetadata: Record<string, NodeVariableDisplayMeta>
): NodeDebugPreviewVariableCache {
  let cache: NodeDebugPreviewVariableCache = {};

  for (const item of traceItems) {
    if (isRecord(item.outputPayload)) {
      cache = mergeVariablePayload(
        cache,
        item.nodeId,
        projectPayloadForNode(item.nodeId, item.outputPayload, nodeMetadata)
      );
    }
  }

  return cache;
}

function buildVariableCacheFromRunDetail(
  detail: FlowDebugRunDetail,
  nodeMetadata: Record<string, NodeVariableDisplayMeta>
): NodeDebugPreviewVariableCache {
  let cache: NodeDebugPreviewVariableCache = {};

  for (const nodeRun of detail.node_runs) {
    if (isRecord(nodeRun.output_payload)) {
      cache = mergeVariablePayload(
        cache,
        nodeRun.node_id,
        projectPayloadForNode(
          nodeRun.node_id,
          nodeRun.output_payload,
          nodeMetadata
        )
      );
    }
  }

  return cache;
}

function isSameVariableValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildDisplayVariableCache(
  variableCache: NodeDebugPreviewVariableCache,
  runContext: AgentFlowRunContext
) {
  let displayCache: NodeDebugPreviewVariableCache = {};

  for (const [nodeId, payload] of Object.entries(variableCache)) {
    for (const [key, value] of Object.entries(payload)) {
      const sameRunContextField = runContext.fields.find(
        (field) =>
          field.nodeId === nodeId &&
          field.key === key &&
          isSameVariableValue(field.value, value)
      );

      if (sameRunContextField) {
        continue;
      }

      displayCache = mergeVariablePayload(displayCache, nodeId, {
        [key]: value
      });
    }
  }

  return displayCache;
}

function buildNodeVariableDisplayMetadata(
  document: FlowAuthoringDocument
): Record<string, NodeVariableDisplayMeta> {
  return Object.fromEntries(
    document.graph.nodes.map((node) => [
      node.id,
      {
        label: node.alias,
        nodeType: node.type,
        outputs: node.outputs
      }
    ])
  );
}

function readDeclaredOutputValue(
  payload: Record<string, unknown>,
  output: NonNullable<NodeVariableDisplayMeta['outputs']>[number]
): { found: true; value: unknown } | { found: false } {
  const selector = output.selector?.length ? output.selector : [output.key];
  let current: unknown = payload;

  for (const segment of selector) {
    if (!isRecord(current)) {
      return { found: false };
    }

    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false };
    }

    current = current[segment];
  }

  return { found: true, value: current };
}

function projectPayloadForNode(
  nodeId: string,
  payload: Record<string, unknown>,
  nodeMetadata: Record<string, NodeVariableDisplayMeta>
): Record<string, unknown> {
  const outputs = nodeMetadata[nodeId]?.outputs;

  if (!outputs?.length) {
    return payload;
  }

  const projected: Record<string, unknown> = {};

  for (const output of outputs) {
    const result = readDeclaredOutputValue(payload, output);

    if (result.found) {
      projected[output.key] = result.value;
    }
  }

  return projected;
}

function createDebugSessionState(applicationId: string, draftId: string) {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    scope: `${applicationId}:${draftId}`,
    id: `${applicationId}:${draftId}:${random}`
  };
}

export function useAgentFlowDebugSession({
  applicationId,
  draftId,
  document
}: {
  applicationId: string;
  draftId: string;
  document: FlowAuthoringDocument;
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const storageKey = useMemo(
    () => buildAgentFlowDebugSessionStorageKey(applicationId, draftId),
    [applicationId, draftId]
  );
  const rememberedInputValues = useMemo(
    () => readPersistedInputValues(storageKey),
    [storageKey]
  );
  const [status, setStatus] = useState<AgentFlowDebugSessionStatus>('idle');
  const [stopping, setStopping] = useState(false);
  const [messages, setMessages] = useState<AgentFlowDebugMessage[]>([]);
  const [lastDetail, setLastDetail] = useState<FlowDebugRunDetail | null>(null);
  const [streamTraceItems, setStreamTraceItems] = useState<
    AgentFlowTraceItem[]
  >([]);
  const [nodePreviewVariableCache, setNodePreviewVariableCache] =
    useState<NodeDebugPreviewVariableCache>({});
  const [runContext, setRunContext] = useState(() =>
    buildRunContextFromDocument(document, rememberedInputValues)
  );
  const previousStorageKeyRef = useRef(storageKey);
  const debugSessionScope = `${applicationId}:${draftId}`;
  const [debugSessionState, setDebugSessionState] = useState(() =>
    createDebugSessionState(applicationId, draftId)
  );
  const lastSubmittedPromptRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pendingAssistantMessageRef = useRef<AgentFlowDebugMessage | null>(null);
  const flushStreamMessageFrameRef = useRef<number | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const streamGenerationRef = useRef(0);
  const variableSnapshotRestoreGenerationRef = useRef(0);
  const stoppingRef = useRef(false);

  useEffect(() => {
    setDebugSessionState((current) =>
      current.scope === debugSessionScope
        ? current
        : createDebugSessionState(applicationId, draftId)
    );
  }, [applicationId, debugSessionScope, draftId]);

  useEffect(() => {
    setRunContext((currentRunContext) => {
      // 文档更新时尽量保留用户正在编辑的输入值；仅在 draft 切换时回落到本地记忆。
      const isSameDraft = previousStorageKeyRef.current === storageKey;
      const nextValues = isSameDraft
        ? getRunContextValues(currentRunContext)
        : rememberedInputValues;

      previousStorageKeyRef.current = storageKey;

      const nextRunContext = buildRunContextFromDocument(document, nextValues);

      return isSameDraft
        ? { ...nextRunContext, remembered: currentRunContext.remembered }
        : nextRunContext;
    });
  }, [document, rememberedInputValues, storageKey]);

  useEffect(() => {
    if (debugSessionState.scope !== debugSessionScope) {
      return;
    }

    let disposed = false;
    const restoreGeneration = (variableSnapshotRestoreGenerationRef.current += 1);

    setNodePreviewVariableCache({});
    fetchDebugVariableSnapshot(applicationId, debugSessionState.id)
      .then((snapshot) => {
        if (
          disposed ||
          restoreGeneration !== variableSnapshotRestoreGenerationRef.current
        ) {
          return;
        }

        setNodePreviewVariableCache((currentCache) =>
          mergeVariableCache(snapshot.variable_cache, currentCache)
        );
      })
      .catch(() => {
        // Durable variable snapshots are a convenience cache; the editor still opens without them.
      });

    return () => {
      disposed = true;
    };
  }, [applicationId, debugSessionScope, debugSessionState, draftId]);

  const rawTraceItems = useMemo(
    () =>
      streamTraceItems.length > 0
        ? streamTraceItems
        : lastDetail
          ? mapRunDetailToTrace(lastDetail)
          : [],
    [lastDetail, streamTraceItems]
  );
  const traceItems = rawTraceItems;
  const nodeVariableDisplayMetadata = useMemo(
    () => buildNodeVariableDisplayMetadata(document),
    [document]
  );
  const variableGroups = useMemo<AgentFlowVariableGroup[]>(() => {
    if (lastDetail) {
      return mapRunDetailToVariableGroups(lastDetail, {
        applicationId,
        draftId,
        runContext,
        nodeMetadata: nodeVariableDisplayMetadata
      });
    }

    const groups = mapRunContextToVariableGroups(runContext, {
      applicationId,
      draftId
    });
    const cacheGroup = mapVariableCacheToVariableGroup(
      buildDisplayVariableCache(nodePreviewVariableCache, runContext),
      nodeVariableDisplayMetadata
    );

    return cacheGroup ? [cacheGroup, ...groups] : groups;
  }, [
    applicationId,
    draftId,
    lastDetail,
    nodeVariableDisplayMetadata,
    nodePreviewVariableCache,
    runContext
  ]);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    clearPollTimer();
    activeRunIdRef.current = null;
  }, [clearPollTimer]);

  const abortActiveDebugStream = useCallback(() => {
    streamAbortControllerRef.current?.abort();
    streamAbortControllerRef.current = null;
  }, []);

  const startDebugStreamGeneration = useCallback(() => {
    abortActiveDebugStream();
    streamGenerationRef.current += 1;
    return streamGenerationRef.current;
  }, [abortActiveDebugStream]);

  const cancelActiveDebugStream = useCallback(() => {
    streamGenerationRef.current += 1;
    abortActiveDebugStream();
  }, [abortActiveDebugStream]);

  function isActiveDebugStreamGeneration(generation: number) {
    return streamGenerationRef.current === generation;
  }

  function scheduleAssistantMessageFlush(
    runningMessageId: string,
    nextMessage: AgentFlowDebugMessage
  ) {
    pendingAssistantMessageRef.current = nextMessage;

    if (flushStreamMessageFrameRef.current !== null) {
      return;
    }

    flushStreamMessageFrameRef.current = window.requestAnimationFrame(() => {
      flushStreamMessageFrameRef.current = null;
      const pending = pendingAssistantMessageRef.current;

      if (!pending) {
        return;
      }

      pendingAssistantMessageRef.current = null;
      setStatus(pending.status);
      setMessages((currentMessages) =>
        replaceAssistantMessage(currentMessages, pending, runningMessageId)
      );
    });
  }

  const clearScheduledAssistantMessageFlush = useCallback(() => {
    if (flushStreamMessageFrameRef.current !== null) {
      window.cancelAnimationFrame(flushStreamMessageFrameRef.current);
      flushStreamMessageFrameRef.current = null;
    }

    pendingAssistantMessageRef.current = null;
  }, []);

  function flushAssistantMessageImmediately(
    runningMessageId: string,
    nextMessage: AgentFlowDebugMessage
  ) {
    clearScheduledAssistantMessageFlush();
    setStatus(nextMessage.status);
    setMessages((currentMessages) =>
      replaceAssistantMessage(currentMessages, nextMessage, runningMessageId)
    );
  }

  async function applyRunDetail(
    detail: FlowDebugRunDetail,
    options?: {
      fallbackMessageId?: string | null;
      invalidateRuntime?: boolean;
    }
  ) {
    const assistantMessage = mapRunDetailToConversation(detail);

    setLastDetail(detail);
    setNodePreviewVariableCache((currentCache) =>
      mergeVariableCache(
        currentCache,
        buildVariableCacheFromRunDetail(detail, nodeVariableDisplayMetadata)
      )
    );
    setStatus(assistantMessage.status);
    setMessages((currentMessages) =>
      replaceAssistantMessage(
        currentMessages,
        assistantMessage,
        options?.fallbackMessageId
      )
    );

    if (options?.invalidateRuntime) {
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }

    return assistantMessage;
  }

  async function pollRunDetail(runId: string) {
    try {
      const detail = await fetchApplicationRunDetail(applicationId, runId);

      if (activeRunIdRef.current !== runId) {
        return;
      }

      const assistantMessage = await applyRunDetail(detail);

      if (!shouldPollRun(detail)) {
        stopPolling();
        await queryClient.invalidateQueries({
          queryKey: ['applications', applicationId, 'runtime']
        });
        return;
      }

      setStatus(assistantMessage.status);
      pollTimerRef.current = window.setTimeout(() => {
        void pollRunDetail(runId);
      }, RUN_DETAIL_POLL_INTERVAL_MS);
    } catch (error) {
      if (activeRunIdRef.current !== runId) {
        return;
      }

      stopPolling();
      setStatus('failed');
      setMessages((currentMessages) =>
        replaceAssistantMessageWithError(
          currentMessages,
          error instanceof Error ? error.message : '调试运行失败',
          { runId }
        )
      );
    }
  }

  function beginPolling(runId: string) {
    stopPolling();
    activeRunIdRef.current = runId;
    pollTimerRef.current = window.setTimeout(() => {
      void pollRunDetail(runId);
    }, RUN_DETAIL_POLL_INTERVAL_MS);
  }

  useEffect(
    () => () => {
      clearPollTimer();
      activeRunIdRef.current = null;
      clearScheduledAssistantMessageFlush();
      cancelActiveDebugStream();
    },
    [
      cancelActiveDebugStream,
      clearPollTimer,
      clearScheduledAssistantMessageFlush
    ]
  );

  async function submitPrompt(prompt?: string) {
    const resolvedPrompt = resolvePrompt(runContext, prompt);
    const nextRunContext = updateRunContextQuery(runContext, resolvedPrompt);
    const inputValues = getRunContextValues(nextRunContext);
    const runningMessage = createRunningAssistantMessage();

    stopPolling();
    const streamGeneration = startDebugStreamGeneration();
    clearScheduledAssistantMessageFlush();
    setRunContext(clearRunContextQuery(nextRunContext));
    setStatus('running');
    setLastDetail(null);
    setStreamTraceItems([]);
    setMessages((currentMessages) => [
      ...currentMessages,
      createUserMessage(resolvedPrompt),
      runningMessage
    ]);

    if (!csrfToken) {
      setStatus('failed');
      setMessages((currentMessages) =>
        replaceAssistantMessageWithError(
          currentMessages,
          '缺少 CSRF token，无法发起调试运行。',
          { fallbackMessageId: runningMessage.id }
        )
      );
      return null;
    }

    const runInput = {
      ...buildFlowDebugRunInput(document, inputValues),
      document,
      debug_session_id: debugSessionState.id
    };

    try {
      let streamAssistantMessage = runningMessage;
      let streamTraceItemsSnapshot: AgentFlowTraceItem[] = [];
      const seenStreamEventKeys = new Set<string>();

      await startFlowDebugRunStream(applicationId, runInput, csrfToken, {
        getAbortController: (abortController) => {
          if (!isActiveDebugStreamGeneration(streamGeneration)) {
            abortController.abort();
            return;
          }

          streamAbortControllerRef.current = abortController;
        },
        onEvent: (event) => {
          const dedupKeys = buildStreamEventDedupKeys(event);
          const isRepeatedStreamEvent = dedupKeys.some((key) =>
            seenStreamEventKeys.has(key)
          );

          if (isRepeatedStreamEvent) {
            return;
          }

          if (dedupKeys.length > 0) {
            dedupKeys.forEach((key) => {
              seenStreamEventKeys.add(key);
            });
          }

          if (!isActiveDebugStreamGeneration(streamGeneration)) {
            return;
          }

          const isTraceEvent =
            event.type === 'node_started' ||
            event.type === 'node_finished' ||
            event.type === 'text_delta' ||
            event.type === 'reasoning_delta' ||
            event.type === 'usage_snapshot';
          const isNodeStateEvent =
            event.type === 'node_started' || event.type === 'node_finished';
          const isTerminalEvent =
            event.type === 'flow_finished' ||
            event.type === 'flow_failed' ||
            event.type === 'waiting_human' ||
            event.type === 'waiting_callback' ||
            event.type === 'replay_expired';

          if (isTraceEvent) {
            streamTraceItemsSnapshot = applyDebugStreamEventToTrace(
              streamTraceItemsSnapshot,
              event
            );
          }

          streamAssistantMessage = applyDebugStreamEventToAssistantMessage(
            streamAssistantMessage,
            event,
            streamTraceItemsSnapshot
          );

          if (
            event.type === 'flow_accepted' ||
            event.type === 'flow_started' ||
            event.type === 'flow_cancelled' ||
            event.type === 'waiting_human' ||
            event.type === 'waiting_callback'
          ) {
            activeRunIdRef.current = event.run_id;
          }

          if (isTraceEvent) {
            setStreamTraceItems(streamTraceItemsSnapshot);
            if (isNodeStateEvent) {
              setNodePreviewVariableCache((currentCache) =>
                mergeVariableCache(
                  currentCache,
                  buildVariableCacheFromTraceItems(
                    streamTraceItemsSnapshot,
                    nodeVariableDisplayMetadata
                  )
                )
              );
            }
          }

          if (event.type === 'text_delta' || event.type === 'reasoning_delta') {
            scheduleAssistantMessageFlush(
              runningMessage.id,
              streamAssistantMessage
            );
            return;
          }

          if (isTerminalEvent || event.type === 'flow_cancelled') {
            flushAssistantMessageImmediately(
              runningMessage.id,
              streamAssistantMessage
            );
            return;
          }

          clearScheduledAssistantMessageFlush();
          setStatus(streamAssistantMessage.status);
          setMessages((currentMessages) =>
            replaceAssistantMessage(
              currentMessages,
              streamAssistantMessage,
              runningMessage.id
            )
          );
        }
      });

      if (!isActiveDebugStreamGeneration(streamGeneration)) {
        return null;
      }

      streamAbortControllerRef.current = null;

      lastSubmittedPromptRef.current = resolvedPrompt;
      writePersistedInputValues(
        storageKey,
        clearPersistedQueryValue(inputValues)
      );
      stopPolling();
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });

      return null;
    } catch (error) {
      if (!isActiveDebugStreamGeneration(streamGeneration)) {
        return null;
      }

      streamAbortControllerRef.current = null;
      if (activeRunIdRef.current) {
        const errorMessage =
          error instanceof Error ? error.message : '调试流式连接中断';
        clearScheduledAssistantMessageFlush();
        setStatus('failed');
        setMessages((currentMessages) =>
          replaceAssistantMessageWithError(currentMessages, errorMessage, {
            fallbackMessageId: runningMessage.id,
            runId: activeRunIdRef.current
          })
        );
        return null;
      }

      stopPolling();
      setStreamTraceItems([]);
    }

    try {
      const detail = await startFlowDebugRun(
        applicationId,
        runInput,
        csrfToken
      );

      lastSubmittedPromptRef.current = resolvedPrompt;
      writePersistedInputValues(
        storageKey,
        clearPersistedQueryValue(inputValues)
      );
      const assistantMessage = await applyRunDetail(detail, {
        fallbackMessageId: runningMessage.id,
        invalidateRuntime: !shouldPollRun(detail)
      });

      if (shouldPollRun(detail)) {
        beginPolling(detail.flow_run.id);
      } else {
        stopPolling();
      }

      setStatus(assistantMessage.status);
      return detail;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : '调试运行失败';

      setStatus('failed');
      setMessages((currentMessages) =>
        replaceAssistantMessageWithError(currentMessages, errorMessage, {
          fallbackMessageId: runningMessage.id
        })
      );
      return null;
    }
  }

  async function rerunLast() {
    const prompt = lastSubmittedPromptRef.current ?? undefined;
    return submitPrompt(prompt);
  }

  async function stopRun() {
    const runId = lastDetail?.flow_run.id ?? activeRunIdRef.current;

    if (
      stoppingRef.current ||
      !csrfToken ||
      !runId ||
      !['running', 'waiting_human', 'waiting_callback'].includes(status)
    ) {
      return null;
    }

    stoppingRef.current = true;
    setStopping(true);
    try {
      const detail = await cancelFlowDebugRun(applicationId, runId, csrfToken);
      cancelActiveDebugStream();
      stopPolling();
      clearScheduledAssistantMessageFlush();
      await applyRunDetail(detail, { invalidateRuntime: true });
      return detail;
    } catch {
      return null;
    } finally {
      stoppingRef.current = false;
      setStopping(false);
    }
  }

  function clearSession() {
    stoppingRef.current = false;
    setStopping(false);
    cancelActiveDebugStream();
    stopPolling();
    clearScheduledAssistantMessageFlush();
    setStatus('idle');
    setMessages([]);
    setLastDetail(null);
    setStreamTraceItems([]);
  }

  function setRunContextValue(nodeId: string, key: string, value: unknown) {
    setRunContext((currentRunContext) => ({
      ...currentRunContext,
      remembered: false,
      fields: currentRunContext.fields.map((field) =>
        field.nodeId === nodeId && field.key === key
          ? { ...field, value }
          : field
      )
    }));
  }

  function getNodePreviewVariableCache(): NodeDebugPreviewVariableCache {
    const cache: NodeDebugPreviewVariableCache = {};

    for (const field of runContext.fields) {
      cache[field.nodeId] ??= {};
      cache[field.nodeId][field.key] = field.value;
    }

    if (lastDetail) {
      for (const nodeRun of lastDetail.node_runs) {
        cache[nodeRun.node_id] = {
          ...(cache[nodeRun.node_id] ?? {}),
          ...projectPayloadForNode(
            nodeRun.node_id,
            nodeRun.output_payload,
            nodeVariableDisplayMetadata
          )
        };
      }
    }

    for (const [nodeId, payload] of Object.entries(nodePreviewVariableCache)) {
      cache[nodeId] = {
        ...(cache[nodeId] ?? {}),
        ...payload
      };
    }

    return cache;
  }

  function rememberNodePreviewVariables(
    inputPayload: NodeDebugPreviewVariableCache
  ) {
    setNodePreviewVariableCache((currentCache) => {
      return mergeVariableCache(currentCache, inputPayload);
    });
  }

  function resetVariableCache() {
    variableSnapshotRestoreGenerationRef.current += 1;
    stoppingRef.current = false;
    setStopping(false);
    setDebugSessionState(createDebugSessionState(applicationId, draftId));
    cancelActiveDebugStream();
    stopPolling();
    clearScheduledAssistantMessageFlush();
    setStatus('idle');
    setLastDetail(null);
    setStreamTraceItems([]);
    setNodePreviewVariableCache({});
    setRunContext(buildRunContextFromDocument(document, null));
  }

  return {
    status,
    stopping,
    debugSessionId: debugSessionState.id,
    runContext,
    messages,
    traceItems,
    variableGroups,
    submitPrompt,
    rerunLast,
    stopRun,
    clearSession,
    setRunContextValue,
    getNodePreviewVariableCache,
    rememberNodePreviewVariables,
    resetVariableCache
  };
}
