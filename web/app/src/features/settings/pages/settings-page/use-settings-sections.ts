import { useMemo } from 'react';

import {
  settingsSectionDefinitions,
  type SettingsSectionKey,
  type SettingsSectionNavItem
} from '../../lib/settings-sections';

export function useSettingsSections({
  requestedSectionKey,
  isRoot,
  permissions
}: {
  requestedSectionKey?: SettingsSectionKey;
  isRoot: boolean;
  permissions: string[];
}) {
  const visibleSections = useMemo<SettingsSectionNavItem[]>(
    () =>
      settingsSectionDefinitions
        .filter(
          (section) =>
            isRoot ||
            section.requiredPermissions.some((permission) =>
              permissions.includes(permission)
            )
        )
        .map(({ requiredPermissions: _requiredPermissions, ...section }) => ({
          ...section
        })),
    [isRoot, permissions]
  );
  const fallbackSection = visibleSections[0] ?? null;
  const activeSection = requestedSectionKey
    ? (visibleSections.find((section) => section.key === requestedSectionKey) ??
      null)
    : null;
  const redirectSection =
    !requestedSectionKey || !activeSection ? fallbackSection : null;

  return {
    activeSection,
    fallbackSection,
    redirectSection,
    visibleSections
  };
}
