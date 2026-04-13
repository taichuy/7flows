import { ConfigProvider, Layout, Typography, theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import type { PropsWithChildren, ReactNode } from 'react';

const { Header, Content } = Layout;

export const emeraldLightTheme: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#00d992',
    colorSuccess: '#19b36b',
    colorWarning: '#ffba00',
    colorError: '#fb565b',
    colorInfo: '#2bb9b1',
    colorBgBase: '#f4f8f5',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#fcfffd',
    colorText: '#16211d',
    colorTextSecondary: '#55645d',
    colorTextTertiary: '#7b8982',
    colorBorder: '#d5ddd8',
    colorBorderSecondary: '#e7ede9',
    colorFillSecondary: '#f2f6f3',
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 32,
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    boxShadowSecondary: '0 18px 50px rgba(15, 23, 20, 0.08)'
  },
  components: {
    Layout: {
      headerBg: 'transparent',
      bodyBg: 'transparent'
    },
    Card: {
      headerBg: 'transparent'
    }
  }
};

export function AppThemeProvider({ children }: PropsWithChildren) {
  return <ConfigProvider theme={emeraldLightTheme}>{children}</ConfigProvider>;
}

export interface AppShellProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  navigation?: ReactNode;
}

export function AppShell({ title, subtitle, navigation, children }: AppShellProps) {
  return (
    <Layout className="app-shell">
      <Header className="app-shell-header">
        <div className="app-shell-brand">
          <span className="app-shell-signal" aria-hidden="true" />
          <div className="app-shell-brand-copy">
            <Typography.Text className="app-shell-kicker">
              1Flowse mock workspace
            </Typography.Text>
            <Typography.Title level={3} className="app-shell-title">
              {title}
            </Typography.Title>
            {subtitle ? (
              <Typography.Text className="app-shell-subtitle">
                {subtitle}
              </Typography.Text>
            ) : null}
          </div>
        </div>
        <div className="app-shell-nav">{navigation}</div>
      </Header>
      <Content className="app-shell-content">{children}</Content>
    </Layout>
  );
}
