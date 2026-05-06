import { useNavigate } from '@tanstack/react-router';
import { Menu } from 'antd';

import { useAuthStore } from '../state/auth-store';
import {
  createAccountMenuClickHandler,
  selectAccountLabel
} from './account-menu-actions';
import { createAccountMenuItems } from './account-menu-items';

interface AccountMenuBaseProps {
  navigateTo: (path: '/me' | '/sign-in') => Promise<void> | void;
}

function AccountMenuBase({ navigateTo }: AccountMenuBaseProps) {
  const { csrfToken, actor, me, setAnonymous } = useAuthStore();
  const accountLabel = selectAccountLabel({ me, actor });
  const handleClick = createAccountMenuClickHandler({
    csrfToken,
    setAnonymous,
    navigateTo
  });

  return (
    <Menu
      className="app-shell-account-menu"
      mode="horizontal"
      selectable={false}
      items={createAccountMenuItems(accountLabel)}
      onClick={handleClick}
      disabledOverflow
    />
  );
}

function RoutedAccountMenu() {
  const navigate = useNavigate();

  return (
    <AccountMenuBase
      navigateTo={(path) => navigate({ to: path })}
    />
  );
}

function StaticAccountMenu() {
  return (
    <AccountMenuBase
      navigateTo={(path) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }}
    />
  );
}

export function AccountMenu({
  useRouterNavigation = false
}: {
  useRouterNavigation?: boolean;
}) {
  return useRouterNavigation ? <RoutedAccountMenu /> : <StaticAccountMenu />;
}
