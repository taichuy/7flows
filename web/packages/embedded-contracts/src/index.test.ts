import { expect, test } from 'vitest';

import { createEmbeddedAppManifest } from './index';

test('createEmbeddedAppManifest returns the provided manifest', () => {
  expect(
    createEmbeddedAppManifest({
      appId: 'embedded-1',
      entry: 'dist/index.html',
      name: 'Demo Embedded App',
      routePrefix: '/embedded/embedded-1',
      version: '0.1.0'
    })
  ).toEqual({
    appId: 'embedded-1',
    entry: 'dist/index.html',
    name: 'Demo Embedded App',
    routePrefix: '/embedded/embedded-1',
    version: '0.1.0'
  });
});
