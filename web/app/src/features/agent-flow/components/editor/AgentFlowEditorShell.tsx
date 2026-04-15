import type {
  ConsoleApplicationOrchestrationState,
  SaveConsoleApplicationDraftInput
} from '@1flowse/api-client';
import { Typography } from 'antd';
import { useMemo, useState } from 'react';

import { restoreVersion, saveDraft } from '../../api/orchestration';
import { validateDocument } from '../../lib/validate-document';
import { useEditorAutosave } from '../../hooks/useEditorAutosave';
import { IssuesDrawer } from '../issues/IssuesDrawer';
import { VersionHistoryDrawer } from '../history/VersionHistoryDrawer';
import { NodeInspector } from '../inspector/NodeInspector';
import { AgentFlowCanvas } from './AgentFlowCanvas';
import { AgentFlowOverlay } from './AgentFlowOverlay';
import './agent-flow-editor.css';
import { useAuthStore } from '../../../../state/auth-store';
import type { InspectorSectionKey } from '../../lib/node-definitions';

interface AgentFlowEditorShellProps {
  applicationId: string;
  applicationName: string;
  initialState: ConsoleApplicationOrchestrationState;
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
  saveDraftOverride,
  restoreVersionOverride
}: AgentFlowEditorShellProps) {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const [editorState, setEditorState] = useState(initialState);
  const [document, setDocument] = useState(initialState.draft.document);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node-llm');
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [focusFieldKey, setFocusFieldKey] = useState<string | null>(null);
  const [openSectionKey, setOpenSectionKey] = useState<InspectorSectionKey | null>(null);
  const [restoring, setRestoring] = useState(false);
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
  const autosaveStatus = useEditorAutosave({
    document,
    lastSavedDocument: editorState.draft.document,
    intervalMs: editorState.autosave_interval_seconds * 1000,
    onSave: async (input) => {
      const nextState = saveDraftOverride
        ? await saveDraftOverride(input)
        : await (() => {
            if (!csrfToken) {
              throw new Error('missing csrf token');
            }

            return saveDraft(applicationId, input, csrfToken);
          })();

      setEditorState(nextState);
      setDocument(nextState.draft.document);
    }
  });

  async function handleRestore(versionId: string) {
    setRestoring(true);

    try {
      const nextState = restoreVersionOverride
        ? await restoreVersionOverride(versionId)
        : await (() => {
            if (!csrfToken) {
              throw new Error('missing csrf token');
            }

            return restoreVersion(applicationId, versionId, csrfToken);
          })();

      setEditorState(nextState);
      setDocument(nextState.draft.document);
      setHistoryOpen(false);
    } finally {
      setRestoring(false);
    }
  }

  function handleSelectIssue(issue: (typeof issues)[number]) {
    setIssuesOpen(false);

    if (!issue.nodeId) {
      return;
    }

    setSelectedNodeId(issue.nodeId);
    setOpenSectionKey(issue.sectionKey ?? null);
    setFocusFieldKey(issue.fieldKey ?? null);
  }

  return (
    <section
      aria-label={`${applicationName} editor`}
      className="agent-flow-editor"
      data-application-id={applicationId}
    >
      <AgentFlowOverlay
        applicationName={applicationName}
        autosaveLabel={`${editorState.autosave_interval_seconds} 秒自动保存`}
        autosaveStatus={autosaveStatus}
        onOpenIssues={() => setIssuesOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
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
          focusFieldKey={focusFieldKey}
          openSectionKey={openSectionKey}
          onDocumentChange={setDocument}
          onFocusHandled={() => setFocusFieldKey(null)}
        />
      </div>
      {issues.some((issue) => issue.scope === 'global') ? (
        <Typography.Text type="danger">
          当前草稿存在全局问题，请先查看 Issues 面板处理。
        </Typography.Text>
      ) : null}
      <IssuesDrawer
        open={issuesOpen}
        issues={issues}
        onClose={() => setIssuesOpen(false)}
        onSelectIssue={handleSelectIssue}
      />
      <VersionHistoryDrawer
        open={historyOpen}
        versions={editorState.versions}
        restoring={restoring}
        onClose={() => setHistoryOpen(false)}
        onRestore={handleRestore}
      />
    </section>
  );
}
