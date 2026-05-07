import { Menu } from 'antd';

import { useAuthStore } from '../state/auth-store';
import { createSettingsChromeMenuItems } from './settings-chrome-menu-items';

export function SettingsChromeMenu({
  pathname,
  useRouterLinks
}: {
  pathname: string;
  useRouterLinks: boolean;
}) {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const isRoot = actor?.effective_display_role === 'root';
  const permissions = me?.permissions ?? [];

  return (
    <Menu
      className="app-shell-settings-menu"
      mode="horizontal"
      selectable={false}
      selectedKeys={
        pathname === '/settings' || pathname.startsWith('/settings/') ? ['settings'] : []
      }
      items={createSettingsChromeMenuItems({
        pathname,
        useRouterLinks,
        isRoot,
        permissions,
        includeAllWhenPermissionsUnknown: me === null
      })}
      disabledOverflow
    />
  );
}
