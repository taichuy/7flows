import { Button, Divider, Empty, Flex, Layout, Space, Typography } from 'antd';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { useAuthStore } from '../../../state/auth-store';

const DESIGN_MODE_PERMISSION = 'frontstage.page.design';

type FrontStagePageProps = {
  workspaceId: string;
  pageId?: string;
  onNavigatePage?: (pageId?: string) => void;
  initialPageTree?: FrontStageTreeNode[];
};

type FrontStageTreeNode = {
  id: string;
  title: string;
  kind: 'group' | 'page';
  children?: FrontStageTreeNode[];
};

function collectTreeNodeIds(nodes: FrontStageTreeNode[]): Set<string> {
  const nodeIds = new Set<string>();

  const visit = (items: FrontStageTreeNode[]) => {
    for (const node of items) {
      nodeIds.add(node.id);

      if (node.children && node.children.length > 0) {
        visit(node.children);
      }
    }
  };

  visit(nodes);

  return nodeIds;
}

function flattenNestedGroups(nodes: FrontStageTreeNode[]): FrontStageTreeNode[] {
  const flattened: FrontStageTreeNode[] = [];

  for (const node of nodes) {
    if (node.kind === 'page') {
      flattened.push(node);
      continue;
    }

    if (node.children && node.children.length > 0) {
      flattened.push(...flattenNestedGroups(node.children));
    }
  }

  return flattened;
}

function normalizePageTree(nodes: FrontStageTreeNode[]): FrontStageTreeNode[] {
  return nodes.map((node) => {
    if (node.kind !== 'group') {
      return node;
    }

    return {
      ...node,
      children: flattenNestedGroups(node.children ?? [])
    };
  });
}

function getNextNodeId(
  nodes: FrontStageTreeNode[],
  prefix: 'page' | 'group'
): { id: string; index: number } {
  const existingIds = collectTreeNodeIds(nodes);

  let index = 1;
  while (existingIds.has(`${prefix}-${index}`)) {
    index += 1;
  }

  return {
    id: `${prefix}-${index}`,
    index
  };
}

function createPageNode(id: string, numberHint?: number): FrontStageTreeNode {
  return {
    id,
    title: numberHint ? `页面 新建 ${numberHint}` : `页面 ${id}`,
    kind: 'page'
  };
}

function createGroupNode(id: string, index: number): FrontStageTreeNode {
  return {
    id,
    title: `分组 ${index}`,
    kind: 'group',
    children: []
  };
}

function findNodeById(
  nodes: FrontStageTreeNode[],
  targetId: string
): FrontStageTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node;
    }

    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, targetId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function isPageInTree(nodes: FrontStageTreeNode[], targetPageId: string): boolean {
  return nodes.some((node) => {
    if (node.kind === 'page' && node.id === targetPageId) {
      return true;
    }

    return Boolean(node.children && isPageInTree(node.children, targetPageId));
  });
}

function getFirstPageId(nodes: FrontStageTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === 'page') {
      return node.id;
    }

    const nextPageId = node.children ? getFirstPageId(node.children) : null;
    if (nextPageId) {
      return nextPageId;
    }
  }

  return null;
}

function getDeleteConfirmMessage(node: FrontStageTreeNode): string {
  if (node.kind === 'group' && node.children && node.children.length > 0) {
    return `确认删除分组“${node.title || '未命名分组'}”吗？该分组下的页面会同时删除，且无法恢复。`;
  }

  return `确认删除${node.kind === 'group' ? '分组' : '页面'}“${node.title || '未命名页面'}”？`;
}

function toPageNavigationTarget(pageId: string | null): string | undefined {
  return pageId || undefined;
}

function moveNodeInTree(
  nodes: FrontStageTreeNode[],
  targetNodeId: string,
  direction: -1 | 1
): FrontStageTreeNode[] {
  const index = nodes.findIndex((node) => node.id === targetNodeId);
  if (index >= 0) {
    const targetIndex = index + direction;

    if (targetIndex >= 0 && targetIndex < nodes.length) {
      const nextNodes = [...nodes];
      [nextNodes[index], nextNodes[targetIndex]] = [nextNodes[targetIndex], nextNodes[index]];

      return nextNodes;
    }

    return nodes;
  }

  return nodes.map((node) => {
    if (!node.children) {
      return node;
    }

    const nextChildren = moveNodeInTree(node.children, targetNodeId, direction);
    if (nextChildren === node.children) {
      return node;
    }

    return {
      ...node,
      children: nextChildren
    };
  });
}

function removeNodeFromTree(nodes: FrontStageTreeNode[], targetNodeId: string): FrontStageTreeNode[] {
  const nextNodes = [];

  for (const node of nodes) {
    if (node.id === targetNodeId) {
      continue;
    }

    nextNodes.push({
      ...node,
      children: node.children ? removeNodeFromTree(node.children, targetNodeId) : node.children
    });
  }

  return nextNodes;
}

function renameNodeInTree(
  nodes: FrontStageTreeNode[],
  targetNodeId: string,
  title: string
): FrontStageTreeNode[] {
  return nodes.map((node) => {
    if (node.id === targetNodeId) {
      return { ...node, title };
    }

    return {
      ...node,
      children: node.children ? renameNodeInTree(node.children, targetNodeId, title) : node.children
    };
  });
}

function insertPageIntoGroup(
  nodes: FrontStageTreeNode[],
  parentNodeId: string,
  pageNode: FrontStageTreeNode
): FrontStageTreeNode[] {
  return nodes.map((node) => {
    if (node.id === parentNodeId && node.kind === 'group') {
      return {
        ...node,
        children: [...(node.children ?? []), pageNode]
      };
    }

    return {
      ...node,
      children: node.children ? insertPageIntoGroup(node.children, parentNodeId, pageNode) : node.children
    };
  });
}

