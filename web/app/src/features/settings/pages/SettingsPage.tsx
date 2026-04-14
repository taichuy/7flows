import { useMemo } from 'react';

import { Navigate } from '@tanstack/react-router';
import { Result } from 'antd';

import { useAuthStore } from '../../../state/auth-store';
import { SectionPageLayout } from '../../../shared/ui/section-page-layout/SectionPageLayout';
import { ApiDocsPanel } from '../components/ApiDocsPanel';
import { MemberManagementPanel } from '../components/MemberManagementPanel';
import { RolePermissionPanel } from '../components/RolePermissionPanel';
import {
  getVisibleSettingsSections,
  type SettingsSectionKey
} from '../lib/settings-sections';

export function SettingsPage({
  requestedSectionKey
}: {
  requestedSectionKey?: SettingsSectionKey;
}) {
  const actor = useAuthStore((state) => state.actor);
  const me = useAuthStore((state) => state.me);
  const permissionSet = useMemo(() => new Set(me?.permissions ?? []), [me?.permissions]);
  const isRoot = actor?.effective_display_role === 'root';
  const canManageMembers = isRoot || permissionSet.has('user.manage.all');
  const canManageRoles = isRoot || permissionSet.has('role_permission.manage.all');
  const visibleSections = getVisibleSettingsSections({
    isRoot,
    permissions: me?.permissions ?? []
  });
  const fallbackSection = visibleSections[0];
  const activeSection = visibleSections.find((section) => section.key === requestedSectionKey);

  if (!fallbackSection) {
    return (
      <SectionPageLayout
        pageTitle="设置"
        pageDescription="系统管理域包含文档、成员和权限相关配置。"
        navItems={[]}
        activeKey=""
        emptyState={<Result status="info" title="当前账号暂无可访问内容" />}
      >
        {null}
      </SectionPageLayout>
    );
  }

  if (!requestedSectionKey || !activeSection) {
    return <Navigate to={fallbackSection.to} replace />;
  }

  return (
    <SectionPageLayout
      pageTitle="设置"
      pageDescription="系统管理域包含文档、成员和权限相关配置。"
      navItems={visibleSections}
      activeKey={activeSection.key}
    >
      <>
        {activeSection?.key === 'members' ? (
          <MemberManagementPanel
            canManageMembers={canManageMembers}
            canManageRoleBindings={canManageRoles}
          />
        ) : activeSection?.key === 'roles' ? (
          <RolePermissionPanel canManageRoles={canManageRoles} />
        ) : (
          <ApiDocsPanel />
        )}
      </>
    </SectionPageLayout>
  );
}
