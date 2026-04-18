import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@1flowbase/api-client', () => ({
  createConsoleApplication: vi.fn().mockResolvedValue({
    id: 'app-1'
  }),
  createConsoleApplicationTag: vi.fn().mockResolvedValue({
    id: 'tag-1'
  }),
  getConsoleApplication: vi.fn().mockResolvedValue({
    id: 'app-1'
  }),
  getConsoleApplicationCatalog: vi.fn().mockResolvedValue({
    types: [],
    tags: []
  }),
  listConsoleApplications: vi.fn().mockResolvedValue([]),
  updateConsoleApplication: vi.fn().mockResolvedValue({
    id: 'app-1'
  }),
  getDefaultApiBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:7800')
}));

import {
  createConsoleApplication,
  createConsoleApplicationTag,
  getConsoleApplication,
  getConsoleApplicationCatalog,
  getDefaultApiBaseUrl,
  listConsoleApplications,
  updateConsoleApplication
} from '@1flowbase/api-client';

import {
  createApplication,
  createApplicationTag,
  fetchApplicationCatalog,
  fetchApplicationDetail,
  fetchApplications,
  getApplicationsApiBaseUrl,
  updateApplication
} from '../api/applications';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('applications api', () => {
  test('prefers VITE_API_BASE_URL when it is present', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.flowbase.test');

    expect(getApplicationsApiBaseUrl({ protocol: 'http:', hostname: 'ignored-host' })).toBe(
      'https://api.flowbase.test'
    );
    expect(getDefaultApiBaseUrl).not.toHaveBeenCalled();
  });

  test('passes the resolved base url to list detail and create requests', async () => {
    const input = {
      application_type: 'agent_flow' as const,
      name: 'Support Agent',
      description: 'customer support',
      icon: 'RobotOutlined',
      icon_type: 'iconfont',
      icon_background: '#E6F7F2'
    };

    expect(
      getApplicationsApiBaseUrl({
        protocol: 'https:',
        hostname: 'workspace.local'
      })
    ).toBe('http://127.0.0.1:7800');

    await fetchApplications();
    await fetchApplicationCatalog();
    await fetchApplicationDetail('app-1');
    await createApplication(input, 'csrf-123');
    await updateApplication(
      'app-1',
      {
        name: 'Support Agent Pro',
        description: 'updated support',
        tag_ids: ['tag-1']
      },
      'csrf-123'
    );
    await createApplicationTag({ name: '客服' }, 'csrf-123');

    expect(listConsoleApplications).toHaveBeenCalledWith('http://127.0.0.1:7800');
    expect(getConsoleApplicationCatalog).toHaveBeenCalledWith('http://127.0.0.1:7800');
    expect(getConsoleApplication).toHaveBeenCalledWith('app-1', 'http://127.0.0.1:7800');
    expect(createConsoleApplication).toHaveBeenCalledWith(
      input,
      'csrf-123',
      'http://127.0.0.1:7800'
    );
    expect(updateConsoleApplication).toHaveBeenCalledWith(
      'app-1',
      {
        name: 'Support Agent Pro',
        description: 'updated support',
        tag_ids: ['tag-1']
      },
      'csrf-123',
      'http://127.0.0.1:7800'
    );
    expect(createConsoleApplicationTag).toHaveBeenCalledWith(
      { name: '客服' },
      'csrf-123',
      'http://127.0.0.1:7800'
    );
    expect(getDefaultApiBaseUrl).toHaveBeenCalled();
  });
});
