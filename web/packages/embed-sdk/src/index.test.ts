import { expect, test } from 'vitest';

import { createEmbedContext } from './index';

test('createEmbedContext returns the provided context', () => {
  expect(
    createEmbedContext({ applicationId: 'app-1', teamId: 'team-1' })
  ).toEqual({ applicationId: 'app-1', teamId: 'team-1' });
});
