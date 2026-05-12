import { useQueryClient } from '@tanstack/react-query';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '../../../../state/auth-store';
import {
  buildFlowDebugRunInput,
  cancelFlowDebugRun,
  deleteDebugVariableCacheEntries,
  fetchApplicationRunDetail,
  fetchDebugVariableSnapshot,
  fetchRuntimeDebugArtifact,
  startFlowDebugRun,
  startFlowDebugRunStream,
  upsertDebugVariableCacheEntry,
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
  mapVariableCacheToVariableGroups,
  type NodePreviewDisplayVariableCache,
  type NodeVariableDisplayMeta
} from '../../lib/debug-console/variable-groups';
import type { AgentFlowEnvironmentVariable } from '../../lib/application-environment-variables';
import { getNodeVariableOutputs } from '../../lib/start-node-variables';

const RUN_DETAIL_POLL_INTERVAL_MS = 200;
let debugMessageIdSequence = 0;

export type AgentFlowDebugSessionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'waiting_callback'
  | 'waiting_human'
  | 'cancelled'
  | 'failed';

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

function isRuntimeDebugArtifactPreview(value: unknown): value is {
  __runtime_debug_artifact: true;
  artifact_ref: string;
} {
  return (
    isRecord(value) &&
    value.__runtime_debug_artifact === true &&
    typeof value.artifact_ref === 'string'
  );
}

async function hydrateRuntimeDebugArtifacts(
  value: unknown,
  loadArtifact: (artifactRef: string) => Promise<unknown>
): Promise<unknown> {
  if (isRuntimeDebugArtifactPreview(value)) {
    try {
      return await loadArtifact(value.artifact_ref);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return Promise.all(
      value.map((entry) => hydrateRuntimeDebugArtifacts(entry, loadArtifact))
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, entryValue]) => [
      key,
      await hydrateRuntimeDebugArtifacts(entryValue, loadArtifact)
    ])
  );

  return Object.fromEntries(entries);
}

async function hydrateRunDetailOutputArtifacts(
  applicationId: string,
  detail: FlowDebugRunDetail
): Promise<FlowDebugRunDetail> {
  const artifactRequests = new Map<string, Promise<unknown>>();
  const loadArtifact = (artifactRef: string) => {
    const existingRequest = artifactRequests.get(artifactRef);

    if (existingRequest) {
      return existingRequest;
    }

    const request = fetchRuntimeDebugArtifact(applicationId, artifactRef);
    artifactRequests.set(artifactRef, request);
    return request;
  };

  const [flowOutputPayload, nodeRuns] = await Promise.all([
    hydrateRuntimeDebugArtifacts(detail.flow_run.output_payload, loadArtifact),
    Promise.all(
      detail.node_runs.map(async (nodeRun) => ({
        ...nodeRun,
        output_payload: await hydrateRuntimeDebugArtifacts(
          nodeRun.output_payload,
          loadArtifact
        )
      }))
    )
  ]);

  return {
    ...detail,
    flow_run: {
      ...detail.flow_run,
      output_payload: isRecord(flowOutputPayload) ? flowOutputPayload : {}
    },
    node_runs: nodeRuns.map((nodeRun) => ({
      ...nodeRun,
      output_payload: isRecord(nodeRun.output_payload)
        ? nodeRun.output_payload
        : {}
    }))
  };
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

function removeVariableCacheKeys(
  currentCache: NodeDebugPreviewVariableCache,
  consumedCache: NodeDebugPreviewVariableCache
) {
  let changed = false;
  const nextCache: NodeDebugPreviewVariableCache = {};

  for (const [nodeId, payload] of Object.entries(currentCache)) {
    const consumedPayload = consumedCache[nodeId];
    const nextPayload: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (
        consumedPayload &&
        Object.prototype.hasOwnProperty.call(consumedPayload, key)
      ) {
        changed = true;
        continue;
      }
      nextPayload[key] = value;
    }

    if (Object.keys(nextPayload).length > 0) {
      nextCache[nodeId] = nextPayload;
    }
  }

  return changed ? nextCache : currentCache;
}

function parseVariableCacheItemKey(
  key: string
): { nodeId: string; variableKey: string } | null {
  const separatorIndex = key.indexOf('.');

  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    nodeId: key.slice(0, separatorIndex),
    variableKey: key.slice(separatorIndex + 1)
  };
}

function readVariableCacheValue(
  cache: NodeDebugPreviewVariableCache,
  key: string
) {
  const parsed = parseVariableCacheItemKey(key);
  if (!parsed) {
    return { found: false as const };
  }

  const payload = cache[parsed.nodeId];
  if (
    !payload ||
    !Object.prototype.hasOwnProperty.call(payload, parsed.variableKey)
  ) {
    return { found: false as const };
  }

  return { found: true as const, value: payload[parsed.variableKey] };
}

