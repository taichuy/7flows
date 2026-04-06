"use client";

import type { ReactNode } from "react";
import { Layout } from "antd";

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
  return (
    <Layout
      className={className}
      data-component={dataComponent}
      data-surface-layout={dataSurfaceLayout}
      hasSider
    >
      <Sider className="workflow-studio-shell-sider" theme="light" width={280}>
        {sidebar}
      </Sider>

      <Content className={contentClassName}>{children}</Content>
    </Layout>
  );
}
