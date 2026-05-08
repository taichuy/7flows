import { SchemaDockPanel } from '../../../../shared/schema-ui/overlay-shell/SchemaDockPanel';
import type {
  AgentFlowDebugMessage,
  AgentFlowRunContext
} from '../../api/runtime';
import type { AgentFlowDebugSessionStatus } from '../../hooks/runtime/useAgentFlowDebugSession';
import { DebugConversationPane } from './conversation/DebugConversationPane';
import { DebugConsoleHeader } from './DebugConsoleHeader';

const debugConsoleShellSchema = {
  schemaVersion: '1.0.0',
  shellType: 'dock_panel',
  title: '预览'
} as const;

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
  onChangeRunContextValue: (nodeId: string, key: string, value: unknown) => void;
  onClearSession: () => void;
  onClose: () => void;
  onLoadArtifact?: (artifactRef: string) => Promise<unknown>;
  onStopRun: () => void;
  onSubmitPrompt: () => void;
}) {
  return (
    <SchemaDockPanel
      bodyClassName="agent-flow-editor__debug-console-body"
      className="agent-flow-editor__debug-console"
      headerless
      schema={debugConsoleShellSchema}
    >
      <DebugConsoleHeader
        clearDisabled={messages.length === 0}
        onClear={onClearSession}
        onClose={onClose}
      />
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
    </SchemaDockPanel>
  );
}
