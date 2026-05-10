import { ReloadOutlined } from '@ant-design/icons';
import { Button } from 'antd';

import type {
  AgentFlowDebugMessage,
  AgentFlowRunContext
} from '../../api/runtime';
import type { AgentFlowDebugSessionStatus } from '../../hooks/runtime/useAgentFlowDebugSession';
import { AgentFlowDockPanel } from '../editor/AgentFlowDockPanel';
import { DebugConversationPane } from './conversation/DebugConversationPane';

export function AgentFlowDebugConsole({
  messages,
  runContext,
  status,
  stopping,
  onChangeRunContextValue,
  onClearSession,
  onClose,
  onLoadArtifact,
  onStopRun,
  onSubmitPrompt
}: {
  messages: AgentFlowDebugMessage[];
  runContext: AgentFlowRunContext;
  status: AgentFlowDebugSessionStatus;
  stopping: boolean;
  onChangeRunContextValue: (
    nodeId: string,
    key: string,
    value: unknown
  ) => void;
  onClearSession: () => void;
  onClose: () => void;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
  onStopRun: () => void;
  onSubmitPrompt: () => void;
}) {
  return (
    <AgentFlowDockPanel
      actions={
        <Button
          aria-label="清空预览"
          disabled={messages.length === 0}
          icon={<ReloadOutlined />}
          size="small"
          type="text"
          onClick={onClearSession}
        />
      }
      bodyClassName="agent-flow-editor__debug-console-body"
      className="agent-flow-editor__debug-console"
      closeLabel="关闭预览"
      title="预览"
      onClose={onClose}
    >
      <DebugConversationPane
        messages={messages}
        runContext={runContext}
        status={status}
        stopping={stopping}
        onLoadArtifact={onLoadArtifact}
        onChangeQuery={(value) => {
          const queryField =
            runContext.fields.find((field) => field.key === 'query') ?? null;

          if (!queryField) {
            return;
          }

          onChangeRunContextValue(queryField.nodeId, queryField.key, value);
        }}
        onStopRun={onStopRun}
        onSubmitPrompt={onSubmitPrompt}
      />
    </AgentFlowDockPanel>
  );
}
