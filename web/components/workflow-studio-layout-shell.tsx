"use client";

import { useState, type ReactNode } from "react";
import { Layout } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { Button } from "antd";

const { Content, Sider } = Layout;

type WorkflowStudioLayoutShellProps = {
  className: string;
  contentClassName: string;
  sidebar: ReactNode;
  children: ReactNode;
  dataComponent?: string;
  dataSurfaceLayout?: string;
};

export function WorkflowStudioLayoutShell({
  className,
  contentClassName,
  sidebar,
  children,
  dataComponent = "workflow-studio-shell",
  dataSurfaceLayout
}: WorkflowStudioLayoutShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <Layout
      className={className}
      data-component={dataComponent}
      data-surface-layout={dataSurfaceLayout}
      hasSider
    >
      <Sider
        className="workflow-studio-shell-sider"
        collapsed={collapsed}
        collapsedWidth={24}
        theme="light"
        trigger={null}
        width={280}
      >
        {collapsed ? (
          <div
            className="workflow-studio-shell-sider-collapsed"
            data-component="workflow-studio-shell-sider-collapsed"
          />
        ) : (
          <div className="workflow-studio-shell-sider-body">
            {sidebar}
          </div>
        )}

        <Button
          aria-label={collapsed ? "展开左侧栏" : "收起左侧栏"}
          className="workflow-studio-shell-sider-trigger"
          data-action={collapsed ? "expand-studio-sidebar" : "collapse-studio-sidebar"}
          icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
          onClick={() => setCollapsed((current) => !current)}
          type="text"
        />
      </Sider>

      <Content className={contentClassName}>{children}</Content>
    </Layout>
  );
}
