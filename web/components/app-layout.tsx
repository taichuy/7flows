"use client";

import React from "react";
import { Layout, Menu, ConfigProvider } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { shouldBypassGlobalAppLayout } from "@/lib/app-layout";
import { 
  AppstoreOutlined, 
  RocketOutlined, 
  SafetyCertificateOutlined, 
  ToolOutlined,
  SettingOutlined
} from "@ant-design/icons";

const { Header, Content } = Layout;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (shouldBypassGlobalAppLayout(pathname)) {
    return <>{children}</>;
  }

  const menuItems = [
    {
      key: "/",
      icon: <AppstoreOutlined />,
      label: <Link href="/">概览</Link>,
    },
    {
      key: "/workflows",
      icon: <RocketOutlined />,
      label: <Link href="/workflows">应用工作室</Link>,
    },
    {
      key: "/workspace-starters",
      icon: <ToolOutlined />,
      label: <Link href="/workspace-starters">团队模板</Link>,
    },
    {
      key: "/runs",
      icon: <SettingOutlined />,
      label: <Link href="/runs">运行日志</Link>,
    },
    {
      key: "/sensitive-access",
      icon: <SafetyCertificateOutlined />,
      label: <Link href="/sensitive-access">敏感访问</Link>,
    }
  ];

  // Map sub-paths to main tabs to keep them highlighted
  const selectedKey = 
    pathname.startsWith("/workflows") ? "/workflows" :
    pathname.startsWith("/workspace-starters") ? "/workspace-starters" :
    pathname.startsWith("/runs") ? "/runs" :
    pathname.startsWith("/sensitive-access") ? "/sensitive-access" :
    "/";

  return (
    <ConfigProvider theme={{
      token: {
        colorPrimary: '#1C64F2', // Dify style blue
        borderRadius: 8,
        fontFamily: '"Inter", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      },
      components: {
        Layout: {
          headerBg: '#ffffff',
          bodyBg: '#f3f4f6', // Dify gray background
        }
      }
    }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid #e5e7eb',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          height: '56px',
          lineHeight: '56px'
        }}>
          {/* Left Side: Logo & Workspace */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            flex: 1,
            minWidth: 0
          }}>
            <div style={{ 
              fontSize: '18px', 
              fontWeight: 600, 
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer'
            }}>
              <div style={{ width: 28, height: 28, background: '#1C64F2', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                7F
              </div>
              <span style={{ fontSize: '16px' }}>7Flows</span>
            </div>
            <div style={{ margin: '0 12px', color: '#D1D5DB', fontWeight: 300 }}>/</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#374151', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', transition: 'background 0.2s' }}>
              默认团队
            </div>
          </div>

          {/* Middle: Navigation */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <Menu
              mode="horizontal"
              selectedKeys={[selectedKey]}
              items={menuItems}
              style={{ 
                borderBottom: 'none', 
                minWidth: 400, 
                justifyContent: 'center',
                lineHeight: '56px'
              }}
            />
          </div>

          {/* Right Side: User Profile / Settings */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flex: 1, minWidth: 0, gap: '16px' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid #E5E7EB' }}>
              <SettingOutlined style={{ color: '#6B7280' }} />
            </div>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E0E7FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', cursor: 'pointer' }}>
              U
            </div>
          </div>
        </Header>
        <Content style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
          {children}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
