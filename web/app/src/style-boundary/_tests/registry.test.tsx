import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { AppProviders } from '../../app/AppProviders';
import { StyleBoundaryHarness } from '../main';
import { getRuntimeScene } from '../registry';

describe('style boundary harness', () => {
  test('renders the account popup component scene and exposes scene metadata on window', async () => {
    const scene = getRuntimeScene('component.account-popup');

    render(
      <AppProviders>
        <StyleBoundaryHarness scene={scene} />
      </AppProviders>
    );

    expect(await screen.findByText('Profile')).toBeInTheDocument();
    expect(window.__STYLE_BOUNDARY__?.scene.id).toBe('component.account-popup');
    expect(window.__STYLE_BOUNDARY__?.ready).toBe(true);
  });

  test('throws when a requested scene id is missing', () => {
    expect(() => getRuntimeScene('component.missing')).toThrow(
      /Unknown style boundary scene/u
    );
  });
});
