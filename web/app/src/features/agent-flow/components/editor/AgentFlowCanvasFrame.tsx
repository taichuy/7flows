import type {
  ConsoleApplicationOrchestrationState,
  SaveConsoleApplicationDraftInput
} from '@1flowse/api-client';
import type { FlowAuthoringDocument } from '@1flowse/flow-schema';
import { Button, Splitter, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { useContainerNavigation } from '../../hooks/interactions/use-container-navigation';
import { useDraftSync } from '../../hooks/interactions/use-draft-sync';
import { useEditorShortcuts } from '../../hooks/interactions/use-editor-shortcuts';
import { useNodeDetailActions } from '../../hooks/interactions/use-node-detail-actions';
import {
  NODE_DETAIL_DEFAULT_WIDTH,
  NODE_DETAIL_MIN_CANVAS_WIDTH,
  NODE_DETAIL_MIN_WIDTH,
  clampNodeDetailWidth,
  getMaxNodeDetailWidth,
  getNodeDetailWidthFromSplitter
} from '../../lib/detail-panel-width';
import { validateDocument } from '../../lib/validate-document';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectAutosaveStatus,
  selectLastSavedDocument,
  selectVersions,
  selectWorkingDocument
} from '../../store/editor/selectors';
import { NodeDetailPanel } from '../detail/NodeDetailPanel';
import { VersionHistoryDrawer } from '../history/VersionHistoryDrawer';
import { IssuesDrawer } from '../issues/IssuesDrawer';
import { AgentFlowCanvas } from './AgentFlowCanvas';
import { AgentFlowOverlay } from './AgentFlowOverlay';

interface AgentFlowCanvasFrameProps {
  applicationId: string;
  applicationName: string;
  saveDraftOverride?: (
    input: SaveConsoleApplicationDraftInput
  ) => Promise<ConsoleApplicationOrchestrationState>;
  restoreVersionOverride?: (
    versionId: string
  ) => Promise<ConsoleApplicationOrchestrationState>;
}

