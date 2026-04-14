import { useState } from 'react';

import { Link } from '@tanstack/react-router';
import { Button, Drawer, Menu, Tabs } from 'antd';
import type { MenuProps, TabsProps } from 'antd';

import type { SectionNavItem } from './SectionPageLayout';

interface SectionSidebarNavProps {
  navItems: SectionNavItem[];
  activeKey: string;
  compactMode: boolean;
  compactVariant: 'tabs' | 'drawer';
}

function createMenuItems(navItems: SectionNavItem[]): MenuProps['items'] {
  return navItems.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: (
      <Link className="section-page-layout__nav-link" to={item.to}>
        {item.label}
      </Link>
    )
  }));
}

function createTabItems(navItems: SectionNavItem[]): TabsProps['items'] {
  return navItems.map((item) => ({
    key: item.key,
    label: (
      <Link className="section-page-layout__nav-link" to={item.to}>
        {item.label}
      </Link>
    )
  }));
}

export function SectionSidebarNav({
  navItems,
  activeKey,
  compactMode,
  compactVariant
}: SectionSidebarNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (navItems.length === 0) {
    return null;
  }

  const menuItems = createMenuItems(navItems);

  if (!compactMode) {
    return (
      <nav aria-label="Section navigation" className="section-page-layout__nav">
        <Menu mode="inline" selectedKeys={[activeKey]} items={menuItems} />
      </nav>
    );
  }

  if (compactVariant === 'tabs') {
    return (
      <div className="section-page-layout__mobile-tabs">
        <Tabs activeKey={activeKey} items={createTabItems(navItems)} />
      </div>
    );
  }

  return (
    <div className="section-page-layout__drawer-trigger">
      <Button type="default" onClick={() => setDrawerOpen(true)}>
        更多分区
      </Button>
      <Drawer
        title="更多分区"
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      >
        <nav aria-label="Section navigation" className="section-page-layout__nav">
          <Menu mode="inline" selectedKeys={[activeKey]} items={menuItems} />
        </nav>
      </Drawer>
    </div>
  );
}