function canMoveNode(
  nodes: FrontStageTreeNode[],
  targetNodeId: string
): { canMoveUp: boolean; canMoveDown: boolean } {
  const index = nodes.findIndex((node) => node.id === targetNodeId);
  if (index < 0) {
    return { canMoveUp: false, canMoveDown: false };
  }

  return {
    canMoveUp: index > 0,
    canMoveDown: index < nodes.length - 1
  };
}

export const FrontStagePage: FC<FrontStagePageProps> = ({
  workspaceId,
  pageId,
  onNavigatePage,
  initialPageTree
}) => {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const [isDesignMode, setIsDesignMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pageTree, setPageTree] = useState<FrontStageTreeNode[]>(() => {
    if (initialPageTree) {
      return normalizePageTree(initialPageTree);
    }

    return pageId ? [{ id: pageId, title: `页面 ${pageId}`, kind: 'page' }] : [];
  });
  const [selectedPageId, setSelectedPageId] = useState<string | null>(() => pageId ?? null);
  const { Sider, Content } = Layout;

  const canEnterDesignMode = useMemo(() => {
    return actor?.effective_display_role === 'root' || Boolean(me?.permissions.includes(DESIGN_MODE_PERMISSION));
  }, [actor, me]);

  useEffect(() => {
    if (!initialPageTree) {
      return;
    }

    setPageTree(normalizePageTree(initialPageTree));
  }, [initialPageTree]);

  useEffect(() => {
    if (pageId) {
      if (isPageInTree(pageTree, pageId)) {
        setSelectedPageId(pageId);
        return;
      }

      const fallbackPageId = getFirstPageId(pageTree);

      setSelectedPageId(fallbackPageId);
      onNavigatePage?.(toPageNavigationTarget(fallbackPageId));

      return;
    }

    setSelectedPageId((current) => {
      if (current && isPageInTree(pageTree, current)) {
        return current;
      }

      return getFirstPageId(pageTree);
    });
  }, [pageId, pageTree]);

  useEffect(() => {
    if (!pageId && selectedPageId) {
      onNavigatePage?.(selectedPageId);
    }
  }, [pageId, selectedPageId, onNavigatePage]);

  const selectedPageLabel = selectedPageId;
  const pageLabel = selectedPageLabel ? `页面 ${selectedPageLabel}` : '未选择 pageId（将使用默认首页）';
  const pageNodeTitle = selectedPageLabel ? `当前页面：${selectedPageLabel}` : '当前未选中页面';

  const handleAddGroup = () => {
    const next = getNextNodeId(pageTree, 'group');

    setPageTree((prev) => [...prev, createGroupNode(next.id, next.index)]);
    setHasUnsavedChanges(true);
  };

  const handleAddPage = () => {
    const next = getNextNodeId(pageTree, 'page');
    const pageNode = createPageNode(next.id, next.index);

    setPageTree((prev) => [...prev, pageNode]);
    setSelectedPageId(pageNode.id);
    onNavigatePage?.(pageNode.id);
    setHasUnsavedChanges(true);
  };

  const handleAddPageInGroup = (groupId: string) => {
    const next = getNextNodeId(pageTree, 'page');
    const pageNode = createPageNode(next.id, next.index);

    setPageTree((prev) => insertPageIntoGroup(prev, groupId, pageNode));
    setSelectedPageId(pageNode.id);
    onNavigatePage?.(pageNode.id);
    setHasUnsavedChanges(true);
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
      const nextSelectedPageId =
        selectedPageId && isPageInTree(next, selectedPageId)
          ? selectedPageId
          : getFirstPageId(next);

      setSelectedPageId(nextSelectedPageId);
      if (nextSelectedPageId) {
        onNavigatePage?.(nextSelectedPageId);
      } else {
        onNavigatePage?.(undefined);
      }

      return next;
    });

    setHasUnsavedChanges(true);
  };

  const handleRenameNode = (nodeId: string, currentTitle: string) => {
    const nextTitle = window.prompt('重命名节点', currentTitle);
    if (nextTitle === null) {
      return;
    }

    setPageTree((prev) => renameNodeInTree(prev, nodeId, nextTitle));
    setHasUnsavedChanges(true);
  };

  const handleMoveNode = (nodeId: string, direction: -1 | 1) => {
    setPageTree((prev) => {
      const next = moveNodeInTree(prev, nodeId, direction);
      if (next !== prev) {
        setHasUnsavedChanges(true);
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
                setHasUnsavedChanges(false);
              }}
            >
              {isDesignMode ? '退出设计模式' : '进入设计模式'}
            </Button>
          </Space>
        ) : null}
      </Flex>

      <Divider style={{ margin: '0 0 16px' }} />

      {canEnterDesignMode && isDesignMode ? (
        <Space wrap size={8} style={{ marginBottom: 12 }}>
          <Button size="small">新增区块</Button>
          <Button size="small">页面管理</Button>
          <Button size="small">当前页面设置</Button>
          <Button size="small">JS Block 试运行</Button>
          <Button
            size="small"
            onClick={() => setHasUnsavedChanges(false)}
            disabled={!hasUnsavedChanges}
          >
            保存设计
          </Button>
        </Space>
      ) : null}
      {canEnterDesignMode && isDesignMode ? (
        <Typography.Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
          {hasUnsavedChanges
            ? '当前有未保存改动，点击“保存设计”后同步到 schema storage。'
            : '当前无未保存改动。'}
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
              imageStyle={{ height: 48 }}
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
