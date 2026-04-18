import type { PropsWithChildren } from 'react';

import { AppShell } from '@1flowbase/ui';
import { Link } from '@tanstack/react-router';
import { Space } from 'antd';

import { AccountMenu } from './AccountMenu';
import { Navigation } from './Navigation';
import { getSecondaryChromeRoutes } from '../routes/route-helpers';
import './app-shell.css';

function renderActionLink(
  pathname: string,
  label: string,
  useRouterLinks: boolean,
  isCurrent: boolean
) {
  if (useRouterLinks) {
    return (
      <Link
        to={pathname}
        className="app-shell-menu-link"
        aria-current={isCurrent ? 'page' : undefined}
      >
        {label}
      </Link>
    );
  }

  return (
    <a
      href={pathname}
      className="app-shell-menu-link"
      aria-current={isCurrent ? 'page' : undefined}
    >
      {label}
    </a>
  );
}

export function AppShellFrame({
  children,
  pathname = '/',
  useRouterLinks = false
}: PropsWithChildren<{ pathname?: string; useRouterLinks?: boolean }>) {
  const secondaryActions = getSecondaryChromeRoutes();

  return (
    <AppShell
      title="1flowbase"
      navigation={<Navigation pathname={pathname} useRouterLinks={useRouterLinks} />}
      actions={
        <Space size={20}>
          {secondaryActions.map((route) => (
            <span key={route.id}>
              {renderActionLink(
                route.path,
                route.navLabel!,
                useRouterLinks,
                route.selectedMatchers.some((match) => match(pathname))
              )}
            </span>
          ))}
          <AccountMenu useRouterNavigation={useRouterLinks} />
        </Space>
      }
    >
      {children}
    </AppShell>
  );
}
