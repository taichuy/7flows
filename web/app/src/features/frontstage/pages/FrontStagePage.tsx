import { Alert, Button, Divider, Empty, Flex, Layout, Space, Typography } from 'antd';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { useAuthStore } from '../../../state/auth-store';
import {
  canMoveNode,
  createGroupNode,
  createPageNode,
  findNodeById,
  getDeleteConfirmMessage,
  getDraftStatus,
  getNextGroupTitleIndex,
  getNextNodeId,
  getNextPageTitleIndex,
  getPageDisplayTitle,
  insertPageIntoGroup,
  moveNodeInTree,
  normalizePageTree,
  removeNodeFromTree,
  renameNodeInTree,
  resolveSelectedPageId
} from '../lib/page-tree';
import type { FrontStageTreeNode } from '../lib/page-tree';

const DESIGN_MODE_PERMISSION = 'frontstage.page.design';

type FrontStagePageProps = {
  workspaceId: string;
  pageId?: string;
  onNavigatePage?: (pageId?: string) => void;
  initialPageTree?: FrontStageTreeNode[];
  isPageTreeLoading?: boolean;
  hasPageTreeLoadError?: boolean;
  onRetryLoadPageTree?: () => void;
};

export const FrontStagePage: FC<FrontStagePageProps> = ({
  workspaceId,
  pageId,
  onNavigatePage,
  initialPageTree,
  isPageTreeLoading,
  hasPageTreeLoadError,
  onRetryLoadPageTree
}) => {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [hasPendingDraftChanges, setHasPendingDraftChanges] = useState(false);
  const [pageTree, setPageTree] = useState<FrontStageTreeNode[]>(() =>
    normalizePageTree(initialPageTree ?? [])
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(() =>
    resolveSelectedPageId({
      pageId,
      pageTree: normalizePageTree(initialPageTree ?? [])
    }).selectedPageId
  );
  const { Sider, Content } = Layout;
  const draftStatus = getDraftStatus(hasPendingDraftChanges);

  const canEnterDesignMode = useMemo(() => {
    return actor?.effective_display_role === 'root' || Boolean(me?.permissions.includes(DESIGN_MODE_PERMISSION));
  }, [actor, me]);

  useEffect(() => {
    if (!initialPageTree) {
      return;
    }

    setPageTree(normalizePageTree(initialPageTree));
    setHasPendingDraftChanges(false);
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

  const selectedPageDisplayTitle = getPageDisplayTitle(pageTree, selectedPageId);
  const selectedPageLabel = selectedPageDisplayTitle
    ? selectedPageDisplayTitle
    : selectedPageId
      ? `页面 ${selectedPageId}`
      : null;
  const pageLabel = selectedPageLabel ? selectedPageLabel : '未选择 pageId（将使用默认首页）';
  const pageNodeTitle = selectedPageLabel ? `当前页面：${selectedPageLabel}` : '当前未选中页面';

  if (initialPageTree === undefined && isPageTreeLoading) {
    return (
      <div style={{ width: '100%', padding: '24px 0', maxWidth: 1240, margin: '0 auto' }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
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
        <Empty description={<Typography.Text>正在加载页面树，请稍后...</Typography.Text>} />
      </div>
    );
  }

  if (initialPageTree === undefined && hasPageTreeLoadError) {
    return (
      <div style={{ width: '100%', padding: '24px 0', maxWidth: 1240, margin: '0 auto' }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
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

  const handleAddGroup = () => {
    setPageTree((prev) => [
      ...prev,
      createGroupNode(getNextNodeId(prev), getNextGroupTitleIndex(prev))
    ]);
    setHasPendingDraftChanges(true);
  };

  const handleAddPage = () => {
    let nextPageNodeId: string | null = null;

    setPageTree((prev) => {
      const pageNode = createPageNode(
        getNextNodeId(prev),
        getNextPageTitleIndex(prev)
      );
      nextPageNodeId = pageNode.id;
      return [...prev, pageNode];
    });

    if (nextPageNodeId) {
      setSelectedPageId(nextPageNodeId);
      onNavigatePage?.(nextPageNodeId);
    }
    setHasPendingDraftChanges(true);
  };

  const handleAddPageInGroup = (groupId: string) => {
    let nextPageNodeId: string | null = null;

    setPageTree((prev) => {
      const pageNode = createPageNode(
        getNextNodeId(prev),
        getNextPageTitleIndex(prev)
      );
      nextPageNodeId = pageNode.id;
      return insertPageIntoGroup(prev, groupId, pageNode);
    });

    if (nextPageNodeId) {
      setSelectedPageId(nextPageNodeId);
      onNavigatePage?.(nextPageNodeId);
    }
    setHasPendingDraftChanges(true);
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

    setPageTree((prev) => {
      const next = removeNodeFromTree(prev, nodeId);
      const nextResolution = resolveSelectedPageId({
        pageId: selectedPageId ?? undefined,
        pageTree: next
      });
      const nextSelectedPageId = nextResolution.selectedPageId;

      setSelectedPageId(nextSelectedPageId);
      if (nextResolution.shouldNavigate) {
        onNavigatePage?.(nextResolution.navigationTarget);
      }

      return next;
    });

    setHasPendingDraftChanges(true);
  };

  const handleRenameNode = (nodeId: string, currentTitle: string | null) => {
    const nextTitle = window.prompt('重命名节点', currentTitle ?? '');
    if (nextTitle === null) {
      return;
    }

    setPageTree((prev) => renameNodeInTree(prev, nodeId, nextTitle));
    setHasPendingDraftChanges(true);
  };

  const handleMoveNode = (nodeId: string, direction: -1 | 1) => {
    setPageTree((prev) => {
      const next = moveNodeInTree(prev, nodeId, direction);
      if (next !== prev) {
        setHasPendingDraftChanges(true);
      }

      return next;
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
            {node.title ? node.title : node.kind === 'group' ? '未命名分组' : '未命名页面'}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
            {node.kind === 'group' ? '分组节点' : '页面节点'}
          </Typography.Text>
        </div>
        {canEnterDesignMode && isDesignMode ? (
          <>
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                handleRenameNode(node.id, node.title);
              }}
            >
              重命名
            </Button>
            {canAddPageToGroup ? (
              <Button size="small" onClick={(event) => {
                event.stopPropagation();
                handleAddPageInGroup(node.id);
              }}>
                组内新增页面
              </Button>
            ) : null}
            <Button
              size="small"
              disabled={!canMoveUp}
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
              disabled={!canMoveDown}
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
    <div style={{ width: '100%', padding: '24px 0', maxWidth: 1240, margin: '0 auto' }}>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 12 }}>
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
          <Button size="small">新增区块</Button>
          <Button size="small">页面管理</Button>
          <Button size="small">当前页面设置</Button>
          <Button size="small">JS Block 试运行</Button>
          <Button
            size="small"
            onClick={() => setHasPendingDraftChanges(false)}
            disabled={!draftStatus.hasPendingDraft}
          >
            {draftStatus.buttonLabel}
          </Button>
        </Space>
      ) : null}
      {canEnterDesignMode && isDesignMode ? (
        <Typography.Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
          {draftStatus.statusText}
        </Typography.Text>
      ) : null}
      <Layout style={{ background: 'transparent' }}>
        <Sider width={280} theme="light" style={{ background: 'white', borderRight: '1px solid #f0f0f0', padding: 12 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            页面管理
          </Typography.Title>
          <Divider style={{ margin: '12px 0' }} />
          <Typography.Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
            {pageNodeTitle}
          </Typography.Text>
          {canEnterDesignMode && isDesignMode ? (
            <Space size={8} wrap style={{ marginBottom: 12 }}>
              <Button size="small" onClick={handleAddGroup}>
                新建分组
              </Button>
              <Button size="small" onClick={handleAddPage}>
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
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div style={{ marginTop: 8 }}>
                {selectedPageLabel ? (
                  <Typography.Text>
                    当前页面尚未接入区块内容，浏览态仅展示空状态。请在设计态添加页面区块与内容。
                  </Typography.Text>
                ) : (
                  <Typography.Text>
                    当前前台未指定 pageId，后续将默认加载该工作区页面树里的首页。
                  </Typography.Text>
                )}
                {canEnterDesignMode && isDesignMode ? (
                  <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                    设计模式已开启，后续在此承载区块编排与页面树管理能力。
                  </Typography.Paragraph>
                ) : null}
              </div>
            }
          />
        </Content>
      </Layout>
    </div>
  );
};
