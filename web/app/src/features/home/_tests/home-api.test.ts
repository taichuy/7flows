import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@1flowbase/api-client', () => ({
  fetchApiHealth: vi.fn().mockResolvedValue({
    service: 'api-server',
    status: 'ok',
    version: '0.1.0'
  }),
  getDefaultApiBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:7800')
}));

import { fetchApiHealth, getDefaultApiBaseUrl } from '@1flowbase/api-client';

import {
  getApiHealthQueryOptions,
  getHomeApiBaseUrl
} from '../api/health';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('home api', () => {
  test('prefers VITE_API_BASE_URL when it is present', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.flowse.test');

    expect(getHomeApiBaseUrl({ protocol: 'http:', hostname: 'ignored-host' })).toBe(
      'https://api.flowse.test'
    );
    expect(getDefaultApiBaseUrl).not.toHaveBeenCalled();
  });

  test('builds query options from the resolved base url', async () => {
    const query = getApiHealthQueryOptions({
      protocol: 'https:',
      hostname: 'workspace.local'
    });

    expect(query.queryKey).toEqual(['api-health', 'http://127.0.0.1:7800']);
    await expect(query.queryFn()).resolves.toEqual({
      service: 'api-server',
      status: 'ok',
      version: '0.1.0'
    });
    expect(fetchApiHealth).toHaveBeenCalledWith('http://127.0.0.1:7800');
    expect(getDefaultApiBaseUrl).toHaveBeenCalledWith({
      protocol: 'https:',
      hostname: 'workspace.local'
    });
  });
});
