import { useQueryClient } from '@tanstack/react-query';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAuthStore } from '../../../../state/auth-store';
import {
  buildFlowDebugRunInput,
  cancelFlowDebugRun,
  fetchApplicationRunDetail,
  startFlowDebugRun,
  type AgentFlowDebugMessage,
  type AgentFlowRunContext,
  type AgentFlowVariableGroup,
  type FlowDebugRunDetail
} from '../../api/runtime';
import {
  mapRunDetailToConversation,
  mapRunDetailToTrace
} from '../../lib/debug-console/run-detail-mapper';
import { filterTraceItemsByNode } from '../../lib/debug-console/trace-filters';
import {
  buildRunContextFromDocument,
  getRunContextValues,
  mapRunContextToVariableGroups,
  mapRunDetailToVariableGroups
} from '../../lib/debug-console/variable-groups';

const DEBUG_SESSION_STORAGE_VERSION = 1;
const DEBUG_SESSION_STORAGE_PREFIX = '1flowbase.agent-flow.debug-session';
const RUN_DETAIL_POLL_INTERVAL_MS = 200;

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
    id: `user-${crypto.randomUUID()}`,
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
    id: `assistant-pending-${crypto.randomUUID()}`,
    role: 'assistant',
    content: '',
    status: 'running',
    runId: null,
    rawOutput: null,
    traceSummary: []
  };
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

function replaceAssistantMessage(
  currentMessages: AgentFlowDebugMessage[],
  nextMessage: AgentFlowDebugMessage,
  fallbackMessageId?: string | null
) {
  let replaced = false;
  const nextMessages = currentMessages.map((message) => {
    const matchedById = fallbackMessageId ? message.id === fallbackMessageId : false;
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
    const matchedByRunId = options?.runId ? message.runId === options.runId : false;

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
      id: `assistant-error-${crypto.randomUUID()}`,
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
  const [messages, setMessages] = useState<AgentFlowDebugMessage[]>([]);
  const [lastDetail, setLastDetail] = useState<FlowDebugRunDetail | null>(null);
  const [activeNodeFilter, setActiveNodeFilter] = useState<string | null>(null);
  const [runContext, setRunContext] = useState(() =>
    buildRunContextFromDocument(document, rememberedInputValues)
  );
  const previousStorageKeyRef = useRef(storageKey);
  const lastSubmittedPromptRef = useRef<string | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setRunContext((currentRunContext) => {
      // 文档更新时尽量保留用户正在编辑的输入值；仅在 draft 切换时回落到本地记忆。
      const nextValues =
        previousStorageKeyRef.current === storageKey
          ? getRunContextValues(currentRunContext)
          : rememberedInputValues;

      previousStorageKeyRef.current = storageKey;

      return buildRunContextFromDocument(document, nextValues);
    });
  }, [document, rememberedInputValues, storageKey]);

  const rawTraceItems = useMemo(
    () => (lastDetail ? mapRunDetailToTrace(lastDetail) : []),
    [lastDetail]
  );
  const traceItems = useMemo(
    () => filterTraceItemsByNode(rawTraceItems, activeNodeFilter),
    [activeNodeFilter, rawTraceItems]
  );
  const variableGroups = useMemo<AgentFlowVariableGroup[]>(
    () =>
      lastDetail
        ? mapRunDetailToVariableGroups(lastDetail, {
            applicationId,
            draftId,
            runContext
          })
        : mapRunContextToVariableGroups(runContext, {
            applicationId,
            draftId
          }),
    [applicationId, draftId, lastDetail, runContext]
  );

  function clearPollTimer() {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function stopPolling() {
    clearPollTimer();
    activeRunIdRef.current = null;
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

  useEffect(() => () => stopPolling(), []);

  async function submitPrompt(prompt?: string) {
    const resolvedPrompt = resolvePrompt(runContext, prompt);
    const nextRunContext = updateRunContextQuery(runContext, resolvedPrompt);
    const inputValues = getRunContextValues(nextRunContext);
    const runningMessage = createRunningAssistantMessage();

    stopPolling();
    setRunContext(nextRunContext);
    setStatus('running');
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

    try {
      const detail = await startFlowDebugRun(
        applicationId,
        buildFlowDebugRunInput(document, inputValues),
        csrfToken
      );

      lastSubmittedPromptRef.current = resolvedPrompt;
      writePersistedInputValues(storageKey, inputValues);
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
    if (
      !csrfToken ||
      !lastDetail?.flow_run.id ||
      !['running', 'waiting_human', 'waiting_callback'].includes(status)
    ) {
      return null;
    }

    try {
      const detail = await cancelFlowDebugRun(
        applicationId,
        lastDetail.flow_run.id,
        csrfToken
      );
      stopPolling();
      await applyRunDetail(detail, { invalidateRuntime: true });
      return detail;
    } catch {
      return null;
    }
  }

  function clearSession() {
    stopPolling();
    setStatus('idle');
    setMessages([]);
    setLastDetail(null);
    setActiveNodeFilter(null);
  }

  function setRunContextValue(
    nodeId: string,
    key: string,
    value: unknown
  ) {
    setRunContext((currentRunContext) => ({
      ...currentRunContext,
      remembered: false,
      fields: currentRunContext.fields.map((field) =>
        field.nodeId === nodeId && field.key === key ? { ...field, value } : field
      )
    }));
  }

  function selectTraceNode(nodeId: string | null) {
    setActiveNodeFilter(nodeId);
  }

  function syncSelectedNode(nodeId: string | null) {
    setActiveNodeFilter(nodeId);
  }

  return {
    status,
    runContext,
    messages,
    traceItems,
    variableGroups,
    activeNodeFilter,
    submitPrompt,
    rerunLast,
    stopRun,
    clearSession,
    setRunContextValue,
    selectTraceNode,
    syncSelectedNode
  };
}
