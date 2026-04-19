import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { createDefaultAgentFlowDocument } from '@1flowbase/flow-schema';

vi.mock('@scalar/api-reference-react', () => ({
  ApiReferenceReact: () => <div data-testid="style-boundary-scalar">Scalar</div>
}));

import { AppProviders } from '../../app/AppProviders';
import { StyleBoundaryHarness } from '../StyleBoundaryHarness';
import { getRuntimeScene, getSceneIdsForFiles } from '../registry';

describe('style boundary registry', () => {
  test('renders the account popup component scene and exposes scene metadata on window', async () => {
    const scene = getRuntimeScene('component.account-popup');

    render(
      <AppProviders>
        <StyleBoundaryHarness scene={scene} />
      </AppProviders>
    );

    expect(await screen.findByText('个人资料')).toBeInTheDocument();
    expect(window.__STYLE_BOUNDARY__?.scene.id).toBe('component.account-popup');
    expect(window.__STYLE_BOUNDARY__?.ready).toBe(true);
    expect(screen.getByTestId('style-boundary-scene')).toBeInTheDocument();
  });

  test('throws when a requested scene id is missing', () => {
    expect(() => getRuntimeScene('component.missing')).toThrow(
      /Unknown style boundary scene/u
    );
  });

  test('maps changed files to explicitly declared scenes', () => {
    expect(
      getSceneIdsForFiles(['web/app/src/features/home/pages/HomePage.tsx'])
    ).toEqual(['page.home']);
    expect(getSceneIdsForFiles(['web/app/src/app-shell/app-shell.css'])).toEqual([
      'component.account-popup',
      'component.account-trigger',
      'page.home',
      'page.application-detail',
      'page.embedded-apps',
      'page.tools',
      'page.settings',
      'page.me'
    ]);
    expect(
      getSceneIdsForFiles(['web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx'])
    ).toEqual(['page.application-detail', 'page.settings', 'page.me']);
    expect(getSceneIdsForFiles(['web/app/src/features/me/pages/me-page.css'])).toEqual([
      'page.me'
    ]);
  });

  test('renders the home page scene inside the shared shell frame', async () => {
    const scene = getRuntimeScene('page.home');

    render(
      <AppProviders>
        <StyleBoundaryHarness scene={scene} />
      </AppProviders>
    );

    expect(await screen.findByRole('heading', { name: '1flowbase' })).toBeInTheDocument();
    expect(await screen.findByText('Support Agent')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  }, 15_000);

  test('application detail scene save mock echoes the latest draft document', async () => {
    const scene = getRuntimeScene('page.application-detail');

    render(
      <AppProviders>
        <StyleBoundaryHarness scene={scene} />
      </AppProviders>
    );

    await screen.findByText(/support agent/i);

    const baseDocument = createDefaultAgentFlowDocument({ flowId: 'flow-1' });
    const nextDocument = {
      ...baseDocument,
      editor: {
        ...baseDocument.editor,
        viewport: { x: 120, y: 48, zoom: 0.85 }
      }
    };
    const saveResponse = await fetch(
      'http://127.0.0.1:7800/api/console/applications/app-1/orchestration/draft',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          document: nextDocument,
          change_kind: 'layout',
          summary: '更新画布布局'
        })
      }
    );
    const savePayload = await saveResponse.json();
    const latestResponse = await fetch(
      'http://127.0.0.1:7800/api/console/applications/app-1/orchestration'
    );
    const latestPayload = await latestResponse.json();

    expect(savePayload.data.draft.document).toEqual(nextDocument);
    expect(latestPayload.data.draft.document).toEqual(nextDocument);
  }, 15_000);

  test(
    'renders the settings scene with mocked model provider data',
    async () => {
      const scene = getRuntimeScene('page.settings');

      render(
        <AppProviders>
          <StyleBoundaryHarness scene={scene} />
        </AppProviders>
      );

      expect(
        await screen.findByRole(
          'heading',
          { name: '模型供应商', level: 4 },
          { timeout: 5000 }
        )
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('heading', { name: '已安装供应商', level: 5 }, { timeout: 5000 })
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('heading', { name: '安装模型供应商', level: 5 }, { timeout: 5000 })
      ).toBeInTheDocument();
      expect((await screen.findAllByText('OpenAI Compatible')).length).toBeGreaterThanOrEqual(2);
      expect(
        await screen.findByRole('button', { name: '添加 API Key' }, { timeout: 5000 })
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: '已安装到当前 workspace' }, { timeout: 5000 })
      ).toBeInTheDocument();
    },
    15000
  );
});
