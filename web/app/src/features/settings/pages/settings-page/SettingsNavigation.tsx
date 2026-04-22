import type { ReactNode } from 'react';

import type { SectionNavItem } from '../../../../shared/ui/section-page-layout/SectionPageLayout';
import { SectionPageLayout } from '../../../../shared/ui/section-page-layout/SectionPageLayout';

export const SETTINGS_PAGE_TITLE = '设置';
export const SETTINGS_PAGE_DESCRIPTION =
  '系统管理域包含文档、成员和权限相关配置。';

export function SettingsNavigation({
  activeKey,
  navItems,
  children
}: {
  activeKey: string;
  navItems: SectionNavItem[];
  children: ReactNode;
}) {
  return (
    <SectionPageLayout
      pageTitle={SETTINGS_PAGE_TITLE}
      pageDescription={SETTINGS_PAGE_DESCRIPTION}
      navItems={navItems}
      activeKey={activeKey}
      contentWidth="wide"
    >
      {children}
    </SectionPageLayout>
  );
}
