import { describe, expect, test, vi } from 'vitest';
import * as apiClient from '@1flowbase/api-client';

import {
  createFrontstagePageGroupNode,
  createFrontstagePageNode,
  deleteFrontstageNode,
  fetchFrontstagePageTree,
  frontstagePageTreeQueryKey,
  moveFrontstageNode,
  renameFrontstagePageNode
} from '../api/page-tree';
import {
  fetchFrontstagePageContent,
  frontstagePageContentQueryKey
} from '../api/page-content';
import {
  fetchFrontstageBlockCode,
  frontstageBlockCodeQueryKey,
  saveFrontstageBlockCode
} from '../api/block-code';

describe('frontstage page tree feature api', () => {
  test('uses a workspace-scoped page tree query key', () => {
    expect(frontstagePageTreeQueryKey('workspace-1')).toEqual([
      'frontstage',
      'workspace-1',
      'page-tree'
    ]);
  });

  test('adapts page tree read and write calls to api-client DTOs', async () => {
    const listSpy = vi
      .spyOn(apiClient, 'listFrontstagePages')
      .mockResolvedValue([]);
    const createGroupSpy = vi
      .spyOn(apiClient, 'createFrontstageGroup')
      .mockResolvedValue({
        id: 'group-1',
        title: '分组 1',
        kind: 'group',
        parent_id: null,
        rank: '001000',
        schema_root_uid: null
      });
    const createPageSpy = vi
      .spyOn(apiClient, 'createFrontstagePage')
      .mockResolvedValue({
        id: 'page-1',
        title: '页面 1',
        kind: 'page',
        parent_id: 'group-1',
        rank: '001000',
        schema_root_uid: 'root'
      });
    const renameSpy = vi
      .spyOn(apiClient, 'updateFrontstagePageNodeTitle')
      .mockResolvedValue({
        id: 'page-1',
        title: '页面 新名',
        kind: 'page',
        parent_id: null,
        rank: '001000',
        schema_root_uid: 'root'
      });
    const moveSpy = vi
      .spyOn(apiClient, 'moveFrontstagePageNode')
      .mockResolvedValue({
        id: 'page-1',
        title: '页面 新名',
        kind: 'page',
        parent_id: null,
        rank: '000000',
        schema_root_uid: 'root'
      });
    const deleteSpy = vi
      .spyOn(apiClient, 'deleteFrontstagePageNode')
      .mockResolvedValue(undefined);

    try {
      await fetchFrontstagePageTree('workspace-1');
      await createFrontstagePageGroupNode(
        'workspace-1',
        { title: '分组 1', parentId: null, rank: '001000' },
        'csrf-123'
      );
      await createFrontstagePageNode(
        'workspace-1',
        { title: '页面 1', parentId: 'group-1', rank: '001000' },
        'csrf-123'
      );
      await renameFrontstagePageNode(
        'workspace-1',
        'page-1',
        { title: '页面 新名' },
        'csrf-123'
      );
      await moveFrontstageNode(
        'workspace-1',
        'page-1',
        { parentId: null, rank: '000000' },
        'csrf-123'
      );
      await deleteFrontstageNode('workspace-1', 'page-1', 'csrf-123');

      expect(listSpy).toHaveBeenCalledWith('workspace-1', expect.any(String));
      expect(createGroupSpy).toHaveBeenCalledWith(
        'workspace-1',
        { title: '分组 1', parent_id: null, rank: '001000' },
        'csrf-123',
        expect.any(String)
      );
      expect(createPageSpy).toHaveBeenCalledWith(
        'workspace-1',
        { title: '页面 1', parent_id: 'group-1', rank: '001000' },
        'csrf-123',
        expect.any(String)
      );
      expect(renameSpy).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        { title: '页面 新名' },
        'csrf-123',
        expect.any(String)
      );
      expect(moveSpy).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        { parent_id: null, rank: '000000' },
        'csrf-123',
        expect.any(String)
      );
      expect(deleteSpy).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        'csrf-123',
        expect.any(String)
      );
    } finally {
      listSpy.mockRestore();
      createGroupSpy.mockRestore();
      createPageSpy.mockRestore();
      renameSpy.mockRestore();
      moveSpy.mockRestore();
      deleteSpy.mockRestore();
    }
  });
});

describe('frontstage page content feature api', () => {
  test('uses a workspace and page scoped detail query key', () => {
    expect(frontstagePageContentQueryKey('workspace-1', 'page-1')).toEqual([
      'frontstage',
      'workspace-1',
      'pages',
      'page-1',
      'content'
    ]);
  });

  test('adapts page detail DTOs to camelCase output', async () => {
    const detailSpy = vi
      .spyOn(apiClient, 'getFrontstagePageDetail')
      .mockResolvedValue({
        page: {
          id: 'page-1',
          title: '页面 1',
          kind: 'page',
          parent_id: 'group-1',
          rank: '001000',
          schema_root_uid: 'root-1'
        },
        schema: {
          root_uid: 'root-1',
          payload: { blocks: [] }
        },
        root: {
          uid: 'root-1',
          payload: { kind: 'frontstage.page.root' }
        }
      });

    try {
      await expect(
        fetchFrontstagePageContent('workspace-1', 'page-1')
      ).resolves.toEqual({
        page: {
          id: 'page-1',
          title: '页面 1',
          kind: 'page',
          parentId: 'group-1',
          rank: '001000',
          schemaRootUid: 'root-1'
        },
        schema: {
          rootUid: 'root-1',
          payload: { blocks: [] }
        },
        root: {
          uid: 'root-1',
          payload: { kind: 'frontstage.page.root' }
        }
      });
      expect(detailSpy).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        expect.any(String)
      );
    } finally {
      detailSpy.mockRestore();
    }
  });
});

describe('frontstage block code feature api', () => {
  test('uses a workspace, page, and codeRef scoped query key', () => {
    expect(frontstageBlockCodeQueryKey('workspace-1', 'page-1', 'hero')).toEqual([
      'frontstage',
      'workspace-1',
      'pages',
      'page-1',
      'block-code',
      'hero'
    ]);
  });

  test('adapts block code read and CSRF write calls to camelCase contracts', async () => {
    const readSpy = vi
      .spyOn(apiClient, 'getFrontstageBlockCode')
      .mockResolvedValue({
        page_id: 'page-1',
        code_ref: 'hero',
        code: 'export default 1;'
      });
    const saveSpy = vi
      .spyOn(apiClient, 'saveFrontstageBlockCode')
      .mockResolvedValue({
        page_id: 'page-1',
        code_ref: 'hero',
        code: 'export default 2;'
      });

    try {
      await expect(
        fetchFrontstageBlockCode('workspace-1', 'page-1', 'hero')
      ).resolves.toEqual({
        pageId: 'page-1',
        codeRef: 'hero',
        code: 'export default 1;'
      });
      await expect(
        saveFrontstageBlockCode(
          'workspace-1',
          'page-1',
          { codeRef: 'hero', code: 'export default 2;' },
          'csrf-123'
        )
      ).resolves.toEqual({
        pageId: 'page-1',
        codeRef: 'hero',
        code: 'export default 2;'
      });
      expect(readSpy).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        'hero',
        expect.any(String)
      );
      expect(saveSpy).toHaveBeenCalledWith(
        'workspace-1',
        'page-1',
        'hero',
        { code: 'export default 2;' },
        'csrf-123',
        expect.any(String)
      );
    } finally {
      readSpy.mockRestore();
      saveSpy.mockRestore();
    }
  });
});
