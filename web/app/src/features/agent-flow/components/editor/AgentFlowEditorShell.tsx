import type {
  ConsoleApplicationOrchestrationState,
  SaveConsoleApplicationDraftInput
} from '@1flowse/api-client';
import { Typography } from 'antd';
import { useMemo, useState } from 'react';

import { validateDocument } from '../../lib/validate-document';
import { NodeInspector } from '../inspector/NodeInspector';
import { AgentFlowCanvas } from './AgentFlowCanvas';
import { AgentFlowOverlay } from './AgentFlowOverlay';
import './agent-flow-editor.css';

interface AgentFlowEditorShellProps {
  applicationId: string;
  applicationName: string;
  initialState: ConsoleApplicationOrchestrationState;
  saveDraftOverride?: (
    input: SaveConsoleApplicationDraftInput
  ) => Promise<ConsoleApplicationOrchestrationState>;
}

export function AgentFlowEditorShell({
  applicationId,
  applicationName,
  initialState
}: AgentFlowEditorShellProps) {
  const [document, setDocument] = useState(initialState.draft.document);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-llm');
  const issues = useMemo(() => validateDocument(document), [document]);
  const issueCountByNodeId = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const issue of issues) {
      if (!issue.nodeId) {
        continue;
      }

      counts[issue.nodeId] = (counts[issue.nodeId] ?? 0) + 1;
    }

    return counts;
  }, [issues]);

  return (
    <section
      aria-label={`${applicationName} editor`}
      className="agent-flow-editor"
      data-application-id={applicationId}
    >
      <AgentFlowOverlay
        applicationName={applicationName}
        autosaveLabel={`${initialState.autosave_interval_seconds} 秒自动保存`}
        onOpenIssues={() => undefined}
        onOpenHistory={() => undefined}
        onOpenPublish={() => undefined}
        publishDisabled={false}
      />
      <div
        className={`agent-flow-editor__body${selectedNodeId ? ' agent-flow-editor__body--with-inspector' : ''}`}
      >
        <AgentFlowCanvas
          document={document}
          issueCountByNodeId={issueCountByNodeId}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onDocumentChange={setDocument}
        />
        <NodeInspector
          document={document}
          selectedNodeId={selectedNodeId}
          onDocumentChange={setDocument}
        />
      </div>
      {issues.some((issue) => issue.scope === 'global') ? (
        <Typography.Text type="danger">
          当前草稿存在全局问题，请先查看 Issues 面板处理。
        </Typography.Text>
      ) : null}
    </section>
  );
}
