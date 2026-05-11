import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConsoleApplicationEnvironmentVariable,
  ConsoleApplicationOrchestrationState,
  ConsoleNodeContributionEntry,
  SaveConsoleApplicationDraftInput
} from '@1flowbase/api-client';
import type { FlowAuthoringDocument } from '@1flowbase/flow-schema';
import {
  CloseOutlined,
  CopyOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import { App, Button, Tooltip, Typography } from 'antd';
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
import { useAgentFlowDebugSession } from '../../hooks/runtime/useAgentFlowDebugSession';
import {
  applicationRunNodeLastRunQueryKey,
  buildNodeDebugPreviewPlan,
  extractNodePreviewVariableOutput,
  fetchRuntimeDebugArtifact,
  nodeLastRunToFlowDebugRunDetail,
  nodeLastRunQueryKey,
  startNodeDebugPreview,
  type NodeDebugPreviewPlan
} from '../../api/runtime';
import { orchestrationQueryKey, updateVersion } from '../../api/orchestration';
import {
  applicationEnvironmentVariablesQueryKey,
  replaceApplicationEnvironmentVariables
} from '../../../applications/api/applications';
import type { AgentFlowEnvironmentVariable } from '../../lib/application-environment-variables';
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
import { copyTextToClipboard } from '../../../../shared/ui/clipboard/copy-text';
import { useAgentFlowEditorStore } from '../../store/editor/provider';
import {
  selectAutosaveStatus,
  selectDebugConsoleOpen,
  selectDebugConsoleWidth,
  selectLastSavedDocument,
  selectVersions,
  selectWorkingDocument
} from '../../store/editor/selectors';
import { AgentFlowDebugConsole } from '../debug-console/AgentFlowDebugConsole';
import {
  DebugVariablesPane,
  type SelectedVariableInfo
} from '../debug-console/variables/DebugVariablesPane';
import { NodeDetailPanel } from '../detail/NodeDetailPanel';
import { NodePreviewVariablesModal } from '../detail/NodePreviewVariablesModal';
import { VersionHistoryPanel } from '../history/VersionHistoryPanel';
import { IssuesDrawer } from '../issues/IssuesDrawer';
import { AgentFlowCanvas } from './AgentFlowCanvas';
import { AgentFlowOverlay } from './AgentFlowOverlay';
import { AgentFlowSideDock } from './AgentFlowSideDock';
import { ApplicationEnvironmentVariablesPanel } from './ApplicationEnvironmentVariablesPanel';
import { SystemVariablesPanel } from './SystemVariablesPanel';

const DEBUG_CONSOLE_DEFAULT_WIDTH = 420;
const DEBUG_CONSOLE_MIN_WIDTH = 320;
const DEBUG_CONSOLE_GAP = 12;
const SYSTEM_VARIABLES_DOCK_WIDTH = 420;
const ENVIRONMENT_VARIABLES_DOCK_WIDTH = 520;
const VARIABLES_DOCK_MIN_WIDTH = 360;
const HISTORY_DOCK_WIDTH = 460;
const HISTORY_DOCK_MIN_WIDTH = 360;
const VARIABLE_CACHE_DEFAULT_HEIGHT = 330;
const VARIABLE_CACHE_MIN_HEIGHT = 180;
const VARIABLE_CACHE_BOTTOM_GAP = 16;
const VARIABLE_CACHE_MAX_TOP_GAP = 96;
const VARIABLE_CACHE_DEFAULT_SIDEBAR_WIDTH = 270;
const VARIABLE_CACHE_MIN_SIDEBAR_WIDTH = 140;
const VARIABLE_CACHE_MIN_DETAIL_WIDTH = 220;

interface AgentFlowCanvasFrameProps {
  applicationId: string;
  applicationName: string;
  initialEnvironmentVariables?: ConsoleApplicationEnvironmentVariable[];
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
  initialEnvironmentVariables = [],
  nodeContributions,
  saveDraftOverride,
  restoreVersionOverride
}: AgentFlowCanvasFrameProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const workingDocument = useAgentFlowEditorStore(selectWorkingDocument);
  const lastSavedDocument = useAgentFlowEditorStore(selectLastSavedDocument);
  const autosaveStatus = useAgentFlowEditorStore(selectAutosaveStatus);
  const versions = useAgentFlowEditorStore(selectVersions);
  const draftMeta = useAgentFlowEditorStore((state) => state.draftMeta);
  const autosaveIntervalMs = useAgentFlowEditorStore(
    (state) => state.autosaveIntervalMs
  );
  const debugConsoleOpen = useAgentFlowEditorStore(selectDebugConsoleOpen);
  const debugConsoleWidth = useAgentFlowEditorStore(selectDebugConsoleWidth);
  const selectedNodeId = useAgentFlowEditorStore(
    (state) => state.selectedNodeId
  );
  const activeContainerPath = useAgentFlowEditorStore(
    (state) => state.activeContainerPath
  );
  const issuesOpen = useAgentFlowEditorStore((state) => state.issuesOpen);
  const historyOpen = useAgentFlowEditorStore((state) => state.historyOpen);
  const isRestoringVersion = useAgentFlowEditorStore(
    (state) => state.isRestoringVersion
  );
  const nodeDetailWidth = useAgentFlowEditorStore(
    (state) => state.nodeDetailWidth
  );
  const setPanelState = useAgentFlowEditorStore((state) => state.setPanelState);
  const syncSavedServerState = useAgentFlowEditorStore(
    (state) => state.syncSavedServerState
  );
  const documentRef = useRef(workingDocument);
  const lastSavedDocumentRef = useRef(lastSavedDocument);
  const viewportSnapshotRef = useRef(workingDocument.editor.viewport);
  const viewportGetterRef = useRef<
    (() => FlowAuthoringDocument['editor']['viewport']) | null
  >(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stopNodeDetailResizeRef = useRef<(() => void) | null>(null);
  const stopDebugConsoleResizeRef = useRef<(() => void) | null>(null);
  const stopVariablesDockResizeRef = useRef<(() => void) | null>(null);
  const stopHistoryDockResizeRef = useRef<(() => void) | null>(null);
  const stopVariableCacheResizeRef = useRef<(() => void) | null>(null);
  const stopVariableCacheSidebarResizeRef = useRef<(() => void) | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  const [isResizingNodeDetail, setIsResizingNodeDetail] = useState(false);
  const [isResizingDebugConsole, setIsResizingDebugConsole] = useState(false);
  const [isResizingVariablesDock, setIsResizingVariablesDock] = useState(false);
  const [isResizingHistoryDock, setIsResizingHistoryDock] = useState(false);
  const [pendingNodePreview, setPendingNodePreview] = useState<{
    nodeId: string;
    plan: NodeDebugPreviewPlan;
  } | null>(null);
  const [variableCacheOpen, setVariableCacheOpen] = useState(false);
  const [systemVariablesOpen, setSystemVariablesOpen] = useState(false);
  const [environmentVariablesOpen, setEnvironmentVariablesOpen] =
    useState(false);
  const [systemVariablesDockWidth, setSystemVariablesDockWidth] = useState(
    SYSTEM_VARIABLES_DOCK_WIDTH
  );
  const [environmentVariablesDockWidth, setEnvironmentVariablesDockWidth] =
    useState(ENVIRONMENT_VARIABLES_DOCK_WIDTH);
  const [historyDockWidth, setHistoryDockWidth] = useState(HISTORY_DOCK_WIDTH);
  const [environmentVariables, setEnvironmentVariables] = useState<
    AgentFlowEnvironmentVariable[]
  >(initialEnvironmentVariables);
  const [selectedVariable, setSelectedVariable] =
    useState<SelectedVariableInfo | null>(null);
  const [variableCacheHeight, setVariableCacheHeight] = useState(
    VARIABLE_CACHE_DEFAULT_HEIGHT
  );
  const [isResizingVariableCache, setIsResizingVariableCache] = useState(false);
  const [variableCacheSidebarWidth, setVariableCacheSidebarWidth] = useState(
    VARIABLE_CACHE_DEFAULT_SIDEBAR_WIDTH
  );
  const [isResizingVariableCacheSidebar, setIsResizingVariableCacheSidebar] =
    useState(false);
  const modelProviderOptionsQuery = useQuery({
    queryKey: modelProviderOptionsQueryKey,
    queryFn: fetchModelProviderOptions
  });
  const environmentVariablesMutation = useMutation({
    mutationFn: (variables: AgentFlowEnvironmentVariable[]) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return replaceApplicationEnvironmentVariables(
        applicationId,
        variables,
        csrfToken
      );
    },
    onSuccess(nextVariables) {
      setEnvironmentVariables(nextVariables);
      queryClient.setQueryData(
        applicationEnvironmentVariablesQueryKey(applicationId),
        nextVariables
      );
      message.success('环境变量已保存');
    },
    onError() {
      message.error('环境变量保存失败');
    }
  });
  const versionMetadataMutation = useMutation({
    mutationFn: ({
      versionId,
      input
    }: {
      versionId: string;
      input: Parameters<typeof updateVersion>[2];
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return updateVersion(applicationId, versionId, input, csrfToken);
    },
    onSuccess(nextState) {
      syncSavedServerState(nextState);
      queryClient.setQueryData(orchestrationQueryKey(applicationId), nextState);
      message.success('历史版本已更新');
    },
    onError() {
      message.error('历史版本更新失败');
    }
  });

  useEffect(() => {
    setEnvironmentVariables(initialEnvironmentVariables);
  }, [initialEnvironmentVariables]);
  const navigation = useContainerNavigation();
  const draftSync = useDraftSync({
    applicationId,
    saveDraftOverride,
    restoreVersionOverride,
    getCurrentDocument: () =>
      getDocumentWithLatestViewport(documentRef.current),
    getLastSavedDocument: () => lastSavedDocumentRef.current
  });
  const debugSession = useAgentFlowDebugSession({
    applicationId,
    draftId: draftMeta.draftId,
    document: workingDocument,
    environmentVariables
  });
  const issues = useMemo(
    () =>
      validateDocument(
        workingDocument,
        modelProviderOptionsQuery.isSuccess
          ? modelProviderOptionsQuery.data
          : null,
        environmentVariables
      ),
    [
      environmentVariables,
      workingDocument,
      modelProviderOptionsQuery.data,
      modelProviderOptionsQuery.isSuccess
    ]
  );
  const activeContainerId = activeContainerPath.at(-1) ?? null;
  const detailActions = useNodeDetailActions();
  const nodePreviewMutation = useMutation({
    mutationFn: async ({
      nodeId,
      inputPayload
    }: {
      nodeId: string;
      inputPayload: Record<string, Record<string, unknown>>;
    }) => {
      if (!csrfToken) {
        throw new Error('missing csrf token');
      }

      return startNodeDebugPreview(
        applicationId,
        nodeId,
        {
          input_payload: inputPayload,
          document: getDocumentWithLatestViewport(documentRef.current),
          debug_session_id: debugSession.debugSessionId
        },
        csrfToken
      );
    },
    onSuccess: async (lastRun, variables) => {
      debugSession.rememberNodePreviewOutputs({
        [variables.nodeId]: extractNodePreviewVariableOutput(lastRun)
      });
      queryClient.setQueryData(
        nodeLastRunQueryKey(applicationId, variables.nodeId),
        lastRun
      );
      queryClient.setQueryData(
        applicationRunNodeLastRunQueryKey(
          applicationId,
          lastRun.flow_run.id,
          variables.nodeId
        ),
        lastRun
      );
      debugSession.rememberExternalRunDetail(
        nodeLastRunToFlowDebugRunDetail(lastRun)
      );
      setPanelState({ nodeDetailTab: 'lastRun' });
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
      setBodyHeight(entry.contentRect.height);
    });

    resizeObserver.observe(element);
    const bodyRect = element.getBoundingClientRect();
    setBodyWidth(bodyRect.width);
    setBodyHeight(bodyRect.height);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      stopNodeDetailResizeRef.current?.();
      stopDebugConsoleResizeRef.current?.();
      stopVariablesDockResizeRef.current?.();
      stopHistoryDockResizeRef.current?.();
      stopVariableCacheResizeRef.current?.();
      stopVariableCacheSidebarResizeRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (selectedNodeId) {
      return;
    }

    stopNodeDetailResizeRef.current?.();
  }, [selectedNodeId]);

  useEffect(() => {
    if (debugConsoleOpen) {
      return;
    }

    stopDebugConsoleResizeRef.current?.();
  }, [debugConsoleOpen]);

  useEffect(() => {
    if (systemVariablesOpen || environmentVariablesOpen) {
      return;
    }

    stopVariablesDockResizeRef.current?.();
  }, [environmentVariablesOpen, systemVariablesOpen]);

  useEffect(() => {
    if (historyOpen) {
      return;
    }

    stopHistoryDockResizeRef.current?.();
  }, [historyOpen]);

  useEffect(() => {
    if (variableCacheOpen) {
      return;
    }

    stopVariableCacheResizeRef.current?.();
  }, [variableCacheOpen]);

  useEffect(() => {
    if (variableCacheOpen) {
      return;
    }

    stopVariableCacheSidebarResizeRef.current?.();
  }, [variableCacheOpen]);

  useEditorShortcuts();

  const canvasFrameWidth =
    bodyWidth || NODE_DETAIL_DEFAULT_WIDTH + NODE_DETAIL_MIN_CANVAS_WIDTH;
  const maxDebugConsoleWidth = Math.max(
    canvasFrameWidth -
      (selectedNodeId ? nodeDetailWidth : 0) -
      NODE_DETAIL_MIN_CANVAS_WIDTH,
    DEBUG_CONSOLE_MIN_WIDTH
  );
  const boundedDebugConsoleWidth = Math.min(
    Math.max(debugConsoleWidth, DEBUG_CONSOLE_MIN_WIDTH),
    maxDebugConsoleWidth
  );
  const variablesDockOpen = systemVariablesOpen || environmentVariablesOpen;
  const maxVariablesDockWidth = Math.max(
    canvasFrameWidth -
      (selectedNodeId ? nodeDetailWidth : 0) -
      NODE_DETAIL_MIN_CANVAS_WIDTH,
    VARIABLES_DOCK_MIN_WIDTH
  );
  const rawVariablesDockWidth = environmentVariablesOpen
    ? environmentVariablesDockWidth
    : systemVariablesDockWidth;
  const boundedVariablesDockWidth = Math.min(
    Math.max(rawVariablesDockWidth, VARIABLES_DOCK_MIN_WIDTH),
    maxVariablesDockWidth
  );
  const maxHistoryDockWidth = Math.max(
    canvasFrameWidth -
      (selectedNodeId ? nodeDetailWidth : 0) -
      NODE_DETAIL_MIN_CANVAS_WIDTH,
    HISTORY_DOCK_MIN_WIDTH
  );
  const boundedHistoryDockWidth = Math.min(
    Math.max(historyDockWidth, HISTORY_DOCK_MIN_WIDTH),
    maxHistoryDockWidth
  );
  const sideDockOccupiedWidth = debugConsoleOpen
    ? boundedDebugConsoleWidth + DEBUG_CONSOLE_GAP
    : variablesDockOpen
      ? boundedVariablesDockWidth + DEBUG_CONSOLE_GAP
      : historyOpen
        ? boundedHistoryDockWidth + DEBUG_CONSOLE_GAP
        : 0;
  const detailContainerWidth = canvasFrameWidth - sideDockOccupiedWidth;
  const boundedNodeDetailWidth = clampNodeDetailWidth(
    nodeDetailWidth,
    detailContainerWidth
  );
  const nodeDetailLayout = getNodeDetailLayout(boundedNodeDetailWidth);
  const nodeDetailOccupiedWidth = selectedNodeId
    ? boundedNodeDetailWidth + DEBUG_CONSOLE_GAP
    : 0;
  const variableCacheRightOffset =
    16 + nodeDetailOccupiedWidth + sideDockOccupiedWidth;
  const variableCacheCenterLeft = Math.max(
    120,
    (canvasFrameWidth - variableCacheRightOffset) / 2
  );
  const variableCacheMaxHeight = Math.max(
    VARIABLE_CACHE_MIN_HEIGHT,
    (bodyHeight || VARIABLE_CACHE_DEFAULT_HEIGHT + VARIABLE_CACHE_MAX_TOP_GAP) -
      VARIABLE_CACHE_MAX_TOP_GAP -
      VARIABLE_CACHE_BOTTOM_GAP
  );
  const boundedVariableCacheHeight = Math.min(
    Math.max(variableCacheHeight, VARIABLE_CACHE_MIN_HEIGHT),
    variableCacheMaxHeight
  );
  const variableCachePanelInnerWidth = Math.max(
    canvasFrameWidth - variableCacheRightOffset - 32,
    VARIABLE_CACHE_MIN_DETAIL_WIDTH + VARIABLE_CACHE_MIN_SIDEBAR_WIDTH
  );
  const variableCacheSidebarMaxWidth = Math.max(
    variableCachePanelInnerWidth - VARIABLE_CACHE_MIN_DETAIL_WIDTH,
    VARIABLE_CACHE_MIN_SIDEBAR_WIDTH
  );
  const boundedVariableCacheSidebarWidth = Math.max(
    VARIABLE_CACHE_MIN_SIDEBAR_WIDTH,
    Math.min(variableCacheSidebarWidth, variableCacheSidebarMaxWidth)
  );

  function handleNodeDetailResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = boundedNodeDetailWidth;
    const containerWidth = detailContainerWidth;
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

  function handleDebugConsoleResizeStart(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = boundedDebugConsoleWidth;
    const containerWidth = canvasFrameWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    stopDebugConsoleResizeRef.current?.();
    setIsResizingDebugConsole(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingDebugConsole(false);
      stopDebugConsoleResizeRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(
        Math.max(
          startWidth - (moveEvent.clientX - startX),
          DEBUG_CONSOLE_MIN_WIDTH
        ),
        Math.max(
          containerWidth -
            (selectedNodeId ? boundedNodeDetailWidth : 0) -
            NODE_DETAIL_MIN_CANVAS_WIDTH,
          DEBUG_CONSOLE_MIN_WIDTH
        )
      );

      setPanelState({ debugConsoleWidth: nextWidth });
    };

    stopDebugConsoleResizeRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function handleVariablesDockResizeStart(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = boundedVariablesDockWidth;
    const containerWidth = canvasFrameWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    stopVariablesDockResizeRef.current?.();
    setIsResizingVariablesDock(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingVariablesDock(false);
      stopVariablesDockResizeRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(
        Math.max(
          startWidth - (moveEvent.clientX - startX),
          VARIABLES_DOCK_MIN_WIDTH
        ),
        Math.max(
          containerWidth -
            (selectedNodeId ? boundedNodeDetailWidth : 0) -
            NODE_DETAIL_MIN_CANVAS_WIDTH,
          VARIABLES_DOCK_MIN_WIDTH
        )
      );

      if (environmentVariablesOpen) {
        setEnvironmentVariablesDockWidth(nextWidth);
      } else {
        setSystemVariablesDockWidth(nextWidth);
      }
    };

    stopVariablesDockResizeRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function handleHistoryDockResizeStart(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = boundedHistoryDockWidth;
    const containerWidth = canvasFrameWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    stopHistoryDockResizeRef.current?.();
    setIsResizingHistoryDock(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingHistoryDock(false);
      stopHistoryDockResizeRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(
        Math.max(
          startWidth - (moveEvent.clientX - startX),
          HISTORY_DOCK_MIN_WIDTH
        ),
        Math.max(
          containerWidth -
            (selectedNodeId ? boundedNodeDetailWidth : 0) -
            NODE_DETAIL_MIN_CANVAS_WIDTH,
          HISTORY_DOCK_MIN_WIDTH
        )
      );

      setHistoryDockWidth(nextWidth);
    };

    stopHistoryDockResizeRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function handleVariableCacheResizeStart(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startY = event.clientY;
    const startHeight = boundedVariableCacheHeight;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    stopVariableCacheResizeRef.current?.();
    setIsResizingVariableCache(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingVariableCache(false);
      stopVariableCacheResizeRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(
        Math.max(
          startHeight + startY - moveEvent.clientY,
          VARIABLE_CACHE_MIN_HEIGHT
        ),
        variableCacheMaxHeight
      );

      setVariableCacheHeight(nextHeight);
    };

    stopVariableCacheResizeRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }

  function handleVariableCacheSidebarResizeStart(
    event: ReactMouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = boundedVariableCacheSidebarWidth;
    const minWidth = VARIABLE_CACHE_MIN_SIDEBAR_WIDTH;
    const maxWidth = variableCacheSidebarMaxWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    stopVariableCacheSidebarResizeRef.current?.();
    setIsResizingVariableCacheSidebar(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const cleanup = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', cleanup);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      setIsResizingVariableCacheSidebar(false);
      stopVariableCacheSidebarResizeRef.current = null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(
        Math.max(startWidth + moveEvent.clientX - startX, minWidth),
        maxWidth
      );

      setVariableCacheSidebarWidth(nextWidth);
    };

    stopVariableCacheSidebarResizeRef.current = cleanup;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', cleanup);
  }
  function handleResetVariableCache() {
    debugSession.resetVariableCache();
    setSelectedVariable(null);
    message.success('已重置变量缓存');
  }

  function handleVariableCacheValueChange(key: string, value: unknown) {
    if (
      selectedVariable?.isReadOnly ||
      !selectedVariable ||
      selectedVariable.key !== key
    ) {
      return;
    }

    setSelectedVariable((current) =>
      current?.key === key
        ? {
            ...current,
            value
          }
        : current
    );
    debugSession.setVariableCacheValue(key, value);
  }
  function getDocumentWithLatestViewport(
    currentDocument: FlowAuthoringDocument
  ) {
    const viewport =
      viewportGetterRef.current?.() ?? viewportSnapshotRef.current;
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

  function runNodePreview(
    nodeId: string,
    inputPayload: Record<string, Record<string, unknown>>
  ) {
    debugSession.rememberNodePreviewInputs(inputPayload);
    nodePreviewMutation.mutate({ nodeId, inputPayload });
  }

  function handleRunNode(nodeId: string) {
    const plan = buildNodeDebugPreviewPlan(
      documentRef.current,
      nodeId,
      debugSession.getNodePreviewVariableCache()
    );

    if (plan.missing_fields.length > 0) {
      setPendingNodePreview({ nodeId, plan });
      return;
    }

    runNodePreview(nodeId, plan.input_payload);
  }

  function handleSubmitNodePreviewVariables(
    inputPayload: Record<string, Record<string, unknown>>
  ) {
    if (!pendingNodePreview) {
      return;
    }

    const mergedInputPayload = { ...pendingNodePreview.plan.input_payload };

    for (const [nodeId, payload] of Object.entries(inputPayload)) {
      mergedInputPayload[nodeId] = {
        ...(mergedInputPayload[nodeId] ?? {}),
        ...payload
      };
    }

    const nodeId = pendingNodePreview.nodeId;

    setPendingNodePreview(null);
    runNodePreview(nodeId, mergedInputPayload);
  }

  function handleRunSelectedNode() {
    if (!selectedNodeId) {
      return;
    }

    handleRunNode(selectedNodeId);
  }

  function openDebugConsole() {
    setEnvironmentVariablesOpen(false);
    setSystemVariablesOpen(false);
    setPanelState({
      debugConsoleOpen: true,
      debugConsoleWidth: debugConsoleWidth || DEBUG_CONSOLE_DEFAULT_WIDTH,
      historyOpen: false
    });
  }

  function openEnvironmentVariables() {
    setPanelState({ debugConsoleOpen: false, historyOpen: false });
    setSystemVariablesOpen(false);
    setEnvironmentVariablesOpen(true);
  }

  function openSystemVariables() {
    setPanelState({ debugConsoleOpen: false, historyOpen: false });
    setEnvironmentVariablesOpen(false);
    setSystemVariablesOpen(true);
  }

  function openHistory() {
    setEnvironmentVariablesOpen(false);
    setSystemVariablesOpen(false);
    setPanelState({ debugConsoleOpen: false, historyOpen: true });
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
        onOpenDebugConsole={openDebugConsole}
        onOpenIssues={() => setPanelState({ issuesOpen: true })}
        onOpenHistory={openHistory}
        onOpenEnvironmentVariables={openEnvironmentVariables}
        onOpenSystemVariables={openSystemVariables}
        onOpenPublish={() => undefined}
        publishDisabled={false}
      />
      {activeContainerId ? (
        <div className="agent-flow-editor__breadcrumb">
          <Button onClick={navigation.returnToRoot}>返回主画布</Button>
          <Typography.Text type="secondary">
            当前位于容器节点{' '}
            {
              workingDocument.graph.nodes.find(
                (node) => node.id === activeContainerId
              )?.alias
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
          onRunNode={handleRunNode}
          onViewportSnapshotChange={(viewport) => {
            viewportSnapshotRef.current = viewport;
          }}
          onViewportGetterReady={(getter) => {
            viewportGetterRef.current = getter;
          }}
        />
        <Button
          className="agent-flow-editor__variable-cache-trigger"
          size="small"
          type="link"
          style={{ left: variableCacheCenterLeft }}
          onClick={() => setVariableCacheOpen(true)}
        >
          查看缓存
        </Button>
        {variablesDockOpen ? (
          <AgentFlowSideDock
            className="agent-flow-editor__variables-dock"
            data-testid="agent-flow-editor-variables-dock"
            isResizing={isResizingVariablesDock}
            resizeLabel={
              environmentVariablesOpen ? '调整环境变量宽度' : '调整系统变量宽度'
            }
            width={boundedVariablesDockWidth}
            onResizeStart={handleVariablesDockResizeStart}
          >
            {systemVariablesOpen ? (
              <SystemVariablesPanel
                onClose={() => setSystemVariablesOpen(false)}
              />
            ) : (
              <ApplicationEnvironmentVariablesPanel
                loading={environmentVariablesMutation.isPending}
                variables={environmentVariables}
                onClose={() => setEnvironmentVariablesOpen(false)}
                onSave={(nextVariables) =>
                  environmentVariablesMutation.mutate(nextVariables)
                }
              />
            )}
          </AgentFlowSideDock>
        ) : null}
        {selectedNodeId ? (
          <div
            className="agent-flow-editor__detail-dock"
            data-layout={nodeDetailLayout}
            data-testid="agent-flow-editor-detail-dock"
            data-resizing={isResizingNodeDetail ? 'true' : 'false'}
            style={{
              right: sideDockOccupiedWidth
                ? `${sideDockOccupiedWidth + 16}px`
                : undefined,
              width: `${boundedNodeDetailWidth}px`
            }}
          >
            <div
              aria-label="调整节点详情宽度"
              aria-orientation="vertical"
              className="agent-flow-editor__detail-resize-handle"
              onMouseDown={handleNodeDetailResizeStart}
              role="separator"
            />
            <NodeDetailPanel
              activeRunId={debugSession.activeRunId}
              applicationId={applicationId}
              environmentVariables={environmentVariables}
              onClose={detailActions.closeDetail}
              onResolveRunScope={debugSession.selectRunScope}
              onRunNode={selectedNodeId ? handleRunSelectedNode : undefined}
              runLoading={nodePreviewMutation.isPending}
            />
          </div>
        ) : null}
        {variableCacheOpen ? (
          <section
            aria-label="变量缓存"
            className="agent-flow-editor__variable-cache-panel"
            data-resizing={isResizingVariableCache ? 'true' : 'false'}
            data-sidebar-resizing={
              isResizingVariableCacheSidebar ? 'true' : 'false'
            }
            style={{
              right: variableCacheRightOffset,
              height: boundedVariableCacheHeight
            }}
          >
            <div
              aria-label="调整变量缓存高度"
              aria-orientation="horizontal"
              className="agent-flow-editor__variable-cache-resize-handle"
              onMouseDown={handleVariableCacheResizeStart}
              role="separator"
            />
            <header className="agent-flow-editor__variable-cache-header">
              <div className="agent-flow-editor__variable-cache-title-line">
                <Typography.Text strong>变量缓存</Typography.Text>
                <Tooltip title="当前编排页内存中的试运行变量。">
                  <QuestionCircleOutlined
                    aria-label="变量缓存说明"
                    className="agent-flow-editor__variable-cache-help-icon"
                  />
                </Tooltip>
              </div>
              <div className="agent-flow-editor__variable-cache-header-right">
                {selectedVariable && (
                  <div className="agent-flow-editor__variable-cache-header-center">
                    <Typography.Text className="agent-flow-editor__variable-cache-header-variable-name">
                      {selectedVariable.label}
                    </Typography.Text>
                    <Button
                      aria-label="复制变量值"
                      icon={<CopyOutlined />}
                      size="small"
                      type="text"
                      onClick={() => {
                        const text =
                          typeof selectedVariable.value === 'string'
                            ? selectedVariable.value
                            : JSON.stringify(selectedVariable.value, null, 2);
                        copyTextToClipboard(text).then(
                          () => message.success('已复制'),
                          () => message.error('复制失败')
                        );
                      }}
                    >
                      复制
                    </Button>
                  </div>
                )}
                <Button
                  aria-label="重置所有变量缓存"
                  size="small"
                  type="text"
                  onClick={handleResetVariableCache}
                >
                  重置所有
                </Button>
                <Button
                  aria-label="关闭变量缓存"
                  icon={<CloseOutlined />}
                  type="text"
                  onClick={() => setVariableCacheOpen(false)}
                />
              </div>
            </header>
            <div className="agent-flow-editor__variable-cache-body">
              <DebugVariablesPane
                onSelectedValueChange={handleVariableCacheValueChange}
                onLoadFullValue={(artifactRef) =>
                  fetchRuntimeDebugArtifact(applicationId, artifactRef)
                }
                groups={debugSession.variableGroups}
                onSelectedChange={setSelectedVariable}
                sidebarWidth={boundedVariableCacheSidebarWidth}
                sidebarMinWidth={VARIABLE_CACHE_MIN_SIDEBAR_WIDTH}
                sidebarMaxWidth={variableCacheSidebarMaxWidth}
                onSidebarResizeStart={handleVariableCacheSidebarResizeStart}
              />
            </div>
          </section>
        ) : null}
        {debugConsoleOpen ? (
          <AgentFlowSideDock
            className="agent-flow-editor__debug-console-dock"
            data-testid="agent-flow-editor-debug-console-dock"
            isResizing={isResizingDebugConsole}
            resizeLabel="调整预览宽度"
            width={boundedDebugConsoleWidth}
            onResizeStart={handleDebugConsoleResizeStart}
          >
            <AgentFlowDebugConsole
              messages={debugSession.messages}
              runContext={debugSession.runContext}
              status={debugSession.status}
              stopping={debugSession.stopping}
              onChangeRunContextValue={debugSession.setRunContextValue}
              onClearSession={debugSession.clearSession}
              onClose={() => setPanelState({ debugConsoleOpen: false })}
              onLoadArtifact={(artifactRef) =>
                fetchRuntimeDebugArtifact(applicationId, artifactRef)
              }
              onStopRun={() => {
                void debugSession.stopRun();
              }}
              onSubmitPrompt={() => {
                void debugSession.submitPrompt();
              }}
            />
          </AgentFlowSideDock>
        ) : null}
        {historyOpen ? (
          <AgentFlowSideDock
            className="agent-flow-editor__history-dock"
            data-testid="agent-flow-editor-history-dock"
            isResizing={isResizingHistoryDock}
            resizeLabel="调整历史版本宽度"
            width={boundedHistoryDockWidth}
            onResizeStart={handleHistoryDockResizeStart}
          >
            <VersionHistoryPanel
              versions={versions}
              restoring={isRestoringVersion}
              updatingVersionId={
                versionMetadataMutation.isPending
                  ? (versionMetadataMutation.variables?.versionId ?? null)
                  : null
              }
              onClose={() => setPanelState({ historyOpen: false })}
              onRestore={draftSync.restoreVersion}
              onUpdate={(versionId, input) =>
                versionMetadataMutation.mutateAsync({ versionId, input })
              }
            />
          </AgentFlowSideDock>
        ) : null}
      </div>
      {issues.some((issue) => issue.scope === 'global') ? (
        <Typography.Text type="danger">
          当前草稿存在全局问题，请先查看 Issues 面板处理。
        </Typography.Text>
      ) : null}
      <NodePreviewVariablesModal
        confirmLoading={nodePreviewMutation.isPending}
        fields={pendingNodePreview?.plan.missing_fields ?? []}
        open={Boolean(pendingNodePreview)}
        onCancel={() => setPendingNodePreview(null)}
        onSubmit={handleSubmitNodePreviewVariables}
      />
      <IssuesDrawer
        open={issuesOpen}
        issues={issues}
        onClose={() => setPanelState({ issuesOpen: false })}
        onSelectIssue={navigation.jumpToIssue}
      />
    </section>
  );
}
