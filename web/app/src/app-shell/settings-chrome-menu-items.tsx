import { SettingOutlined } from '@ant-design/icons';
import { Link } from '@tanstack/react-router';
import type { MenuProps } from 'antd';

import {
  settingsSectionDefinitions,
  type SettingsSectionDefinition
} from '../features/settings/lib/settings-sections';

function hasAnyPermission(permissions: string[], candidates: string[]) {
  return candidates.some((permission) => permissions.includes(permission));
}

function getVisibleSettingsSections({
  isRoot,
  permissions,
  includeAllWhenPermissionsUnknown
}: {
  isRoot: boolean;
  permissions: string[];
  includeAllWhenPermissionsUnknown: boolean;
}) {
  if (isRoot || includeAllWhenPermissionsUnknown) {
    return settingsSectionDefinitions;
  }

  return settingsSectionDefinitions.filter((section) =>
    hasAnyPermission(permissions, section.requiredPermissions)
  );
}

function isCurrentSettingsSection(pathname: string, section: SettingsSectionDefinition) {
  return pathname === section.to || pathname.startsWith(`${section.to}/`);
}

function renderSettingsChromeLink({
  section,
  pathname,
  useRouterLinks
}: {
  section: SettingsSectionDefinition;
  pathname: string;
  useRouterLinks: boolean;
}) {
  const isCurrent = isCurrentSettingsSection(pathname, section);

  if (useRouterLinks) {
    return (
      <Link
        className="app-shell-settings-popup__link"
        to={section.to}
        aria-current={isCurrent ? 'page' : undefined}
      >
        {section.label}
      </Link>
    );
  }

  return (
    <a
      className="app-shell-settings-popup__link"
      href={section.to}
      aria-current={isCurrent ? 'page' : undefined}
    >
      {section.label}
    </a>
  );
}

export function createSettingsChromeMenuItems({
  pathname,
  useRouterLinks,
  isRoot,
  permissions,
  includeAllWhenPermissionsUnknown = false
}: {
  pathname: string;
  useRouterLinks: boolean;
  isRoot: boolean;
  permissions: string[];
  includeAllWhenPermissionsUnknown?: boolean;
}): MenuProps['items'] {
  const sections = getVisibleSettingsSections({
    isRoot,
    permissions,
    includeAllWhenPermissionsUnknown
  });

  return [
    {
      key: 'settings',
      label: (
        <span className="app-shell-settings-block" aria-label="设置">
          <SettingOutlined />
        </span>
      ),
      popupClassName: 'app-shell-settings-popup',
      children: sections.map((section) => ({
        key: section.key,
        label: renderSettingsChromeLink({
          section,
          pathname,
          useRouterLinks
        })
      }))
    }
  ];
}