function applyVariableOverridesToGroups(
  groups: AgentFlowVariableGroup[],
  variableOverrides: NodeDebugPreviewVariableCache
): AgentFlowVariableGroup[] {
  if (Object.keys(variableOverrides).length === 0) {
    return groups;
  }

  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const override = readVariableCacheValue(variableOverrides, item.key);
      return override.found ? { ...item, value: override.value } : item;
    })
  }));
}

function removeCachedVariableItemsFromGroups(
  groups: AgentFlowVariableGroup[],
  variableCache: NodeDebugPreviewVariableCache
): AgentFlowVariableGroup[] {
  return groups.flatMap((group) => {
    const items = group.items.filter(
      (item) => !readVariableCacheValue(variableCache, item.key).found
    );

    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

function mergeVariableGroupsByTitle(
  groups: AgentFlowVariableGroup[]
): AgentFlowVariableGroup[] {
  const groupsByTitle = new Map<string, AgentFlowVariableGroup>();

  for (const group of groups) {
    const existing = groupsByTitle.get(group.title);
    if (existing) {
      existing.items.push(...group.items);
      continue;
    }

    groupsByTitle.set(group.title, { ...group, items: [...group.items] });
  }

  return Array.from(groupsByTitle.values());
}

function readOutputSelectorValue(
  payload: Record<string, unknown>,
  selector: string[]
): { found: true; value: unknown } | { found: false } {
  let current: unknown = payload;

  for (const segment of selector) {
    if (
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false };
    }

    current = current[segment];
  }

  return { found: true, value: current };
}

function projectNodeVariablePayload(
  document: FlowAuthoringDocument,
  nodeId: string,
  payload: Record<string, unknown>
) {
  const node = document.graph.nodes.find((entry) => entry.id === nodeId);

  if (!node) {
    return {};
  }

  return getNodeVariableOutputs(node).reduce<Record<string, unknown>>(
    (projected, output) => {
      if (Object.prototype.hasOwnProperty.call(payload, output.key)) {
        projected[output.key] = payload[output.key];
        return projected;
      }

      const selector = output.selector?.length ? output.selector : undefined;
      if (!selector) {
        return projected;
      }

      const selected = readOutputSelectorValue(payload, selector);
      if (selected.found) {
        projected[output.key] = selected.value;
      }

      return projected;
    },
    {}
  );
}

function projectVariableCache(
  document: FlowAuthoringDocument,
  variableCache: NodeDebugPreviewVariableCache
): NodeDebugPreviewVariableCache {
  let cache: NodeDebugPreviewVariableCache = {};

  for (const [nodeId, payload] of Object.entries(variableCache)) {
    if (isRecord(payload)) {
      const projectedPayload = projectNodeVariablePayload(
        document,
        nodeId,
        payload
      );

      if (Object.keys(projectedPayload).length > 0) {
        cache = mergeVariablePayload(cache, nodeId, projectedPayload);
      }
    }
  }

  return cache;
}

function buildInputVariableCacheFromRunDetail(
  detail: FlowDebugRunDetail
): NodeDebugPreviewVariableCache {
  let cache: NodeDebugPreviewVariableCache = {};

  if (isRecord(detail.flow_run.input_payload)) {
    for (const [nodeId, payload] of Object.entries(
      detail.flow_run.input_payload
    )) {
      if (isRecord(payload)) {
        cache = mergeVariablePayload(cache, nodeId, payload);
      }
    }
  }

  for (const nodeRun of detail.node_runs) {
    if (isRecord(nodeRun.input_payload)) {
      cache = mergeVariablePayload(
        cache,
        nodeRun.node_id,
        nodeRun.input_payload
      );
    }
  }

  return cache;
}

function buildDisplayVariableCache(
  outputCache: NodeDebugPreviewVariableCache
): NodePreviewDisplayVariableCache {
  const displayCache: NodePreviewDisplayVariableCache = {};

  for (const [nodeId, payload] of Object.entries(outputCache)) {
    displayCache[nodeId] ??= {};
    displayCache[nodeId].output = payload;
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
        outputs: getNodeVariableOutputs(node)
      }
    ])
  );
}

function createDebugSessionState(
  applicationId: string,
  draftId: string,
  persistedDebugSessionId?: string
) {
  const scope = `${applicationId}:${draftId}`;

  if (
    typeof persistedDebugSessionId === 'string' &&
    persistedDebugSessionId.startsWith(`${scope}:`)
  ) {
    return {
      scope,
      id: persistedDebugSessionId
    };
  }

  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    scope,
    id: `${scope}:${random}`
  };
}

