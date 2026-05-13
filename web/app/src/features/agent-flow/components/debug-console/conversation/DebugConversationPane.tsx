import { Empty, Typography } from 'antd';
import { useCallback, useLayoutEffect, useRef } from 'react';

import type {
  AgentFlowDebugMessage,
  AgentFlowRunContext
} from '../../../api/runtime';
import type { AgentFlowDebugSessionStatus } from '../../../hooks/runtime/useAgentFlowDebugSession';
import { DebugAssistantMessage } from './DebugAssistantMessage';
import { DebugComposer } from './DebugComposer';

function getQueryField(runContext: AgentFlowRunContext) {
  return runContext.fields.find((field) => field.key === 'query') ?? null;
}

export function DebugConversationPane({
  status,
  stopping,
  runContext,
  messages,
  onChangeQuery,
  onLoadArtifact,
  onOpenMessageLog,
  onStopRun,
  onSubmitPrompt,
  showComposer = true
}: {
  status: AgentFlowDebugSessionStatus;
  stopping: boolean;
  runContext: AgentFlowRunContext;
  messages: AgentFlowDebugMessage[];
  onChangeQuery: (value: string) => void;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
  onOpenMessageLog?: (message: AgentFlowDebugMessage) => void;
  onStopRun: () => void;
  onSubmitPrompt: (prompt: string) => void;
  showComposer?: boolean;
}) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const queryField = getQueryField(runContext);
  const composerDisabled =
    !queryField ||
    status === 'running' ||
    status === 'waiting_human' ||
    status === 'waiting_callback';
  const stopAvailable =
    status === 'running' ||
    status === 'waiting_human' ||
    status === 'waiting_callback';
  const activeAssistantMessage =
    [...messages].reverse().find((message) => message.role === 'assistant') ??
    null;
  const activeAssistantMessageId = activeAssistantMessage?.id ?? null;
  const activeAssistantContent = activeAssistantMessage?.content ?? '';
  const scrollToBottom = useCallback(() => {
    if (status !== 'running' || !autoScrollEnabledRef.current) {
      return;
    }

    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ block: 'end' });
    }
  }, [status]);

  useLayoutEffect(() => {
    if (activeAssistantMessageIdRef.current !== activeAssistantMessageId) {
      activeAssistantMessageIdRef.current = activeAssistantMessageId;
      autoScrollEnabledRef.current = true;
    }

    scrollToBottom();
  }, [
    activeAssistantContent,
    activeAssistantMessageId,
    messages.length,
    scrollToBottom
  ]);

  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      scrollToBottom();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [scrollToBottom]);

  function pauseAutoScroll() {
    if (status === 'running') {
      autoScrollEnabledRef.current = false;
    }
  }

  return (
    <div className="agent-flow-editor__debug-console-pane agent-flow-editor__debug-conversation-pane">
      <div
        ref={messagesRef}
        className="agent-flow-editor__debug-messages"
        data-testid="debug-conversation-messages"
        onPointerDown={pauseAutoScroll}
        onTouchMove={pauseAutoScroll}
        onWheel={pauseAutoScroll}
      >
        <div
          ref={messageListRef}
          className="agent-flow-editor__debug-message-list"
        >
          {messages.length === 0 ? (
            <Empty
              description="还没有整流运行记录"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            messages.map((message) =>
              message.role === 'assistant' ? (
                <DebugAssistantMessage
                  key={message.id}
                  message={message}
                  onLoadArtifact={onLoadArtifact}
                  onOpenLog={onOpenMessageLog}
                />
              ) : (
                <article
                  key={message.id}
                  className="agent-flow-editor__debug-message agent-flow-editor__debug-message--user"
                >
                  <div className="agent-flow-editor__debug-message-main">
                    <div className="agent-flow-editor__debug-message-header">
                      <Typography.Text strong>User</Typography.Text>
                    </div>
                    <Typography.Paragraph className="agent-flow-editor__debug-message-content">
                      {message.content}
                    </Typography.Paragraph>
                  </div>
                </article>
              )
            )
          )}
          <div
            ref={bottomRef}
            aria-hidden="true"
            className="agent-flow-editor__debug-bottom-sentinel"
            data-testid="debug-conversation-bottom-sentinel"
          />
        </div>
      </div>
      {showComposer ? (
        <DebugComposer
          disabled={composerDisabled}
          submitting={stopAvailable}
          stopping={stopping}
          value={typeof queryField?.value === 'string' ? queryField.value : ''}
          onChange={onChangeQuery}
          onStop={onStopRun}
          onSubmit={onSubmitPrompt}
        />
      ) : null}
    </div>
  );
}
