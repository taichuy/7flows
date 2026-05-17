import {
  Alert,
  Button,
  Divider,
  Empty,
  Flex,
  InputNumber,
  Layout,
  Space,
  Typography
} from 'antd';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { useAuthStore } from '../../../state/auth-store';
import { saveFrontstageBlockCode } from '../api/block-code';
import type { FrontstagePageContent } from '../api/page-content';
import { AddBlockCatalogPickerDrawer } from '../components/AddBlockCatalogPickerDrawer';
import { BlockCodeEditorDrawer } from '../components/BlockCodeEditorDrawer';
import { BlockConfigurationDrawer } from '../components/BlockConfigurationDrawer';
import { JsBlockTrialPanel } from '../components/JsBlockTrialPanel';
import { PageCanvas } from '../components/PageCanvas';
import { useFrontstageBlockCatalog } from '../hooks/use-frontstage-block-catalog';
import { useFrontstageBlockCode } from '../hooks/use-frontstage-block-code';
import { useFrontstagePageCanvasRuntimeSessions } from '../hooks/use-frontstage-page-canvas-runtime-sessions';
import { useFrontstagePageCanvasRuntimeSources } from '../hooks/use-frontstage-page-canvas-runtime-sources';
import { useFrontstagePageContentSave } from '../hooks/use-frontstage-page-content-save';
import type { NormalizedFrontstageBlockCatalogEntry } from '../lib/block-catalog';
import {
  appendFrontstageBlock,
  createFrontstageBlockCompositionState,
  moveFrontstageBlock,
  removeFrontstageBlock,
  updateFrontstageBlockLayout,
  type FrontstageBlockCompositionInput,
  type FrontstageBlockCompositionState
} from '../lib/block-composition';
import {
  createFrontstageBuiltInJsBlockTemplateCode,
  type FrontstageBuiltInJsBlockTemplateId
} from '../lib/block-templates';
import { createFrontstageBlockConfigurationModel } from '../lib/block-configuration';
import { createFrontstageJsBlockDataEffectHandler } from '../lib/js-block-data-effect-handler';
import {
  createFrontstagePageDocument,
  createFrontstagePageDocumentSaveInput,
  type FrontstageBlockInstance
} from '../lib/page-document';
import { createFrontstagePageRenderPlan } from '../lib/page-canvas/render-plan';
import { createFrontstagePageCanvasRuntimeRunPlanState } from '../lib/page-canvas/runtime-run-plan';
import {
  canMoveNode,
  findNodeById,
  getDeleteConfirmMessage,
  getNextGroupTitleIndex,
  getNextPageTitleIndex,
  getPageDisplayTitle,
  normalizePageTree,
  removeNodeFromTree,
  resolveSelectedPageId
} from '../lib/page-tree';
import type { FrontStageTreeNode } from '../lib/page-tree';
import type { RestrictedBlockLoaderLimits } from '../lib/restricted-block-loader';

const DESIGN_MODE_PERMISSION = 'frontstage.page.design';
const DEFAULT_JS_BLOCK_TRIAL_LIMITS: RestrictedBlockLoaderLimits = {
  timeoutMs: 1000,
  maxRenderDepth: 8,
  maxRenderNodes: 250,
  maxEventChainDepth: 4,
  allowedActions: [],
  allowedEvents: [],
  allowedDataModels: [],
  allowedDataOperations: []
};

type FrontStagePageProps = {
  workspaceId: string;
  pageId?: string;
  onNavigatePage?: (pageId?: string) => void;
  initialPageTree?: FrontStageTreeNode[];
  isPageTreeLoading?: boolean;
  hasPageTreeLoadError?: boolean;
  onRetryLoadPageTree?: () => void;
  pageContent?: FrontstagePageContent;
  isPageContentLoading?: boolean;
  hasPageContentLoadError?: boolean;
  onRetryLoadPageContent?: () => void;
  isPageTreeMutating?: boolean;
  pageTreeMutationError?: Error | null;
  onCreateGroupNode?: (
    input: CreatePageTreeNodeInput
  ) => Promise<PageTreeMutationResult | void>;
  onCreatePageNode?: (
    input: CreatePageTreeNodeInput
  ) => Promise<PageTreeMutationResult | void>;
  onRenamePageNode?: (
    nodeId: string,
    input: RenamePageTreeNodeInput
  ) => Promise<PageTreeMutationResult | void>;
  onMovePageNode?: (
    nodeId: string,
    input: MovePageTreeNodeInput
  ) => Promise<PageTreeMutationResult | void>;
  onDeletePageNode?: (nodeId: string) => Promise<void>;
};

type CreatePageTreeNodeInput = {
  title: string | null;
  parentId: string | null;
  rank: string;
};

type RenamePageTreeNodeInput = {
  title: string | null;
};

type MovePageTreeNodeInput = {
  parentId: string | null;
  rank: string;
};

type PageTreeMutationResult = {
  id: string;
  kind: 'group' | 'page';
};

type PageTreeOperationStatus = 'idle' | 'pending' | 'error';

function createCatalogBlockInput(
  entry: NormalizedFrontstageBlockCatalogEntry,
  blockIndex: number
): FrontstageBlockCompositionInput {
  const blockNumber = blockIndex + 1;
  const blockId = `frontstage-js-block-${blockNumber}`;

  return {
    id: blockId,
    codeRef: `${blockId}-code`,
    catalog: {
      providerCode: entry.providerCode,
      installationId: entry.installationId
    },
    contribution: {
      pluginId: entry.pluginId,
      pluginVersion: entry.pluginVersion,
      code: entry.contributionCode
    },
    props: {},
    layout: {
      order: blockIndex,
      region: 'main'
    },
    runtime: {
      kind: entry.runtimeKind,
      entry: entry.entry,
      hint: entry.runtimeKind
    }
  };
}

function toDisplayErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return '页面内容保存失败，请稍后重试。';
}

function requireCsrfToken(csrfToken: string | null): string {
  if (!csrfToken) {
    throw new Error('missing csrf token');
  }

  return csrfToken;
}

function rankForAppendIndex(index: number): string {
  return String((index + 1) * 1000).padStart(6, '0');
}

function rankForMoveTarget(index: number, direction: -1 | 1): string {
  if (direction < 0) {
    return index === 0 ? '000000' : String(index * 1000 + 500).padStart(6, '0');
  }

  return String((index + 1) * 1000 + 500).padStart(6, '0');
}

function findSiblingContext(
  nodes: FrontStageTreeNode[],
  targetNodeId: string,
  parentId: string | null = null
): {
  parentId: string | null;
  siblings: FrontStageTreeNode[];
  index: number;
} | null {
  const index = nodes.findIndex((node) => node.id === targetNodeId);
  if (index >= 0) {
    return {
      parentId,
      siblings: nodes,
      index
    };
  }

  for (const node of nodes) {
    if (!node.children) {
      continue;
    }

    const childContext = findSiblingContext(
      node.children,
      targetNodeId,
      node.id
    );
    if (childContext) {
      return childContext;
    }
  }

  return null;
}

function getNodeAppendRank(
  nodes: FrontStageTreeNode[],
  parentId: string | null
): string {
  if (!parentId) {
    return rankForAppendIndex(nodes.length);
  }

  const parentNode = findNodeById(nodes, parentId);
  return rankForAppendIndex(parentNode?.children?.length ?? 0);
}

function getNumericLayoutValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeLayoutDimension(
  value: number | string | null
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? Math.trunc(parsedValue) : null;
  }

  return null;
}

function findMatchingFrontstageBlockCatalogEntry(
  block: FrontstageBlockInstance | null | undefined,
  catalogItems: NormalizedFrontstageBlockCatalogEntry[]
): NormalizedFrontstageBlockCatalogEntry | null {
  if (!block) {
    return null;
  }

  return (
    catalogItems.find(
      (item) =>
        block.catalog.providerCode === item.providerCode &&
        block.catalog.installationId === item.installationId &&
        block.contribution.pluginId === item.pluginId &&
        block.contribution.pluginVersion === item.pluginVersion &&
        block.contribution.code === item.contributionCode
    ) ?? null
  );
}

