export type FrontStageTreeNode = {
  id: string;
  title: string | null;
  kind: 'group' | 'page';
  children?: FrontStageTreeNode[];
};

export type PageSelectionResolution = {
  selectedPageId: string | null;
  navigationTarget: string | undefined;
  shouldNavigate: boolean;
};

export type FrontStageDraftStatus = {
  hasPendingDraft: boolean;
  buttonLabel: string;
  statusText: string;
};

export function collectTreeNodeIds(nodes: FrontStageTreeNode[]): Set<string> {
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

export function normalizePageTree(nodes: FrontStageTreeNode[]): FrontStageTreeNode[] {
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

function generateNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `00000000-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padStart(12, '0')}`;
}

function getNextNodeTitleIndex(
  nodes: FrontStageTreeNode[],
  nodeType: 'group' | 'page',
  titlePrefix: string
): number {
  let maxIndex = 0;

  const visit = (items: FrontStageTreeNode[]) => {
    for (const item of items) {
      if (item.kind === nodeType) {
        const matched = item.title?.match(new RegExp(`^${titlePrefix}(\\d+)$`));

        if (matched) {
          const candidateIndex = Number.parseInt(matched[1], 10);
          if (candidateIndex > maxIndex) {
            maxIndex = candidateIndex;
          }
        }
      }

      if (item.children && item.children.length > 0) {
        visit(item.children);
      }
    }
  };

  visit(nodes);

  return maxIndex + 1;
}

export function getNextNodeId(nodes: FrontStageTreeNode[]): string {
  const nextId = generateNodeId();

  const existingIds = collectTreeNodeIds(nodes);
  if (!existingIds.has(nextId)) {
    return nextId;
  }

  return getNextNodeId(nodes);
}

export function getNextPageTitleIndex(nodes: FrontStageTreeNode[]): number {
  return getNextNodeTitleIndex(nodes, 'page', '页面 新建 ');
}

export function getNextGroupTitleIndex(nodes: FrontStageTreeNode[]): number {
  return getNextNodeTitleIndex(nodes, 'group', '分组 ');
}

export function createPageNode(id: string, numberHint: number): FrontStageTreeNode {
  return {
    id,
    title: `页面 新建 ${numberHint}`,
    kind: 'page'
  };
}

export function createGroupNode(id: string, index: number): FrontStageTreeNode {
  return {
    id,
    title: `分组 ${index}`,
    kind: 'group',
    children: []
  };
}

export function findNodeById(
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

export function isPageInTree(nodes: FrontStageTreeNode[], targetPageId: string): boolean {
  return nodes.some((node) => {
    if (node.kind === 'page' && node.id === targetPageId) {
      return true;
    }

    return Boolean(node.children && isPageInTree(node.children, targetPageId));
  });
}

export function getFirstPageId(nodes: FrontStageTreeNode[]): string | null {
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

export function resolveSelectedPageId({
  currentSelectedPageId,
  pageId,
  pageTree
}: {
  currentSelectedPageId?: string | null;
  pageId?: string;
  pageTree: FrontStageTreeNode[];
}): PageSelectionResolution {
  if (pageId) {
    if (isPageInTree(pageTree, pageId)) {
      return {
        selectedPageId: pageId,
        navigationTarget: undefined,
        shouldNavigate: false
      };
    }

    const fallbackPageId = getFirstPageId(pageTree);

    return {
      selectedPageId: fallbackPageId,
      navigationTarget: fallbackPageId ?? undefined,
      shouldNavigate: true
    };
  }

  if (currentSelectedPageId && isPageInTree(pageTree, currentSelectedPageId)) {
    return {
      selectedPageId: currentSelectedPageId,
      navigationTarget: currentSelectedPageId,
      shouldNavigate: true
    };
  }

  const fallbackPageId = getFirstPageId(pageTree);

  return {
    selectedPageId: fallbackPageId,
    navigationTarget: fallbackPageId ?? undefined,
    shouldNavigate: Boolean(fallbackPageId)
  };
}

export function getPageDisplayTitle(
  nodes: FrontStageTreeNode[],
  targetPageId: string | null
): string | null {
  if (!targetPageId) {
    return null;
  }

  const targetNode = findNodeById(nodes, targetPageId);
  if (!targetNode || targetNode.kind !== 'page') {
    return null;
  }

  return targetNode.title || '未命名页面';
}

export function getDeleteConfirmMessage(node: FrontStageTreeNode): string {
  if (node.kind === 'group' && node.children && node.children.length > 0) {
    return `确认删除分组“${node.title || '未命名分组'}”吗？该分组下的页面会同时删除，且无法恢复。`;
  }

  return `确认删除${node.kind === 'group' ? '分组' : '页面'}“${node.title || '未命名页面'}”？`;
}

export function moveNodeInTree(
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

export function removeNodeFromTree(
  nodes: FrontStageTreeNode[],
  targetNodeId: string
): FrontStageTreeNode[] {
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

export function renameNodeInTree(
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

export function insertPageIntoGroup(
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

export function canMoveNode(
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

export function getDraftStatus(hasPendingDraft: boolean): FrontStageDraftStatus {
  return {
    hasPendingDraft,
    buttonLabel: '清除本地草稿',
    statusText: hasPendingDraft
      ? '当前有本地草稿变更，后端写入接口开放前不会持久化。'
      : '当前无本地草稿变更。'
  };
}
