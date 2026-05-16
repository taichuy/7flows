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
  fetchFrontstageBlockCatalog,
  frontstageBlockCatalogQueryKey
} from '../api/block-catalog';

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

describe('frontstage block catalog feature api', () => {
  test('uses a stable block catalog query key', () => {
    expect(frontstageBlockCatalogQueryKey()).toEqual([
      'frontstage',
      'block-catalog'
    ]);
  });

  test('adapts block catalog reads to api-client DTOs', async () => {
    const listSpy = vi
      .spyOn(apiClient, 'listConsoleFrontendBlocks')
      .mockResolvedValue([
        {
          installation_id: 'installation-1',
          provider_code: 'official',
          plugin_id: 'official.blocks',
          plugin_version: '1.0.0',
          contribution_code: 'official.hero',
          title: 'Hero',
          runtime: 'iframe',
          entry: 'blocks/hero.html',
          context_contract: {
            primitives: ['record'],
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string' }
              }
            }
          },
          permissions: {
            network: 'deny',
            storage: 'read',
            secrets: 'deny'
          },
          ui_capabilities: ['resizable', 'configure']
        }
      ]);

    try {
      await expect(fetchFrontstageBlockCatalog()).resolves.toEqual([
        {
          installation_id: 'installation-1',
          provider_code: 'official',
          plugin_id: 'official.blocks',
          plugin_version: '1.0.0',
          contribution_code: 'official.hero',
          title: 'Hero',
          runtime: 'iframe',
          entry: 'blocks/hero.html',
          context_contract: {
            primitives: ['record'],
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string' }
              }
            }
          },
          permissions: {
            network: 'deny',
            storage: 'read',
            secrets: 'deny'
          },
          ui_capabilities: ['resizable', 'configure']
        }
      ]);
      expect(listSpy).toHaveBeenCalledWith(expect.any(String));
    } finally {
      listSpy.mockRestore();
    }
  });
});
