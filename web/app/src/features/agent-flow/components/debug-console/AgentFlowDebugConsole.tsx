import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import type {
  AgentFlowDebugMessage,
  AgentFlowRunContext
} from '../../api/runtime';
import type { AgentFlowDebugSessionStatus } from '../../hooks/runtime/useAgentFlowDebugSession';
import { AgentFlowDockPanel } from '../editor/AgentFlowDockPanel';
import { ConversationLogPanel } from './ConversationLogPanel';
import { DebugConversationPane } from './conversation/DebugConversationPane';

export function AgentFlowDebugConsole({
  ariaLabel,
  closeLabel,
  composerUiOnly = false,
  messages,
  runContext,
  showClearAction = true,
  showComposer = true,
  status,
  stopping,
  subtitle,
  title = '预览',
  onChangeRunContextValue,
  onClearSession,
  onClose,
  onLoadArtifact,
  onOpenMessageLog,
  onStopRun,
  onSubmitPrompt
}: {
  ariaLabel?: string;
  closeLabel?: string;
  composerUiOnly?: boolean;
  messages: AgentFlowDebugMessage[];
  runContext: AgentFlowRunContext;
  showClearAction?: boolean;
  showComposer?: boolean;
  status: AgentFlowDebugSessionStatus;
  stopping: boolean;
  subtitle?: ReactNode;
  title?: string;
  onChangeRunContextValue: (
    nodeId: string,
    key: string,
    value: unknown
  ) => void;
  onClearSession: () => void;
  onClose: () => void;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
  onOpenMessageLog?: (message: AgentFlowDebugMessage) => void;
  onStopRun: () => void;
  onSubmitPrompt: (prompt: string) => void;
}) {
  const [openLogMessageId, setOpenLogMessageId] = useState<string | null>(null);
  const openLogMessage = useMemo(
    () =>
      messages.find(
        (message) =>
          message.id === openLogMessageId && message.role === 'assistant'
      ) ?? null,
    [messages, openLogMessageId]
  );

  return (
    <>
      {!onOpenMessageLog && openLogMessage ? (
        <ConversationLogPanel
          message={openLogMessage}
          onClose={() => setOpenLogMessageId(null)}
          onLoadArtifact={onLoadArtifact}
        />
      ) : null}
      <AgentFlowDockPanel
        actions={
          showClearAction ? (
            <Button
              aria-label="清空预览"
              disabled={messages.length === 0}
              icon={<ReloadOutlined />}
              size="small"
              type="text"
              onClick={() => {
                setOpenLogMessageId(null);
                onClearSession();
              }}
            />
          ) : null
        }
        ariaLabel={ariaLabel}
        bodyClassName="agent-flow-editor__debug-console-body"
        className="agent-flow-editor__debug-console"
        closeLabel={closeLabel ?? `关闭${title}`}
        subtitle={subtitle}
        title={title}
        onClose={onClose}
      >
        <DebugConversationPane
          composerUiOnly={composerUiOnly}
          messages={messages}
          runContext={runContext}
          status={status}
          stopping={stopping}
          onLoadArtifact={onLoadArtifact}
          onOpenMessageLog={(message) => {
            if (onOpenMessageLog) {
              onOpenMessageLog(message);
              return;
            }

            setOpenLogMessageId(message.id);
          }}
          onChangeQuery={(value) => {
            const queryField =
              runContext.fields.find((field) => field.key === 'query') ?? null;

            if (!queryField) {
              return;
            }

            onChangeRunContextValue(queryField.nodeId, queryField.key, value);
          }}
          showComposer={showComposer}
          onStopRun={onStopRun}
          onSubmitPrompt={onSubmitPrompt}
        />
      </AgentFlowDockPanel>
    </>
  );
}