export function AgentFlowCanvasFrame({
  applicationId,
  applicationName,
  saveDraftOverride,
  restoreVersionOverride
}: AgentFlowCanvasFrameProps) {
  const workingDocument = useAgentFlowEditorStore(selectWorkingDocument);
  const lastSavedDocument = useAgentFlowEditorStore(selectLastSavedDocument);
  const autosaveStatus = useAgentFlowEditorStore(selectAutosaveStatus);
  const versions = useAgentFlowEditorStore(selectVersions);
  const autosaveIntervalMs = useAgentFlowEditorStore(
    (state) => state.autosaveIntervalMs
  );
  const selectedNodeId = useAgentFlowEditorStore((state) => state.selectedNodeId);
  const activeContainerPath = useAgentFlowEditorStore(
    (state) => state.activeContainerPath
  );
  const issuesOpen = useAgentFlowEditorStore((state) => state.issuesOpen);
  const historyOpen = useAgentFlowEditorStore((state) => state.historyOpen);
  const isRestoringVersion = useAgentFlowEditorStore(
    (state) => state.isRestoringVersion
  );
  const nodeDetailWidth = useAgentFlowEditorStore((state) => state.nodeDetailWidth);
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  const documentRef = useRef(workingDocument);
  const lastSavedDocumentRef = useRef(lastSavedDocument);
  const viewportSnapshotRef = useRef(workingDocument.editor.viewport);
  const viewportGetterRef =
    useRef<(() => FlowAuthoringDocument['editor']['viewport']) | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [bodyViewportTop, setBodyViewportTop] = useState(0);
  const navigation = useContainerNavigation();
  const draftSync = useDraftSync({
    applicationId,
    saveDraftOverride,
    restoreVersionOverride,
    getCurrentDocument: () => getDocumentWithLatestViewport(documentRef.current),
    getLastSavedDocument: () => lastSavedDocumentRef.current
  });
  const issues = useMemo(() => validateDocument(workingDocument), [workingDocument]);
  const activeContainerId = activeContainerPath.at(-1) ?? null;
  const detailActions = useNodeDetailActions();
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

  useEffect(() => {
    documentRef.current = workingDocument;
  }, [workingDocument]);

  useEffect(() => {
    lastSavedDocumentRef.current = lastSavedDocument;
  }, [lastSavedDocument]);

  useEffect(() => {
    viewportSnapshotRef.current = workingDocument.editor.viewport;
  }, [workingDocument.editor.viewport]);

  useEffect(() => {
    const element = bodyRef.current;

    if (!element) {
      return;
    }

    const syncBodyMetrics = () => {
      const rect = element.getBoundingClientRect();
      setBodyWidth(rect.width);
      setBodyViewportTop(Math.max(rect.top, 0));
    };

    const resizeObserver = new ResizeObserver(() => {
      syncBodyMetrics();
    });

    resizeObserver.observe(element);
    window.addEventListener('resize', syncBodyMetrics);
    window.addEventListener('scroll', syncBodyMetrics);
    syncBodyMetrics();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncBodyMetrics);
      window.removeEventListener('scroll', syncBodyMetrics);
    };
  }, []);

  useEditorShortcuts();

  const boundedNodeDetailWidth = clampNodeDetailWidth(
    nodeDetailWidth,
    bodyWidth || NODE_DETAIL_DEFAULT_WIDTH + NODE_DETAIL_MIN_CANVAS_WIDTH
  );
  const detailPanelShellStyle = useMemo(
    () =>
      ({
        '--agent-flow-body-top-offset': `${bodyViewportTop}px`
      }) as CSSProperties,
    [bodyViewportTop]
  );

  function syncNodeDetailWidth(sizes: number[]) {
    setPanelState({
      nodeDetailWidth: getNodeDetailWidthFromSplitter(sizes, bodyWidth)
    });
  }

  function getDocumentWithLatestViewport(currentDocument: FlowAuthoringDocument) {
    const viewport = viewportGetterRef.current?.() ?? viewportSnapshotRef.current;
    const currentViewport = currentDocument.editor.viewport;

    if (
      currentViewport.x === viewport.x &&
      currentViewport.y === viewport.y &&
      currentViewport.zoom === viewport.zoom
    ) {
      return currentDocument;
    }

    return {
      ...currentDocument,
      editor: {
        ...currentDocument.editor,
        viewport
      }
    };
  }

  return (
    <section
      aria-label={`${applicationName} editor`}
      className="agent-flow-editor"
      data-application-id={applicationId}
    >
      <AgentFlowOverlay
        applicationName={applicationName}
        autosaveLabel={`${Math.round(autosaveIntervalMs / 1000)} 秒自动保存`}
        autosaveStatus={autosaveStatus}
        onSaveDraft={() => {
          void draftSync.saveNow();
        }}
        saveDisabled={autosaveStatus === 'saving'}
        saveLoading={autosaveStatus === 'saving'}
        onOpenIssues={() => setPanelState({ issuesOpen: true })}
        onOpenHistory={() => setPanelState({ historyOpen: true })}
        onOpenPublish={() => undefined}
        publishDisabled={false}
      />
      {activeContainerId ? (
        <div className="agent-flow-editor__breadcrumb">
          <Button onClick={navigation.returnToRoot}>返回主画布</Button>
          <Typography.Text type="secondary">
            当前位于容器节点{' '}
            {
              workingDocument.graph.nodes.find((node) => node.id === activeContainerId)
                ?.alias
            }
          </Typography.Text>
        </div>
      ) : null}
      <div
        ref={bodyRef}
        className="agent-flow-editor__body agent-flow-editor__shell"
        data-testid="agent-flow-editor-body"
      >
        {selectedNodeId ? (
          <div
            className="agent-flow-editor__splitter-shell"
            data-testid="agent-flow-editor-splitter"
          >
            <Splitter
              className="agent-flow-editor__splitter"
              layout="horizontal"
              onResize={syncNodeDetailWidth}
              onResizeEnd={syncNodeDetailWidth}
            >
              <Splitter.Panel
                className="agent-flow-editor__canvas-panel"
                min={NODE_DETAIL_MIN_CANVAS_WIDTH}
              >
                <AgentFlowCanvas
                  issueCountByNodeId={issueCountByNodeId}
                  onViewportSnapshotChange={(viewport) => {
                    viewportSnapshotRef.current = viewport;
                  }}
                  onViewportGetterReady={(getter) => {
                    viewportGetterRef.current = getter;
                  }}
                />
              </Splitter.Panel>
              <Splitter.Panel
                className="agent-flow-editor__detail-panel"
                min={NODE_DETAIL_MIN_WIDTH}
                max={getMaxNodeDetailWidth(bodyWidth || boundedNodeDetailWidth)}
                size={boundedNodeDetailWidth}
              >
                <div
                  className="agent-flow-editor__detail-panel-shell"
                  data-testid="agent-flow-editor-detail-shell"
                  style={detailPanelShellStyle}
                >
                  <NodeDetailPanel
                    onClose={detailActions.closeDetail}
                    onRunNode={undefined}
                  />
                </div>
              </Splitter.Panel>
            </Splitter>
          </div>
        ) : (
          <AgentFlowCanvas
            issueCountByNodeId={issueCountByNodeId}
            onViewportSnapshotChange={(viewport) => {
              viewportSnapshotRef.current = viewport;
            }}
            onViewportGetterReady={(getter) => {
              viewportGetterRef.current = getter;
            }}
          />
        )}
      </div>
      {issues.some((issue) => issue.scope === 'global') ? (
        <Typography.Text type="danger">
          当前草稿存在全局问题，请先查看 Issues 面板处理。
        </Typography.Text>
      ) : null}
      <IssuesDrawer
        open={issuesOpen}
        issues={issues}
        onClose={() => setPanelState({ issuesOpen: false })}
        onSelectIssue={navigation.jumpToIssue}
      />
      <VersionHistoryDrawer
        open={historyOpen}
        versions={versions}
        restoring={isRestoringVersion}
        onClose={() => setPanelState({ historyOpen: false })}
        onRestore={draftSync.restoreVersion}
      />
    </section>
  );
}
