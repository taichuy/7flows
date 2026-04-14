import type { ReactNode } from 'react';

import { Grid, Space, Typography } from 'antd';

import { SectionSidebarNav } from './SectionSidebarNav';
import './section-page-layout.css';

export interface SectionNavItem {
  key: string;
  label: string;
  to: string;
  icon?: ReactNode;
  group?: string;
  visible?: boolean;
}

export interface SectionPageLayoutProps {
  pageTitle?: ReactNode;
  pageDescription?: ReactNode;
  navItems: SectionNavItem[];
  activeKey: string;
  children: ReactNode;
  sidebarFooter?: ReactNode;
  emptyState?: ReactNode;
}

export function SectionPageLayout({
  pageTitle,
  pageDescription,
  navItems,
  activeKey,
  children,
  sidebarFooter,
  emptyState
}: SectionPageLayoutProps) {
  const screens = Grid.useBreakpoint();
  const visibleItems = navItems.filter((item) => item.visible !== false);
  const compactMode = !screens.lg;
  const compactVariant = visibleItems.length <= 4 ? 'tabs' : 'drawer';

  return (
    <section className="section-page-layout">
      {pageTitle || pageDescription ? (
        <header className="section-page-layout__header">
          <Space direction="vertical" size={4}>
            {pageTitle ? <Typography.Title level={2}>{pageTitle}</Typography.Title> : null}
            {pageDescription ? (
              <Typography.Paragraph>{pageDescription}</Typography.Paragraph>
            ) : null}
          </Space>
        </header>
      ) : null}

      {visibleItems.length === 0 ? (
        <div className="section-page-layout__content">{emptyState ?? null}</div>
      ) : (
        <div className="section-page-layout__shell">
          {!compactMode ? (
            <aside className="section-page-layout__rail">
              <SectionSidebarNav
                navItems={visibleItems}
                activeKey={activeKey}
                compactMode={false}
                compactVariant={compactVariant}
              />
              {sidebarFooter ? (
                <div className="section-page-layout__footer">{sidebarFooter}</div>
              ) : null}
            </aside>
          ) : null}

          <div className="section-page-layout__content">
            {compactMode ? (
              <SectionSidebarNav
                navItems={visibleItems}
                activeKey={activeKey}
                compactMode
                compactVariant={compactVariant}
              />
            ) : null}
            {children}
          </div>
        </div>
      )}
    </section>
  );
}
