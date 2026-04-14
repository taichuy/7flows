import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

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
      'page.embedded-apps',
      'page.tools',
      'page.settings',
      'page.me'
    ]);
    expect(
      getSceneIdsForFiles(['web/app/src/shared/ui/section-page-layout/SectionPageLayout.tsx'])
    ).toEqual(['page.settings', 'page.me']);
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

    expect(await screen.findByRole('heading', { name: '1Flowse' })).toBeInTheDocument();
    expect(screen.getByText('欢迎，Root')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  test('renders the settings scene with mocked api docs data', async () => {
    const scene = getRuntimeScene('page.settings');

    render(
      <AppProviders>
        <StyleBoundaryHarness scene={scene} />
      </AppProviders>
    );

    expect(await screen.findByRole('heading', { name: 'API 文档', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '接口分类' })).toBeInTheDocument();
  });
});
