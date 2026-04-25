import { Empty, Typography } from 'antd';

import type { AgentFlowDebugMessage, AgentFlowRunContext } from '../../../api/runtime';
import type { AgentFlowDebugSessionStatus } from '../../../hooks/runtime/useAgentFlowDebugSession';
import { DebugAssistantMessage } from './DebugAssistantMessage';
import { DebugComposer } from './DebugComposer';

function getQueryField(runContext: AgentFlowRunContext) {
  return runContext.fields.find((field) => field.key === 'query') ?? null;
}

export function DebugConversationPane({
  status,
  runContext,
  messages,
  onChangeQuery,
  onSubmitPrompt,
  onViewTrace,
  onSelectTraceNode
}: {
  status: AgentFlowDebugSessionStatus;
  runContext: AgentFlowRunContext;
  messages: AgentFlowDebugMessage[];
  onChangeQuery: (value: string) => void;
  onSubmitPrompt: () => void;
  onViewTrace: () => void;
  onSelectTraceNode: (nodeId: string) => void;
}) {
  const queryField = getQueryField(runContext);
  const composerDisabled =
    !queryField ||
    status === 'running' ||
    status === 'waiting_human' ||
    status === 'waiting_callback';

  return (
    <div className="agent-flow-editor__debug-console-pane agent-flow-editor__debug-conversation-pane">
      <div className="agent-flow-editor__debug-messages">
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
                onSelectTraceNode={onSelectTraceNode}
                onViewTrace={onViewTrace}
              />
            ) : (
              <article
                key={message.id}
                className="agent-flow-editor__debug-message agent-flow-editor__debug-message--user"
              >
                <div className="agent-flow-editor__debug-message-header">
                  <Typography.Text strong>User</Typography.Text>
                </div>
                <Typography.Paragraph className="agent-flow-editor__debug-message-content">
                  {message.content}
                </Typography.Paragraph>
              </article>
            )
          )
        )}
      </div>
      <DebugComposer
        disabled={composerDisabled}
        submitting={status === 'running'}
        value={typeof queryField?.value === 'string' ? queryField.value : ''}
        onChange={onChangeQuery}
        onSubmit={onSubmitPrompt}
      />
    </div>
  );
}
