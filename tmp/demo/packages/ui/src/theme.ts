import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

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
