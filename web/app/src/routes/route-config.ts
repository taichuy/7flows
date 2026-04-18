import type { AppRouteId } from '@1flowbase/shared-types';

export interface AppRouteDefinition {
  id: AppRouteId;
  path: string;
  navLabel: string | null;
  chromeSlot: 'primary' | 'secondary' | 'hidden';
  selectedMatchers: Array<(pathname: string) => boolean>;
  permissionKey: string | null;
  guard: 'public-only' | 'session-required';
}

export const APP_ROUTES: AppRouteDefinition[] = [
  {
    id: 'home',
    path: '/',
    navLabel: '工作台',
    chromeSlot: 'primary',
    selectedMatchers: [(pathname) => pathname === '/'],
    permissionKey: 'route_page.view.all',
    guard: 'session-required'
  },
  {
    id: 'application-detail',
    path: '/applications',
    navLabel: null,
    chromeSlot: 'hidden',
    selectedMatchers: [(pathname) => /^\/applications\/[^/]+(\/|$)/.test(pathname)],
    permissionKey: 'route_page.view.all',
    guard: 'session-required'
  },
  {
    id: 'embedded-apps',
    path: '/embedded-apps',
    navLabel: '子系统',
    chromeSlot: 'primary',
    selectedMatchers: [(pathname) => pathname.startsWith('/embedded-apps')],
    permissionKey: 'embedded_app.view.all',
    guard: 'session-required'
  },
  {
    id: 'tools',
    path: '/tools',
    navLabel: '工具',
    chromeSlot: 'primary',
    selectedMatchers: [(pathname) => pathname.startsWith('/tools')],
    permissionKey: 'route_page.view.all',
    guard: 'session-required'
  },
  {
    id: 'settings',
    path: '/settings',
    navLabel: '设置',
    chromeSlot: 'secondary',
    selectedMatchers: [(pathname) => pathname === '/settings' || pathname.startsWith('/settings/')],
    permissionKey: null,
    guard: 'session-required'
  },
  {
    id: 'me',
    path: '/me',
    navLabel: null,
    chromeSlot: 'hidden',
    selectedMatchers: [(pathname) => pathname === '/me' || pathname.startsWith('/me/')],
    permissionKey: null,
    guard: 'session-required'
  },
  {
    id: 'sign-in',
    path: '/sign-in',
    navLabel: null,
    chromeSlot: 'hidden',
    selectedMatchers: [(pathname) => pathname.startsWith('/sign-in')],
    permissionKey: null,
    guard: 'public-only'
  }
];

export function getSelectedRouteId(pathname: string): AppRouteId {
  const matchedRouteId =
    APP_ROUTES.find((route) => route.selectedMatchers.some((match) => match(pathname)))?.id ??
    'home';

  return matchedRouteId === 'application-detail' ? 'home' : matchedRouteId;
}
