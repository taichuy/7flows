import { render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';

import { resetAuthStore, useAuthStore } from '../../state/auth-store';
import { AppShellFrame } from '../AppShellFrame';

describe('AppShellFrame', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.getState().setAuthenticated({
      csrfToken: 'csrf-token',
      actor: {
        account: 'root',
        effective_display_role: 'root',
        current_workspace_id: 'workspace-1'
      },
      me: {
        id: 'user-1',
        account: 'root',
        name: 'Root',
        nickname: 'Root',
        email: null,
        effective_display_role: 'root',
        current_workspace_id: 'workspace-1',
        permissions: []
      }
    });
  });

  test('places the account menu before the settings menu in the top actions', async () => {
    render(
      <AppShellFrame pathname="/settings/data-models">
        <main>Content</main>
      </AppShellFrame>
    );

    await waitFor(() => {
      const accountLabel = screen.getByText('Root');
      const settingsTrigger = screen.getByLabelText('设置');

      expect(
        accountLabel.compareDocumentPosition(settingsTrigger) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });
  });

  test('keeps mobile top actions content-width instead of stretching blank space', () => {
    const appShellCss = fs.readFileSync(
      path.resolve(import.meta.dirname, '../app-shell.css'),
      'utf8'
    );
    const mobileActionsRule = appShellCss.match(
      /@media \(max-width: 767px\) \{[\s\S]*?\.app-shell-actions \{([\s\S]*?)\n {2}\}/
    )?.[1];

    expect(mobileActionsRule).toBeDefined();
    expect(mobileActionsRule).toContain('align-self: flex-end;');
    expect(mobileActionsRule).toContain('width: max-content;');
  });
});
