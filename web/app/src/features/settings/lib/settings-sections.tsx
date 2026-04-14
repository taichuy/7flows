import type { SectionNavItem } from '../../../shared/ui/section-page-layout/SectionPageLayout';

export type SettingsSectionKey = 'docs' | 'members' | 'roles';

export function getVisibleSettingsSections(input: {
  isRoot: boolean;
  permissions: string[];
}): SectionNavItem[] {
  return [
    {
      key: 'docs',
      label: 'API 文档',
      to: '/settings/docs',
      visible: input.isRoot || input.permissions.includes('api_reference.view.all')
    },
    {
      key: 'members',
      label: '用户管理',
      to: '/settings/members',
      visible: input.isRoot || input.permissions.includes('user.view.all')
    },
    {
      key: 'roles',
      label: '权限管理',
      to: '/settings/roles',
      visible: input.isRoot || input.permissions.includes('role_permission.view.all')
    }
  ].filter((item) => item.visible !== false);
}
