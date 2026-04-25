import { Tabs } from 'antd';
import type { ReactNode } from 'react';

export type DebugConsoleTabKey = 'conversation' | 'trace' | 'variables';

export interface DebugConsoleTabItem {
  key: DebugConsoleTabKey;
  label: string;
  children: ReactNode;
}

export function DebugConsoleTabs({
  activeKey,
  items,
  onChange
}: {
  activeKey: DebugConsoleTabKey;
  items: DebugConsoleTabItem[];
  onChange: (key: DebugConsoleTabKey) => void;
}) {
  return (
    <Tabs
      activeKey={activeKey}
      className="agent-flow-editor__debug-console-tabs"
      items={items}
      onChange={(key) => onChange(key as DebugConsoleTabKey)}
    />
  );
}