export const FrontStagePage: FC<FrontStagePageProps> = ({
  workspaceId,
  pageId,
  onNavigatePage,
  initialPageTree,
  isPageTreeLoading,
  hasPageTreeLoadError,
  onRetryLoadPageTree,
  pageContent,
  isPageContentLoading,
  hasPageContentLoadError,
  onRetryLoadPageContent,
  isPageTreeMutating,
  pageTreeMutationError,
  onCreateGroupNode,
  onCreatePageNode,
  onRenamePageNode,
  onMovePageNode,
  onDeletePageNode
}) => {
  const csrfToken = useAuthStore((state) => state.csrfToken);
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [operationStatus, setOperationStatus] =
    useState<PageTreeOperationStatus>('idle');
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isBlockCodeEditorOpen, setIsBlockCodeEditorOpen] = useState(false);
  const [isBlockConfigurationOpen, setIsBlockConfigurationOpen] =
    useState(false);
  const [isJsBlockTrialPanelOpen, setIsJsBlockTrialPanelOpen] = useState(false);
  const [jsBlockTrialContextSnapshot, setJsBlockTrialContextSnapshot] =
    useState<Record<string, unknown>>({});
  const [jsBlockTrialLimits, setJsBlockTrialLimits] =
    useState<RestrictedBlockLoaderLimits>(DEFAULT_JS_BLOCK_TRIAL_LIMITS);
  const [savedPageContent, setSavedPageContent] =
    useState<FrontstagePageContent | null>(null);
  const [isBlockSavePending, setIsBlockSavePending] = useState(false);
  const [blockSaveError, setBlockSaveError] = useState<string | null>(null);
  const [isAddBlockPickerOpen, setIsAddBlockPickerOpen] = useState(false);
  const [pageTree, setPageTree] = useState<FrontStageTreeNode[]>(() =>
    normalizePageTree(initialPageTree ?? [])
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    () =>
      resolveSelectedPageId({
        pageId,
        pageTree: normalizePageTree(initialPageTree ?? [])
      }).selectedPageId
  );
  const { Sider, Content } = Layout;
  const blockCatalog = useFrontstageBlockCatalog();
  const pageContentSave = useFrontstagePageContentSave({
    workspaceId,
    pageId: selectedPageId
  });
  const jsBlockDataEffectHandler = useMemo(
    () => createFrontstageJsBlockDataEffectHandler({ csrfToken }),
    [csrfToken]
  );
  const displayedPageContent = savedPageContent ?? pageContent;
  const hasLoadedSelectedPageContent = Boolean(
    selectedPageId && displayedPageContent?.page.id === selectedPageId
  );
  const activePageContent = hasLoadedSelectedPageContent
    ? displayedPageContent
    : undefined;
  const displayedPageDocument = useMemo(
    () =>
      activePageContent
        ? createFrontstagePageDocument(activePageContent)
        : null,
    [activePageContent]
  );
  const activePageRenderPlan = useMemo(
    () =>
      displayedPageDocument
        ? createFrontstagePageRenderPlan(displayedPageDocument)
        : null,
    [displayedPageDocument]
  );
  const pageCanvasRuntimeSources = useFrontstagePageCanvasRuntimeSources({
    workspaceId,
    renderPlan: activePageRenderPlan
  });
  const pageCanvasRuntimeRunPlanState = useMemo(() => {
    const sourceState = pageCanvasRuntimeSources.sourceState;
    if (!sourceState) {
      return null;
    }

    return createFrontstagePageCanvasRuntimeRunPlanState({
      sourceState,
      catalogEntries: blockCatalog.items,
      contextSnapshot: (source) => ({
        workspaceId,
        pageId: activePageContent?.page.id ?? sourceState.pageId,
        pageTitle: activePageContent?.page.title ?? null,
        blockId: source.blockId,
        codeRef: source.codeRef,
        props: source.block.props
      }),
      limits: jsBlockTrialLimits
    });
  }, [
    activePageContent?.page.id,
    activePageContent?.page.title,
    blockCatalog.items,
    jsBlockTrialLimits,
    pageCanvasRuntimeSources.sourceState,
    workspaceId
  ]);
  const pageCanvasRuntimeSessions = useFrontstagePageCanvasRuntimeSessions({
    runtimeRunPlanState: pageCanvasRuntimeRunPlanState,
    dataEffectHandler: jsBlockDataEffectHandler
  });
  const blockCompositionState = useMemo(
    () =>
      displayedPageDocument
        ? createFrontstageBlockCompositionState(
            displayedPageDocument,
            selectedBlockId
          )
        : null,
    [displayedPageDocument, selectedBlockId]
  );
  const isOperationPending =
    operationStatus === 'pending' || Boolean(isPageTreeMutating);
  const hasOperationError =
    operationStatus === 'error' || Boolean(pageTreeMutationError);
  const isPageContentSavePending =
    isBlockSavePending || pageContentSave.saving || pageContentSave.isPending;
  const pageContentSaveError =
    blockSaveError ??
    (pageContentSave.error
      ? toDisplayErrorMessage(pageContentSave.error)
      : null);
  const canAddBlock =
    Boolean(activePageContent) &&
    !isPageContentLoading &&
    !hasPageContentLoadError &&
    !isPageContentSavePending;
  const operationStatusText = isOperationPending
    ? '保存中'
    : hasOperationError
      ? '操作失败'
      : '页面树已同步';

  const canEnterDesignMode = useMemo(() => {
    return (
      actor?.effective_display_role === 'root' ||
      Boolean(me?.permissions.includes(DESIGN_MODE_PERMISSION))
    );
  }, [actor, me]);
  const selectedBlockIndex =
    blockCompositionState?.selectedBlockId === selectedBlockId
      ? blockCompositionState.document.blocks.findIndex(
          (block) => block.id === selectedBlockId
        )
      : -1;
  const selectedBlock =
    selectedBlockIndex >= 0
      ? blockCompositionState?.document.blocks[selectedBlockIndex]
      : null;
  const selectedBlockLayoutWidth = getNumericLayoutValue(
    selectedBlock?.layout.width
  );
  const selectedBlockLayoutHeight = getNumericLayoutValue(
    selectedBlock?.layout.height
  );
  const canShowSelectedBlockActions = Boolean(
    canEnterDesignMode &&
    isDesignMode &&
    activePageContent &&
    blockCompositionState &&
    selectedBlock
  );
  const canRunSelectedBlockAction =
    canShowSelectedBlockActions &&
    !isPageContentLoading &&
    !hasPageContentLoadError &&
    !isPageContentSavePending;
  const canMoveSelectedBlockUp =
    canRunSelectedBlockAction && selectedBlockIndex > 0;
  const canMoveSelectedBlockDown =
    canRunSelectedBlockAction &&
    Boolean(
      blockCompositionState &&
      selectedBlockIndex >= 0 &&
      selectedBlockIndex < blockCompositionState.document.blocks.length - 1
    );
  const selectedBlockCode = useFrontstageBlockCode({
    workspaceId: canShowSelectedBlockActions ? workspaceId : null,
    pageId: canShowSelectedBlockActions ? selectedPageId : null,
    codeRef: canShowSelectedBlockActions ? selectedBlock?.codeRef : null
  });
  const matchingJsBlockCatalogEntry = useMemo(
    () =>
      findMatchingFrontstageBlockCatalogEntry(
        selectedBlock,
        blockCatalog.items
      ),
    [blockCatalog.items, selectedBlock]
  );
  const defaultJsBlockTrialContextSnapshot = useMemo(
    () => ({
      workspaceId,
      pageId: activePageContent?.page.id ?? selectedPageId,
      pageTitle: activePageContent?.page.title ?? null,
      blockId: selectedBlock?.id ?? null,
      blockCodeRef: selectedBlock?.codeRef ?? null,
      props: selectedBlock?.props ?? {}
    }),
    [activePageContent, selectedBlock, selectedPageId, workspaceId]
  );
  const selectedBlockConfigurationModel = useMemo(
    () =>
      selectedBlock
        ? createFrontstageBlockConfigurationModel({
            block: selectedBlock,
            catalogEntry: matchingJsBlockCatalogEntry,
            limits: jsBlockTrialLimits
          })
        : null,
    [jsBlockTrialLimits, matchingJsBlockCatalogEntry, selectedBlock]
  );

  useEffect(() => {
    if (!initialPageTree) {
      return;
    }

    setPageTree(normalizePageTree(initialPageTree));
    setOperationStatus('idle');
  }, [initialPageTree]);

  useEffect(() => {
    const resolution = resolveSelectedPageId({
      currentSelectedPageId: selectedPageId,
      pageId,
      pageTree
    });

    if (selectedPageId !== resolution.selectedPageId) {
      setSelectedPageId(resolution.selectedPageId);
    }

    if (resolution.shouldNavigate) {
      onNavigatePage?.(resolution.navigationTarget);
    }
  }, [onNavigatePage, pageId, pageTree, selectedPageId]);

  useEffect(() => {
    setSavedPageContent(null);
    setSelectedBlockId(null);
    setIsBlockCodeEditorOpen(false);
    setIsBlockConfigurationOpen(false);
    setIsJsBlockTrialPanelOpen(false);
    setIsAddBlockPickerOpen(false);
    setBlockSaveError(null);
  }, [selectedPageId]);

  useEffect(() => {
    setSavedPageContent(null);
    setSelectedBlockId((currentBlockId) => {
      if (!currentBlockId || !pageContent) {
        setIsBlockCodeEditorOpen(false);
        setIsBlockConfigurationOpen(false);
        setIsJsBlockTrialPanelOpen(false);
        setIsAddBlockPickerOpen(false);
        return null;
      }

      const document = createFrontstagePageDocument(pageContent);
      const hasCurrentBlock = document.blocks.some(
        (block) => block.id === currentBlockId
      );
      if (!hasCurrentBlock) {
        setIsBlockCodeEditorOpen(false);
        setIsBlockConfigurationOpen(false);
        setIsJsBlockTrialPanelOpen(false);
      }

      return hasCurrentBlock ? currentBlockId : null;
    });
  }, [pageContent]);

  useEffect(() => {
    if (!canShowSelectedBlockActions) {
      setIsBlockCodeEditorOpen(false);
      setIsBlockConfigurationOpen(false);
      setIsJsBlockTrialPanelOpen(false);
    }
  }, [canShowSelectedBlockActions]);

  useEffect(() => {
    if (!canEnterDesignMode || !isDesignMode) {
      setIsAddBlockPickerOpen(false);
    }
  }, [canEnterDesignMode, isDesignMode]);

  useEffect(() => {
    setJsBlockTrialContextSnapshot(defaultJsBlockTrialContextSnapshot);
    setJsBlockTrialLimits(DEFAULT_JS_BLOCK_TRIAL_LIMITS);
  }, [defaultJsBlockTrialContextSnapshot]);

  const selectedPageDisplayTitle = getPageDisplayTitle(
    pageTree,
    selectedPageId
  );
  const selectedPageLabel = selectedPageDisplayTitle
    ? selectedPageDisplayTitle
    : selectedPageId
      ? `页面 ${selectedPageId}`
      : null;
  const pageLabel = selectedPageLabel
    ? selectedPageLabel
    : '未选择 pageId（将使用默认首页）';
  const pageNodeTitle = selectedPageLabel
    ? `当前页面：${selectedPageLabel}`
    : '当前未选中页面';

  if (initialPageTree === undefined && isPageTreeLoading) {
    return (
      <div
        style={{
          width: '100%',
          padding: '24px 0',
          maxWidth: 1240,
          margin: '0 auto'
        }}
      >
        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 12 }}
        >
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              前台
            </Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>
              页面树加载中…
            </Typography.Title>
          </Space>
        </Flex>
        <Divider style={{ margin: '0 0 16px' }} />
        <Empty
          description={
            <Typography.Text>正在加载页面树，请稍后...</Typography.Text>
          }
        />
      </div>
    );
  }

  if (initialPageTree === undefined && hasPageTreeLoadError) {
    return (
      <div
        style={{
          width: '100%',
          padding: '24px 0',
          maxWidth: 1240,
          margin: '0 auto'
        }}
      >
        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 12 }}
        >
          <Space direction="vertical" size={0}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              前台
            </Typography.Text>
            <Typography.Title level={4} style={{ margin: 0 }}>
              页面树加载失败
            </Typography.Title>
          </Space>
        </Flex>
        <Divider style={{ margin: '0 0 16px' }} />
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Typography.Text>
              页面树加载失败，请检查网络后重试。点击“重试”按钮重新发起加载。
            </Typography.Text>
          }
        >
          <Button type="primary" onClick={onRetryLoadPageTree}>
            重试
          </Button>
        </Empty>
      </div>
    );
  }

  const renderPageTreeErrorBanner = hasPageTreeLoadError ? (
    <Alert
      style={{ marginBottom: 12 }}
      message="页面树加载失败"
      description="页面树加载失败，当前页面树仍可查看；请点击“重试”恢复最新数据。"
      type="error"
      showIcon
      action={
        onRetryLoadPageTree ? (
          <Button size="small" onClick={() => onRetryLoadPageTree()}>
            重试
          </Button>
        ) : null
      }
    />
  ) : null;

  const runPageTreeOperation = async <T,>(
    operation: () => Promise<T | void>
  ): Promise<T | null> => {
    setOperationStatus('pending');

    try {
      const result = await operation();
      setOperationStatus('idle');
      return result ?? null;
    } catch {
      setOperationStatus('error');
      return null;
    }
  };

  const handleAddGroup = () => {
    const input = {
      title: `分组 ${getNextGroupTitleIndex(pageTree)}`,
      parentId: null,
      rank: getNodeAppendRank(pageTree, null)
    };

    void runPageTreeOperation(async () => {
      await onCreateGroupNode?.(input);
    });
  };

  const handleAddPage = () => {
    const input = {
      title: `页面 新建 ${getNextPageTitleIndex(pageTree)}`,
      parentId: null,
      rank: getNodeAppendRank(pageTree, null)
    };

    void runPageTreeOperation(async () => {
      const createdNode = await onCreatePageNode?.(input);
      if (createdNode?.kind === 'page') {
        setSelectedPageId(createdNode.id);
        onNavigatePage?.(createdNode.id);
      }
    });
  };

  const handleAddPageInGroup = (groupId: string) => {
    const input = {
      title: `页面 新建 ${getNextPageTitleIndex(pageTree)}`,
      parentId: groupId,
      rank: getNodeAppendRank(pageTree, groupId)
    };

    void runPageTreeOperation(async () => {
      const createdNode = await onCreatePageNode?.(input);
      if (createdNode?.kind === 'page') {
        setSelectedPageId(createdNode.id);
        onNavigatePage?.(createdNode.id);
      }
    });
  };

  const handleDeleteNode = (nodeId: string) => {
    const node = findNodeById(pageTree, nodeId);
    if (!node) {
      return;
    }

    const confirmed = window.confirm(getDeleteConfirmMessage(node));
    if (!confirmed) {
      return;
    }

    void runPageTreeOperation(async () => {
      await onDeletePageNode?.(nodeId);
      const next = removeNodeFromTree(pageTree, nodeId);
      const nextResolution = resolveSelectedPageId({
        pageId: selectedPageId ?? undefined,
        pageTree: next
      });
      const nextSelectedPageId = nextResolution.selectedPageId;

      setSelectedPageId(nextSelectedPageId);
      if (nextResolution.shouldNavigate) {
        onNavigatePage?.(nextResolution.navigationTarget);
      }
    });
  };

  const handleRenameNode = (nodeId: string, currentTitle: string | null) => {
    const nextTitle = window.prompt('重命名节点', currentTitle ?? '');
    if (nextTitle === null) {
      return;
    }

    void runPageTreeOperation(async () => {
      await onRenamePageNode?.(nodeId, { title: nextTitle });
    });
  };

  const handleMoveNode = (nodeId: string, direction: -1 | 1) => {
    const siblingContext = findSiblingContext(pageTree, nodeId);
    if (!siblingContext) {
      return;
    }

    const targetIndex = siblingContext.index + direction;
    if (targetIndex < 0 || targetIndex >= siblingContext.siblings.length) {
      return;
    }

    void runPageTreeOperation(async () => {
      await onMovePageNode?.(nodeId, {
        parentId: siblingContext.parentId,
        rank: rankForMoveTarget(targetIndex, direction)
      });
    });
  };

  const handleSelectPage = (nodeId: string) => {
    setSelectedPageId((current) => {
      if (current === nodeId) {
        return current;
      }

      onNavigatePage?.(nodeId);
      return nodeId;
    });
  };

  const saveBlockComposition = async (
    sourceContent: FrontstagePageContent,
    compositionState: FrontstageBlockCompositionState
  ) => {
    setIsBlockSavePending(true);
    setBlockSaveError(null);
    pageContentSave.clearError();

    try {
      const input = createFrontstagePageDocumentSaveInput(
        sourceContent,
        compositionState.document
      );
      const nextContent = await pageContentSave.save(input);

      setSavedPageContent(nextContent);
      setSelectedBlockId(compositionState.selectedBlockId);
    } catch (error) {
      setBlockSaveError(toDisplayErrorMessage(error));
    } finally {
      setIsBlockSavePending(false);
    }
  };

  const handleAddBlock = () => {
    if (!canAddBlock) {
      return;
    }

    setBlockSaveError(null);
    pageContentSave.clearError();
    setIsAddBlockPickerOpen(true);
  };

  const handleSelectBlockCatalogEntry = async (
    entry: NormalizedFrontstageBlockCatalogEntry,
    templateId: FrontstageBuiltInJsBlockTemplateId
  ) => {
    const sourceContent = activePageContent;
    if (!canAddBlock || !sourceContent || !blockCompositionState) {
      return;
    }

    const nextBlockInput = createCatalogBlockInput(
      entry,
      blockCompositionState.document.blocks.length
    );
    const nextCompositionState = appendFrontstageBlock(
      blockCompositionState,
      nextBlockInput
    );

    setIsBlockSavePending(true);
    setBlockSaveError(null);
    pageContentSave.clearError();

    try {
      const input = createFrontstagePageDocumentSaveInput(
        sourceContent,
        nextCompositionState.document
      );
      const nextContent = await pageContentSave.save(input);
      const createdBlock =
        nextCompositionState.document.blocks.find(
          (block) => block.id === nextCompositionState.selectedBlockId
        ) ??
        nextCompositionState.document.blocks[
          nextCompositionState.document.blocks.length - 1
        ];
      if (!createdBlock) {
        throw new Error('created block is missing');
      }

      const codeRef = createdBlock.codeRef;
      const blockId = createdBlock.id;

      await saveFrontstageBlockCode(
        workspaceId,
        selectedPageId ?? sourceContent.page.id,
        {
          codeRef,
          code: createFrontstageBuiltInJsBlockTemplateCode({
            templateId,
            blockId,
            codeRef,
            contributionCode: entry.contributionCode
          })
        },
        requireCsrfToken(csrfToken)
      );

      setSavedPageContent(nextContent);
      setSelectedBlockId(nextCompositionState.selectedBlockId);
      setIsAddBlockPickerOpen(false);
    } catch (error) {
      setBlockSaveError(toDisplayErrorMessage(error));
    } finally {
      setIsBlockSavePending(false);
    }
  };

  const handleDeleteSelectedBlock = () => {
    const sourceContent = activePageContent;
    if (
      !canRunSelectedBlockAction ||
      !sourceContent ||
      !blockCompositionState ||
      !selectedBlock
    ) {
      return;
    }

    const nextCompositionState = removeFrontstageBlock(
      blockCompositionState,
      selectedBlock.id
    );
    const nextSelectedBlockId =
      nextCompositionState.selectedBlockId ??
      nextCompositionState.document.blocks[selectedBlockIndex]?.id ??
      nextCompositionState.document.blocks[selectedBlockIndex - 1]?.id ??
      null;

    void saveBlockComposition(sourceContent, {
      ...nextCompositionState,
      selectedBlockId: nextSelectedBlockId
    });
  };

  const handleMoveSelectedBlock = (direction: -1 | 1) => {
    const sourceContent = activePageContent;
    if (
      !canRunSelectedBlockAction ||
      !sourceContent ||
      !blockCompositionState ||
      !selectedBlock
    ) {
      return;
    }

    if (
      (direction < 0 && selectedBlockIndex <= 0) ||
      (direction > 0 &&
        selectedBlockIndex >= blockCompositionState.document.blocks.length - 1)
    ) {
      return;
    }

    const nextIndex = selectedBlockIndex + direction;
    const nextCompositionState = moveFrontstageBlock(
      blockCompositionState,
      selectedBlock.id,
      nextIndex
    );

    void saveBlockComposition(sourceContent, nextCompositionState);
  };

  const handleSelectedBlockLayoutDimensionChange = (
    dimension: 'width' | 'height',
    value: number | string | null
  ) => {
    const nextValue = normalizeLayoutDimension(value);
    const sourceContent = activePageContent;
    if (
      nextValue === null ||
      !canRunSelectedBlockAction ||
      !sourceContent ||
      !blockCompositionState ||
      !selectedBlock
    ) {
      return;
    }

    const nextCompositionState = updateFrontstageBlockLayout(
      blockCompositionState,
      selectedBlock.id,
      {
        [dimension]: nextValue
      }
    );

    void saveBlockComposition(sourceContent, nextCompositionState);
  };

  const handleOpenJsBlockTrialPanel = () => {
    if (!canRunSelectedBlockAction) {
      return;
    }

    setJsBlockTrialContextSnapshot(defaultJsBlockTrialContextSnapshot);
    setJsBlockTrialLimits(DEFAULT_JS_BLOCK_TRIAL_LIMITS);
    setIsJsBlockTrialPanelOpen(true);
  };

  const renderTreeNode = (
    node: FrontStageTreeNode,
    level: number = 0,
    parentNodes: FrontStageTreeNode[] = pageTree
  ) => {
    const isPageNode = node.kind === 'page';
    const isSelected = selectedPageId === node.id;
    const canAddPageToGroup = node.kind === 'group' && level === 0;
    const { canMoveUp, canMoveDown } = canMoveNode(parentNodes, node.id);
    const rowStyle = {
      padding: '8px',
      borderRadius: 6,
      marginTop: 4,
      marginBottom: 4,
      marginLeft: `${level * 16}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      border: isSelected ? '1px solid #91caff' : '1px solid transparent',
      background: isSelected ? '#e6f7ff' : 'transparent',
      cursor: isPageNode ? 'pointer' : 'default'
    } as const;
    const buttonStyle = {
      marginLeft: 8,
      marginRight: 8
    } as const;

    const childNodes = node.children ?? [];

    return (
      <li
        key={node.id}
        data-testid={`frontstage-tree-node-${node.kind}-${node.title || node.id}`}
        style={rowStyle}
        onClick={() => {
          if (isPageNode) {
            handleSelectPage(node.id);
          }
        }}
        role={isPageNode ? 'button' : undefined}
        tabIndex={isPageNode ? 0 : -1}
        onKeyDown={(event) => {
          if (!isPageNode) {
            return;
          }

          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSelectPage(node.id);
          }
        }}
      >
        <div
          style={{
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Typography.Text style={{ fontSize: 12 }}>
            {node.title
              ? node.title
              : node.kind === 'group'
                ? '未命名分组'
                : '未命名页面'}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 11, display: 'block' }}
          >
            {node.kind === 'group' ? '分组节点' : '页面节点'}
          </Typography.Text>
        </div>
        {canEnterDesignMode && isDesignMode ? (
          <>
            <Button
              size="small"
              disabled={isOperationPending}
              onClick={(event) => {
                event.stopPropagation();
                handleRenameNode(node.id, node.title);
              }}
            >
              重命名
            </Button>
            {canAddPageToGroup ? (
              <Button
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  handleAddPageInGroup(node.id);
                }}
                disabled={isOperationPending}
              >
                组内新增页面
              </Button>
            ) : null}
            <Button
              size="small"
              disabled={!canMoveUp || isOperationPending}
              style={buttonStyle}
              onClick={(event) => {
                event.stopPropagation();
                handleMoveNode(node.id, -1);
              }}
            >
              上移
            </Button>
            <Button
              size="small"
              disabled={!canMoveDown || isOperationPending}
              style={buttonStyle}
              onClick={(event) => {
                event.stopPropagation();
                handleMoveNode(node.id, 1);
              }}
            >
              下移
            </Button>
            <Button
              style={buttonStyle}
              size="small"
              danger
              disabled={isOperationPending}
              onClick={(event) => {
                event.stopPropagation();
                handleDeleteNode(node.id);
              }}
            >
              删除
            </Button>
          </>
        ) : null}
        {childNodes.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, paddingLeft: 16 }}>
            {childNodes.map((childNode) =>
              renderTreeNode(childNode, level + 1, childNodes)
            )}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div
      style={{
        width: '100%',
        padding: '24px 0',
        maxWidth: 1240,
        margin: '0 auto'
      }}
    >
      <Flex
        justify="space-between"
        align="center"
        wrap
        gap={12}
        style={{ marginBottom: 12 }}
      >
        <Space direction="vertical" size={0}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            前台
          </Typography.Text>
          <Typography.Title level={4} style={{ margin: 0 }}>
            空态占位 · {pageLabel}
          </Typography.Title>
          <Typography.Text type="secondary" style={{ marginTop: 4 }}>
            Workspace：{workspaceId}
          </Typography.Text>
        </Space>

        {canEnterDesignMode ? (
          <Space align="center" size={8} direction="vertical">
            <Button
              type={isDesignMode ? 'default' : 'primary'}
              onClick={() => {
                if (isDesignMode) {
                  setSelectedBlockId(null);
                  setIsBlockCodeEditorOpen(false);
                  setIsBlockConfigurationOpen(false);
                  setIsJsBlockTrialPanelOpen(false);
                }

                setIsDesignMode((current) => !current);
              }}
            >
              {isDesignMode ? '退出设计模式' : '进入设计模式'}
            </Button>
          </Space>
        ) : null}
      </Flex>

      <Divider style={{ margin: '0 0 16px' }} />
      {renderPageTreeErrorBanner}

      {canEnterDesignMode && isDesignMode ? (
        <Space wrap size={8} style={{ marginBottom: 12 }}>
          <Button size="small" onClick={handleAddBlock} disabled={!canAddBlock}>
            新增区块
          </Button>
          <Button size="small">页面管理</Button>
          <Button size="small">当前页面设置</Button>
        </Space>
      ) : null}
      {canEnterDesignMode && isDesignMode && isPageContentSavePending ? (
        <Typography.Text
          type="secondary"
          style={{ marginBottom: 12, display: 'block' }}
        >
          区块保存中
        </Typography.Text>
      ) : null}
      {canEnterDesignMode && isDesignMode && pageContentSaveError ? (
        <Alert
          style={{ marginBottom: 12 }}
          message="区块保存失败"
          description={pageContentSaveError}
          type="error"
          showIcon
        />
      ) : null}
      {canEnterDesignMode && isDesignMode ? (
        <Typography.Text
          type={hasOperationError ? 'danger' : 'secondary'}
          style={{ marginBottom: 12, display: 'block' }}
        >
          {operationStatusText}
        </Typography.Text>
      ) : null}
      <Layout style={{ background: 'transparent' }}>
        <Sider
          width={280}
          theme="light"
          style={{
            background: 'white',
            borderRight: '1px solid #f0f0f0',
            padding: 12
          }}
        >
          <Typography.Title level={5} style={{ margin: 0 }}>
            页面管理
          </Typography.Title>
          <Divider style={{ margin: '12px 0' }} />
          <Typography.Text
            type="secondary"
            style={{ marginBottom: 8, display: 'block' }}
          >
            {pageNodeTitle}
          </Typography.Text>
          {canEnterDesignMode && isDesignMode ? (
            <Space size={8} wrap style={{ marginBottom: 12 }}>
              <Button
                size="small"
                onClick={handleAddGroup}
                disabled={isOperationPending}
              >
                新建分组
              </Button>
              <Button
                size="small"
                onClick={handleAddPage}
                disabled={isOperationPending}
              >
                新建页面
              </Button>
            </Space>
          ) : null}
          {pageTree.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {pageTree.map((node) => renderTreeNode(node, 0, pageTree))}
            </ul>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              styles={{ image: { height: 48 } }}
              description={
                <Typography.Text type="secondary">
                  当前工作区页面树为空。请在设计态创建页面后将显示树结构。
                </Typography.Text>
              }
            />
          )}
        </Sider>
        <Content style={{ padding: 16, background: 'white' }}>
          <PageCanvas
            content={
              selectedPageLabel && hasLoadedSelectedPageContent
                ? displayedPageContent
                : undefined
            }
            isLoading={Boolean(selectedPageLabel && isPageContentLoading)}
            hasError={Boolean(selectedPageLabel && hasPageContentLoadError)}
            selectedBlockId={
              canEnterDesignMode && isDesignMode ? selectedBlockId : null
            }
            onSelectBlock={
              canEnterDesignMode && isDesignMode
                ? (blockId) => {
                    setSelectedBlockId((currentBlockId) =>
                      currentBlockId === blockId ? null : blockId
                    );
                  }
                : undefined
            }
            onRetry={onRetryLoadPageContent}
            runtimeSourceState={pageCanvasRuntimeSources.sourceState}
            runtimeRunPlanState={pageCanvasRuntimeRunPlanState}
            runtimeSessionEntries={pageCanvasRuntimeSessions.entries}
          />
          {canShowSelectedBlockActions ? (
            <div
              data-testid="frontstage-selected-block-actions"
              style={{
                marginTop: 12,
                padding: '10px 12px',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                background: '#fafafa'
              }}
            >
              <Flex justify="space-between" align="center" wrap gap={12}>
                <Space direction="vertical" size={2}>
                  <Typography.Text strong>区块编排</Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    当前选中区块：{selectedBlock?.id}
                  </Typography.Text>
                </Space>
                <Space size={8} wrap>
                  <Space size={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      宽度
                    </Typography.Text>
                    <InputNumber
                      aria-label="区块宽度"
                      size="small"
                      min={1}
                      max={24}
                      precision={0}
                      value={selectedBlockLayoutWidth}
                      disabled={!canRunSelectedBlockAction}
                      onChange={(value) =>
                        handleSelectedBlockLayoutDimensionChange('width', value)
                      }
                      style={{ width: 72 }}
                    />
                  </Space>
                  <Space size={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      高度
                    </Typography.Text>
                    <InputNumber
                      aria-label="区块高度"
                      size="small"
                      min={1}
                      max={24}
                      precision={0}
                      value={selectedBlockLayoutHeight}
                      disabled={!canRunSelectedBlockAction}
                      onChange={(value) =>
                        handleSelectedBlockLayoutDimensionChange(
                          'height',
                          value
                        )
                      }
                      style={{ width: 72 }}
                    />
                  </Space>
                  <Button
                    size="small"
                    disabled={!canMoveSelectedBlockUp}
                    onClick={() => handleMoveSelectedBlock(-1)}
                  >
                    上移区块
                  </Button>
                  <Button
                    size="small"
                    disabled={!canMoveSelectedBlockDown}
                    onClick={() => handleMoveSelectedBlock(1)}
                  >
                    下移区块
                  </Button>
                  <Button
                    size="small"
                    disabled={!canRunSelectedBlockAction}
                    onClick={handleOpenJsBlockTrialPanel}
                  >
                    JS Block 试运行
                  </Button>
                  <Button
                    size="small"
                    disabled={!canRunSelectedBlockAction}
                    onClick={() => setIsBlockConfigurationOpen(true)}
                  >
                    配置区块
                  </Button>
                  <Button
                    size="small"
                    disabled={!canRunSelectedBlockAction}
                    onClick={() => setIsBlockCodeEditorOpen(true)}
                  >
                    编辑代码
                  </Button>
                  <Button
                    size="small"
                    danger
                    disabled={!canRunSelectedBlockAction}
                    onClick={handleDeleteSelectedBlock}
                  >
                    删除区块
                  </Button>
                </Space>
              </Flex>
            </div>
          ) : null}
          {isJsBlockTrialPanelOpen && canShowSelectedBlockActions ? (
            <div
              aria-label="JS Block 试运行面板"
              role="region"
              style={{
                marginTop: 12,
                padding: '12px',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                background: '#fff'
              }}
            >
              <Flex justify="space-between" align="center" gap={12}>
                <Typography.Text strong>试运行计划</Typography.Text>
                <Button
                  size="small"
                  onClick={() => setIsJsBlockTrialPanelOpen(false)}
                >
                  关闭
                </Button>
              </Flex>
              <div style={{ marginTop: 12 }}>
                <JsBlockTrialPanel
                  block={selectedBlock}
                  catalogEntry={matchingJsBlockCatalogEntry}
                  code={selectedBlockCode.draft}
                  contextSnapshot={jsBlockTrialContextSnapshot}
                  dataEffectHandler={jsBlockDataEffectHandler}
                  limits={jsBlockTrialLimits}
                  onCodeChange={selectedBlockCode.setDraft}
                  onContextSnapshotChange={setJsBlockTrialContextSnapshot}
                  onLimitsChange={setJsBlockTrialLimits}
                />
              </div>
            </div>
          ) : null}
          {canEnterDesignMode && isDesignMode ? (
            <Typography.Paragraph
              type="secondary"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              设计模式已开启，后续在此承载区块编排与页面树管理能力。
            </Typography.Paragraph>
          ) : null}
        </Content>
      </Layout>
      {canEnterDesignMode && isDesignMode ? (
        <AddBlockCatalogPickerDrawer
          open={isAddBlockPickerOpen}
          items={blockCatalog.items}
          loading={blockCatalog.loading}
          error={blockCatalog.error}
          saving={isPageContentSavePending}
          onSelect={(entry, templateId) => {
            void handleSelectBlockCatalogEntry(entry, templateId);
          }}
          onClose={() => setIsAddBlockPickerOpen(false)}
        />
      ) : null}
      <BlockCodeEditorDrawer
        open={isBlockCodeEditorOpen && canShowSelectedBlockActions}
        onClose={() => setIsBlockCodeEditorOpen(false)}
        workspaceId={workspaceId}
        pageId={selectedPageId}
        block={canShowSelectedBlockActions ? selectedBlock : null}
      />
      <BlockConfigurationDrawer
        open={isBlockConfigurationOpen && canShowSelectedBlockActions}
        onClose={() => setIsBlockConfigurationOpen(false)}
        model={
          canShowSelectedBlockActions ? selectedBlockConfigurationModel : null
        }
      />
    </div>
  );
};