export function useAgentFlowDebugSession({
  applicationId,
  draftId,
  document,
  environmentVariables = []
}: {
  applicationId: string;
  draftId: string;
  document: FlowAuthoringDocument;
  environmentVariables?: AgentFlowEnvironmentVariable[];
}) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const actorUserId = useAuthStore(
    (state) => state.actor?.id ?? state.me?.id ?? null
  );
  const [status, setStatus] = useState<AgentFlowDebugSessionStatus>('idle');
  const [stopping, setStopping] = useState(false);
  const [messages, setMessages] = useState<AgentFlowDebugMessage[]>([]);
  const [lastDetail, setLastDetail] = useState<FlowDebugRunDetail | null>(null);
  const [streamTraceItems, setStreamTraceItems] = useState<
    AgentFlowTraceItem[]
  >([]);
  const [nodePreviewInputCache, setNodePreviewInputCache] =
    useState<NodeDebugPreviewVariableCache>({});
  const [nodePreviewOutputCache, setNodePreviewOutputCache] =
    useState<NodeDebugPreviewVariableCache>({});
  const [variableOverrides, setVariableOverrides] =
    useState<NodeDebugPreviewVariableCache>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runContext, setRunContext] = useState(() =>
    buildRunContextFromDocument(document, null)
  );
  const previousDraftScopeRef = useRef(`${applicationId}:${draftId}`);
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
    setActiveRunId(null);
    setVariableOverrides({});
  }, [applicationId, debugSessionScope, draftId]);

  useEffect(() => {
    setRunContext((currentRunContext) => {
      const isSameDraft = previousDraftScopeRef.current === debugSessionScope;
      const nextValues = isSameDraft
        ? getRunContextValues(currentRunContext)
        : null;

      previousDraftScopeRef.current = debugSessionScope;

      const nextRunContext = buildRunContextFromDocument(document, nextValues);

      return isSameDraft
        ? { ...nextRunContext, remembered: currentRunContext.remembered }
        : nextRunContext;
    });
  }, [debugSessionScope, document]);

  useEffect(() => {
    if (debugSessionState.scope !== debugSessionScope) {
      return;
    }

    let disposed = false;
    const restoreGeneration =
      (variableSnapshotRestoreGenerationRef.current += 1);

    setNodePreviewInputCache({});
    setNodePreviewOutputCache({});
    fetchDebugVariableSnapshot(applicationId)
      .then((snapshot) => {
        if (
          disposed ||
          restoreGeneration !== variableSnapshotRestoreGenerationRef.current
        ) {
          return;
        }

        setNodePreviewOutputCache(
          projectVariableCache(document, snapshot.variable_cache)
        );
      })
      .catch(() => {
        // Durable variable snapshots are a convenience cache; the editor still opens without them.
      });

    return () => {
      disposed = true;
    };
  }, [
    activeRunId,
    applicationId,
    debugSessionScope,
    debugSessionState,
    document,
    draftId
  ]);

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
    const groups = mapRunContextToVariableGroups(runContext, {
      applicationId,
      draftId,
      debugSessionId: debugSessionState.id,
      flowId: document.meta.flowId,
      actorUserId,
      environmentVariables
    });
    const cacheGroups = mapVariableCacheToVariableGroups(
      buildDisplayVariableCache(nodePreviewOutputCache),
      nodeVariableDisplayMetadata
    );
    const uncachedGroups = removeCachedVariableItemsFromGroups(
      groups,
      nodePreviewOutputCache
    );

    return applyVariableOverridesToGroups(
      cacheGroups.length > 0
        ? mergeVariableGroupsByTitle([...cacheGroups, ...uncachedGroups])
        : groups,
      variableOverrides
    );
  }, [
    applicationId,
    actorUserId,
    debugSessionState.id,
    draftId,
    document.meta.flowId,
    environmentVariables,
    nodeVariableDisplayMetadata,
    nodePreviewOutputCache,
    runContext,
    variableOverrides
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
    const hydratedDetail = await hydrateRunDetailOutputArtifacts(
      applicationId,
      detail
    );
    const assistantMessage = mapRunDetailToConversation(hydratedDetail);
    const inputVariableCache = buildInputVariableCacheFromRunDetail(
      hydratedDetail
    );

    setActiveRunId(hydratedDetail.flow_run.id);
    setLastDetail(hydratedDetail);
    setVariableOverrides((currentOverrides) => {
      return removeVariableCacheKeys(currentOverrides, inputVariableCache);
    });
    setNodePreviewInputCache((currentCache) =>
      mergeVariableCache(currentCache, inputVariableCache)
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
      const completedRunId =
        activeRunIdRef.current ?? streamAssistantMessage.runId;
      if (completedRunId) {
        try {
          const detail = await fetchApplicationRunDetail(
            applicationId,
            completedRunId
          );
          await applyRunDetail(detail, {
            fallbackMessageId: runningMessage.id,
            invalidateRuntime: true
          });
        } catch {
          setActiveRunId(completedRunId);
        }
      }
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
    setActiveRunId(null);
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
    const startNodeId =
      document.graph.nodes.find((node) => node.type === 'start')?.id ??
      'node-start';

    for (const field of runContext.fields) {
      cache[field.nodeId] ??= {};
      cache[field.nodeId][field.key] = field.value;
    }

    for (const [nodeId, payload] of Object.entries(nodePreviewOutputCache)) {
      cache[nodeId] = {
        ...(cache[nodeId] ?? {}),
        ...payload
      };
    }

    for (const [nodeId, payload] of Object.entries(nodePreviewInputCache)) {
      if (nodeId !== startNodeId) {
        continue;
      }

      cache[nodeId] = {
        ...(cache[nodeId] ?? {}),
        ...payload
      };
    }

    return mergeVariableCache(cache, variableOverrides);
  }

  function setVariableCacheValue(key: string, value: unknown) {
    const parsed = parseVariableCacheItemKey(key);
    if (!parsed) {
      return;
    }

    const nextOverridePayload = {
      [parsed.nodeId]: {
        [parsed.variableKey]: value
      }
    };

    setVariableOverrides((currentOverrides) => {
      return mergeVariableCache(currentOverrides, nextOverridePayload);
    });
    if (csrfToken) {
      void upsertDebugVariableCacheEntry(
        applicationId,
        {
          node_id: parsed.nodeId,
          variable_key: parsed.variableKey,
          value
        },
        csrfToken
      ).catch(() => {});
    }
    setNodePreviewOutputCache((currentCache) =>
      mergeVariableCache(currentCache, nextOverridePayload)
    );
    setRunContext((currentRunContext) => {
      let changed = false;
      const nextFields = currentRunContext.fields.map((field) => {
        if (
          field.nodeId !== parsed.nodeId ||
          field.key !== parsed.variableKey
        ) {
          return field;
        }
        changed = true;
        return { ...field, value };
      });

      if (!changed) {
        return currentRunContext;
      }

      const nextRunContext = {
        ...currentRunContext,
        remembered: false,
        fields: nextFields
      };
      return nextRunContext;
    });
  }

  function rememberNodePreviewInputs(
    inputPayload: NodeDebugPreviewVariableCache
  ) {
    setNodePreviewInputCache((currentCache) => {
      return mergeVariableCache(currentCache, inputPayload);
    });
  }

  function rememberExternalRunDetail(detail: FlowDebugRunDetail) {
    const inputVariableCache = buildInputVariableCacheFromRunDetail(detail);

    setActiveRunId(detail.flow_run.id);
    setLastDetail(detail);
    setVariableOverrides((currentOverrides) => {
      return removeVariableCacheKeys(currentOverrides, inputVariableCache);
    });
    setNodePreviewInputCache((currentCache) =>
      mergeVariableCache(currentCache, inputVariableCache)
    );
  }

  function selectRunScope(runId: string | null) {
    setActiveRunId((current) => (current === runId ? current : runId));
    setLastDetail((current) =>
      current && current.flow_run.id !== runId ? null : current
    );
  }

  function resetVariableCache() {
    variableSnapshotRestoreGenerationRef.current += 1;
    const nextDebugSessionState = createDebugSessionState(
      applicationId,
      draftId
    );
    stoppingRef.current = false;
    setStopping(false);
    setDebugSessionState(nextDebugSessionState);
    cancelActiveDebugStream();
    stopPolling();
    clearScheduledAssistantMessageFlush();
    setStatus('idle');
    setActiveRunId(null);
    setLastDetail(null);
    setStreamTraceItems([]);
    setNodePreviewInputCache({});
    setNodePreviewOutputCache({});
    setVariableOverrides({});
    if (csrfToken) {
      void deleteDebugVariableCacheEntries(applicationId, {}, csrfToken).catch(
        () => {}
      );
    }
    setRunContext(buildRunContextFromDocument(document, null));
  }

  return {
    status,
    stopping,
    debugSessionId: debugSessionState.id,
    activeRunId,
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
    setVariableCacheValue,
    rememberNodePreviewInputs,
    rememberExternalRunDetail,
    selectRunScope,
    resetVariableCache
  };
}
