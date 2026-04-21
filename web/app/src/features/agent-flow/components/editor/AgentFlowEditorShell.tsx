import type {
  ConsoleNodeContributionEntry,
  ConsoleApplicationOrchestrationState,
  SaveConsoleApplicationDraftInput
} from '@1flowbase/api-client';

import './agent-flow-editor.css';
import { AgentFlowEditorStoreProvider } from '../../store/editor/provider';
import { AgentFlowCanvasFrame } from './AgentFlowCanvasFrame';

interface AgentFlowEditorShellProps {
  applicationId: string;
  applicationName: string;
  initialState: ConsoleApplicationOrchestrationState;
  nodeContributions?: ConsoleNodeContributionEntry[];
  saveDraftOverride?: (
    input: SaveConsoleApplicationDraftInput
  ) => Promise<ConsoleApplicationOrchestrationState>;
  restoreVersionOverride?: (
    versionId: string
  ) => Promise<ConsoleApplicationOrchestrationState>;
}

export function AgentFlowEditorShell({
  applicationId,
  applicationName,
  initialState,
  nodeContributions = [],
  saveDraftOverride,
  restoreVersionOverride
}: AgentFlowEditorShellProps) {
  return (
    <AgentFlowEditorStoreProvider initialState={initialState}>
      <AgentFlowCanvasFrame
        applicationId={applicationId}
        applicationName={applicationName}
        nodeContributions={nodeContributions}
        saveDraftOverride={saveDraftOverride}
        restoreVersionOverride={restoreVersionOverride}
      />
    </AgentFlowEditorStoreProvider>
  );
}
