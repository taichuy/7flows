import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { BlockConfigurationDrawer } from '../../components/BlockConfigurationDrawer';
import type { NormalizedFrontstageBlockCatalogEntry } from '../../lib/block-catalog';
import { createFrontstageBlockConfigurationModel } from '../../lib/block-configuration';
import type { FrontstageBlockInstance } from '../../lib/page-document';
import type { RestrictedBlockLoaderLimits } from '../../lib/restricted-block-loader';

function createBlock(
  overrides: Partial<FrontstageBlockInstance> = {}
): FrontstageBlockInstance {
  return {
    id: 'hero-block',
    sourceId: 'source-hero-block',
    codeRef: 'hero-code',
    sourceCodeRef: 'source-hero-code',
    catalog: {
      providerCode: 'official',
      installationId: 'installation-1'
    },
    contribution: {
      pluginId: 'official.blocks',
      pluginVersion: '1.0.0',
      code: 'hero.banner'
    },
    props: {
      title: 'Configured title',
      description: 'Configured description',
      templateId: 'data-table',
      data: {
        model: 'orders',
        fields: ['id', { name: 'title', label: 'Title' }],
        operations: {
          query: true,
          create: false,
          update: true,
          delete: false
        },
        filter: { status: 'open' },
        sort: [{ field: 'created_at', direction: 'desc' }],
        pagination: { pageSize: 20 }
      }
    },
    layout: {
      order: 7,
      width: 6,
      height: 4,
      region: 'main'
    },
    order: 7,
    runtime: {
      kind: 'js-ui',
      entry: 'blocks/hero/index.js',
      hint: 'js-ui'
    },
    ...overrides
  };
}

function createCatalogEntry(
  overrides: Partial<NormalizedFrontstageBlockCatalogEntry> = {}
): NormalizedFrontstageBlockCatalogEntry {
  return {
    id: 'official:hero.banner',
    runtimeKind: 'iframe',
    installationId: 'installation-1',
    providerCode: 'official',
    pluginId: 'official.blocks',
    pluginVersion: '1.0.0',
    contributionCode: 'hero.banner',
    title: 'Hero Banner',
    entry: 'blocks/hero/index.js',
    permissions: {
      network: 'none',
      storage: 'none',
      secrets: 'none'
    },
    contextContract: {
      primitives: ['text', 'button', 'data_record'],
      inputSchema: {
        type: 'object',
        properties: {
          recordId: { type: 'string' }
        }
      }
    },
    uiCapabilities: ['responsive', 'configurable', 'data_binding'],
    raw: {
      installation_id: 'installation-1',
      provider_code: 'official',
      plugin_id: 'official.blocks',
      plugin_version: '1.0.0',
      contribution_code: 'hero.banner',
      title: 'Hero Banner',
      runtime: 'iframe',
      entry: 'blocks/hero/index.js',
      context_contract: {
        primitives: ['text', 'button', 'data_record'],
        input_schema: {
          type: 'object'
        }
      },
      permissions: {
        network: 'none',
        storage: 'none',
        secrets: 'none'
      },
      ui_capabilities: ['responsive', 'configurable', 'data_binding']
    },
    ...overrides
  };
}

function createLimits(
  overrides: Partial<RestrictedBlockLoaderLimits> = {}
): RestrictedBlockLoaderLimits {
  return {
    timeoutMs: 1000,
    maxRenderDepth: 8,
    maxRenderNodes: 250,
    maxEventChainDepth: 4,
    allowedActions: ['orders.refresh'],
    allowedEvents: ['orders.loaded'],
    allowedDataModels: ['orders'],
    allowedDataOperations: ['query', 'update'],
    ...overrides
  };
}

function renderDrawer({
  block = createBlock(),
  catalogEntry = createCatalogEntry(),
  limits = createLimits()
}: {
  block?: FrontstageBlockInstance;
  catalogEntry?: NormalizedFrontstageBlockCatalogEntry | null;
  limits?: RestrictedBlockLoaderLimits;
} = {}) {
  return render(
    <BlockConfigurationDrawer
      open
      onClose={vi.fn()}
      model={createFrontstageBlockConfigurationModel({
        block,
        catalogEntry,
        limits
      })}
    />
  );
}

describe('BlockConfigurationDrawer', () => {
  test('renders the readonly basic, data, code, context, and limits sections from the configuration model', async () => {
    renderDrawer();

    const dialog = await screen.findByRole('dialog', { name: '区块配置' });
    expect(within(dialog).getByRole('tab', { name: 'Basic' })).toBeVisible();
    expect(within(dialog).getByRole('tab', { name: 'Data' })).toBeVisible();
    expect(within(dialog).getByRole('tab', { name: 'Code' })).toBeVisible();
    expect(within(dialog).getByRole('tab', { name: 'Context' })).toBeVisible();
    expect(within(dialog).getByRole('tab', { name: 'Limits' })).toBeVisible();

    const basicSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-basic'
    );
    expect(basicSection).toHaveTextContent('hero-block');
    expect(basicSection).toHaveTextContent('hero-code');
    expect(basicSection).toHaveTextContent('Width6');
    expect(basicSection).toHaveTextContent('Height4');
    expect(basicSection).toHaveTextContent('Order7');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Data' }));
    const dataSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-data'
    );
    expect(dataSection).toHaveTextContent('orders');
    expect(dataSection).toHaveTextContent('2 fields');
    expect(dataSection).toHaveTextContent('QueryEnabled');
    expect(dataSection).toHaveTextContent('CreateDisabled');
    expect(dataSection).toHaveTextContent('PaginationpageSize 20');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Code' }));
    const codeSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-code'
    );
    expect(codeSection).toHaveTextContent('js-ui');
    expect(codeSection).toHaveTextContent('blocks/hero/index.js');
    expect(codeSection).toHaveTextContent('official:hero.banner');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Context' }));
    const contextSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-context'
    );
    expect(contextSection).toHaveTextContent('CatalogMatched');
    expect(contextSection).toHaveTextContent('text');
    expect(contextSection).toHaveTextContent('ctx.data');
    expect(contextSection).toHaveTextContent('orders.refresh');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Limits' }));
    const limitsSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-limits'
    );
    expect(limitsSection).toHaveTextContent('Timeout1000 ms');
    expect(limitsSection).toHaveTextContent('Max render nodes250');
    expect(limitsSection).toHaveTextContent('orders');
    expect(limitsSection).toHaveTextContent('query');
    expect(limitsSection).toHaveTextContent('update');
  });

  test('shows default data and context values when the selected block has no data model or catalog match', async () => {
    renderDrawer({
      block: createBlock({
        props: {},
        catalog: {
          providerCode: null,
          installationId: null
        }
      }),
      catalogEntry: null,
      limits: createLimits({
        allowedActions: [],
        allowedEvents: [],
        allowedDataModels: [],
        allowedDataOperations: []
      })
    });

    const dialog = await screen.findByRole('dialog', { name: '区块配置' });
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Data' }));
    const dataSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-data'
    );
    expect(dataSection).toHaveTextContent('ModelNot configured');
    expect(dataSection).toHaveTextContent('0 fields');
    expect(dataSection).toHaveTextContent('QueryDisabled');

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Context' }));
    const contextSection = within(dialog).getByTestId(
      'frontstage-block-configuration-section-context'
    );
    expect(contextSection).toHaveTextContent('CatalogNot matched');
    expect(contextSection).toHaveTextContent('No allowed actions');
    expect(contextSection).toHaveTextContent('No allowed data models');
  });
});
