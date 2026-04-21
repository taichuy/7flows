import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConsoleApplicationOrchestrationState,
  ConsoleNodeContributionEntry,
  SaveConsoleApplicationDraftInput
} from '@1flowbase/api-client';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import { Button, Typography } from 'antd';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent
} from 'react';

import { useContainerNavigation } from '../../hooks/interactions/use-container-navigation';
import { useDraftSync } from '../../hooks/interactions/use-draft-sync';
import { useEditorShortcuts } from '../../hooks/interactions/use-editor-shortcuts';
import { useNodeDetailActions } from '../../hooks/interactions/use-node-detail-actions';
import {
  buildFlowDebugRunInput,
  buildNodeDebugPreviewInput,
  nodeLastRunQueryKey,
  startFlowDebugRun,
  startNodeDebugPreview
} from '../../api/runtime';
import {
  fetchModelProviderOptions,
  modelProviderOptionsQueryKey
} from '../../api/model-provider-options';
import {
  NODE_DETAIL_DEFAULT_WIDTH,
  NODE_DETAIL_MIN_CANVAS_WIDTH,
  clampNodeDetailWidth,
  getNodeDetailLayout
} from '../../lib/detail-panel-width';
import { validateDocument } from '../../lib/validate-document';
import { buildNodePickerOptions } from '../../lib/plugin-node-definitions';
import { useAuthStore } from '../../../../state/auth-store';
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
  nodeContributions: ConsoleNodeContributionEntry[];
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
  nodeContributions,
  saveDraftOverride,
  restoreVersionOverride
}: AgentFlowCanvasFrameProps) {
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
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
  const stopNodeDetailResizeRef = useRef<(() => void) | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [isResizingNodeDetail, setIsResizingNodeDetail] = useState(false);
  const modelProviderOptionsQuery = useQuery({
    queryKey: modelProviderOptionsQueryKey,
    queryFn: fetchModelProviderOptions
  });
  const navigation = useContainerNavigation();
  const draftSync = useDraftSync({
    applicationId,
    saveDraftOverride,
    restoreVersionOverride,
    getCurrentDocument: () => getDocumentWithLatestViewport(documentRef.current),
    getLastSavedDocument: () => lastSavedDocumentRef.current
  });
  const issues = useMemo(
    () =>
      validateDocument(
        workingDocument,
        modelProviderOptionsQuery.isSuccess ? modelProviderOptionsQuery.data : null
      ),
    [workingDocument, modelProviderOptionsQuery.data, modelProviderOptionsQuery.isSuccess]
  );
  const activeContainerId = activeContainerPath.at(-1) ?? null;
  const detailActions = useNodeDetailActions();
  const nodePreviewMutation = useMutation({
    mutationFn: async (nodeId: string) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return startNodeDebugPreview(
        applicationId,
        nodeId,
        buildNodeDebugPreviewInput(documentRef.current, nodeId),
        csrfToken
      );
    },
    onSuccess: async (lastRun, nodeId) => {
      queryClient.setQueryData(nodeLastRunQueryKey(applicationId, nodeId), lastRun);
      setPanelState({ nodeDetailTab: 'lastRun' });
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }
  });
  const flowDebugRunMutation = useMutation({
    mutationFn: async () => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return startFlowDebugRun(
        applicationId,
        buildFlowDebugRunInput(documentRef.current),
        csrfToken
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['applications', applicationId, 'runtime']
      });
    }
  });
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
  const nodePickerOptions = useMemo(
    () => buildNodePickerOptions(nodeContributions),
    [nodeContributions]
  );

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

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      setBodyWidth(entry.contentRect.width);
    });

    resizeObserver.observe(element);
    setBodyWidth(element.getBoundingClientRect().width);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      stopNodeDetailResizeRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (selectedNodeId) {
      return;
    }

    stopNodeDetailResizeRef.current?.();
  }, [selectedNodeId]);

  useEditorShortcuts();

  const canvasFrameWidth =
    bodyWidth || NODE_DETAIL_DEFAULT_WIDTH + NODE_DETAIL_MIN_CANVAS_WIDTH;
  const boundedNodeDetailWidth = clampNodeDetailWidth(
    nodeDetailWidth,
    canvasFrameWidth
  );
  const nodeDetailLayout = getNodeDetailLayout(boundedNodeDetailWidth);

  function handleNodeDetailResizeStart(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = boundedNodeDetailWidth;
    const containerWidth = canvasFrameWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    stopNodeDetailResizeRef.current?.();
    setIsResizingNodeDetail(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingNodeDetail(false);
      stopNodeDetailResizeRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = clampNodeDetailWidth(
        startWidth + startX - moveEvent.clientX,
        containerWidth
      );

      setPanelState({ nodeDetailWidth: nextWidth });
    };

    stopNodeDetailResizeRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
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

  function handleRunSelectedNode() {
    if (!selectedNodeId) {
      return;
    }

    nodePreviewMutation.mutate(selectedNodeId);
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
        onStartDebugRun={() => flowDebugRunMutation.mutate()}
        debugRunLoading={flowDebugRunMutation.isPending}
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
        <AgentFlowCanvas
          issueCountByNodeId={issueCountByNodeId}
          nodePickerOptions={nodePickerOptions}
          onViewportSnapshotChange={(viewport) => {
            viewportSnapshotRef.current = viewport;
          }}
          onViewportGetterReady={(getter) => {
            viewportGetterRef.current = getter;
          }}
        />
        {selectedNodeId ? (
          <div
            className="agent-flow-editor__detail-dock"
            data-layout={nodeDetailLayout}
            data-testid="agent-flow-editor-detail-dock"
            data-resizing={isResizingNodeDetail ? 'true' : 'false'}
            style={{ width: `${boundedNodeDetailWidth}px` }}
          >
            <div
              aria-label="调整节点详情宽度"
              aria-orientation="vertical"
              className="agent-flow-editor__detail-resize-handle"
              onMouseDown={handleNodeDetailResizeStart}
              role="separator"
            />
            <NodeDetailPanel
              applicationId={applicationId}
              onClose={detailActions.closeDetail}
              onRunNode={selectedNodeId ? handleRunSelectedNode : undefined}
              runLoading={nodePreviewMutation.isPending}
            />
          </div>
        ) : null}
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
