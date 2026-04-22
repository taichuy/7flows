import { ApiDocsPanel } from '../../components/ApiDocsPanel';
import { MemberManagementPanel } from '../../components/MemberManagementPanel';
import { RolePermissionPanel } from '../../components/RolePermissionPanel';
import { SystemRuntimePanel } from '../../components/SystemRuntimePanel';
import type { SettingsSectionKey } from '../../lib/settings-sections';
import { SettingsModelProvidersSection } from './SettingsModelProvidersSection';

export function SettingsSectionBody({
  sectionKey,
  canManageMembers,
  canManageRoles,
  canManageModelProviders
}: {
  sectionKey: SettingsSectionKey;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canManageModelProviders: boolean;
}) {
  switch (sectionKey) {
    case 'members':
      return (
        <MemberManagementPanel
          canManageMembers={canManageMembers}
          canManageRoleBindings={canManageRoles}
        />
      );
    case 'system-runtime':
      return <SystemRuntimePanel />;
    case 'model-providers':
      return (
        <SettingsModelProvidersSection canManage={canManageModelProviders} />
      );
    case 'roles':
      return <RolePermissionPanel canManageRoles={canManageRoles} />;
    case 'docs':
    default:
      return <ApiDocsPanel />;
  }
}
