import type { ReactNode } from 'react';

import { Grid, Typography } from 'antd';

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
  contentWidth?: 'wide' | 'narrow';
}

export function SectionPageLayout({
  pageTitle,
  navItems,
  activeKey,
  children,
  sidebarFooter,
  emptyState,
  contentWidth = 'wide'
}: SectionPageLayoutProps) {
  const screens = Grid.useBreakpoint();
  const visibleItems = navItems.filter((item) => item.visible !== false);
  const compactMode = !screens.lg;
  const compactVariant = visibleItems.length <= 4 ? 'tabs' : 'drawer';
  const layoutClassName = `section-page-layout section-page-layout--${contentWidth}`;

  return (
    <section className={layoutClassName} data-testid="section-page-layout">
      {visibleItems.length === 0 ? (
        <div className="section-page-layout__content">{emptyState ?? null}</div>
      ) : (
        <div className="section-page-layout__shell">
          {!compactMode ? (
            <aside className="section-page-layout__rail">
              {pageTitle ? (
                <Typography.Title level={4} style={{ padding: '0 24px', marginBottom: 24, marginTop: 0 }}>
                  {pageTitle}
                </Typography.Title>
              ) : null}
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
