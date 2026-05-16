import { describe, expect, test, vi } from 'vitest';
import * as transport from '../transport';

import { listConsoleFrontendBlocks } from '../console-frontend-blocks';

describe('console-frontend-blocks client', () => {
  const apiFetchSpy = vi
    .spyOn(transport, 'apiFetch')
    .mockImplementation(async (input) => input as never);

  test('transport spy is active', () => {
    expect(apiFetchSpy).toBeDefined();
  });

  test('lists frontend block catalog entries from console endpoint', async () => {
    await expect(listConsoleFrontendBlocks()).resolves.toMatchObject({
      path: '/api/console/frontend-blocks',
      method: 'GET'
    });
  });
});
