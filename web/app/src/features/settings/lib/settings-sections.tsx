import type { SectionNavItem } from '../../../shared/ui/section-page-layout/SectionPageLayout';

export type SettingsSectionKey =
  | 'docs'
  | 'system-runtime'
  | 'model-providers'
  | 'members'
  | 'roles';

export interface SettingsSectionNavItem extends SectionNavItem {
  key: SettingsSectionKey;
}

export interface SettingsSectionDefinition extends SettingsSectionNavItem {
  requiredPermissions: string[];
}

export const settingsSectionDefinitions: SettingsSectionDefinition[] = [
  {
    key: 'docs',
    label: 'API 文档',
    to: '/settings/docs',
    requiredPermissions: ['api_reference.view.all']
  },
  {
    key: 'system-runtime',
    label: '系统运行',
    to: '/settings/system-runtime',
    requiredPermissions: ['system_runtime.view.all']
  },
  {
    key: 'model-providers',
    label: '模型供应商',
    to: '/settings/model-providers',
    requiredPermissions: [
      'state_model.view.all',
      'state_model.view.own',
      'state_model.manage.all',
      'state_model.manage.own'
    ]
  },
  {
    key: 'members',
    label: '用户管理',
    to: '/settings/members',
    requiredPermissions: ['user.view.all']
  },
  {
    key: 'roles',
    label: '权限管理',
    to: '/settings/roles',
    requiredPermissions: ['role_permission.view.all']
  }
];
