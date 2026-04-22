import { useMemo } from 'react';

import { Navigate } from '@tanstack/react-router';

import { useAuthStore } from '../../../state/auth-store';
import type { SettingsSectionKey } from '../lib/settings-sections';
import { SettingsRouteShell } from './settings-page/SettingsRouteShell';
import { SettingsSectionBody } from './settings-page/SettingsSectionBody';
import { useSettingsSections } from './settings-page/use-settings-sections';

function hasAnyPermission(permissions: string[], candidates: string[]) {
  return candidates.some((permission) => permissions.includes(permission));
}

export function SettingsPage({
  requestedSectionKey
}: {
  requestedSectionKey?: SettingsSectionKey;
}) {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const permissions = me?.permissions ?? [];
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const isRoot = actor?.effective_display_role === 'root';
  const canManageMembers = isRoot || permissionSet.has('user.manage.all');
  const canManageRoles =
    isRoot || permissionSet.has('role_permission.manage.all');
  const canManageModelProviders =
    isRoot ||
    hasAnyPermission(permissions, [
      'state_model.manage.all',
      'state_model.manage.own'
    ]);
  const { activeSection, redirectSection, visibleSections } =
    useSettingsSections({
      requestedSectionKey,
      isRoot,
      permissions
    });

  if (redirectSection) {
    return <Navigate to={redirectSection.to} replace />;
  }

  return (
    <SettingsRouteShell
      visibleSections={visibleSections}
      activeSectionKey={activeSection?.key ?? ''}
    >
      {activeSection ? (
        <SettingsSectionBody
          sectionKey={activeSection.key}
          canManageMembers={canManageMembers}
          canManageRoles={canManageRoles}
          canManageModelProviders={canManageModelProviders}
        />
      ) : null}
    </SettingsRouteShell>
  );
}
