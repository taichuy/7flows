"use client";

import type { ReactNode } from "react";
import { Tabs, Typography } from "antd";

import {
  WorkflowEditorNodeRuntimePanel,
  type WorkflowEditorNodeRuntimePanelProps
} from "@/components/workflow-editor-inspector-panels/workflow-editor-node-runtime-panel";
import {
  WorkflowEditorNodeSettingsPanel,
  type WorkflowEditorNodeSettingsPanelProps
} from "@/components/workflow-editor-inspector-panels/workflow-editor-node-settings-panel";
import { resolveWorkflowNodeTemplateDefinition } from "@/components/workflow-editor-inspector-panels/workflow-node-template-definition";

const { Text } = Typography;

type WorkflowEditorNodePanelTabKey =
  | "node-config"
  | "node-runtime"
  | "node-assistant";

export type WorkflowEditorNodePanelProps = {
  activeTabKey: WorkflowEditorNodePanelTabKey;
  activatedTabKeys: WorkflowEditorNodePanelTabKey[];
  settingsProps: WorkflowEditorNodeSettingsPanelProps;
  runtimeProps: WorkflowEditorNodeRuntimePanelProps;
  assistantPanel?: ReactNode | null;
  supportsAssistantTab?: boolean;
  onActiveTabChange: (key: WorkflowEditorNodePanelTabKey) => void;
};

function renderDeferredTabPanel(dataComponent: string, title: string, description: string) {
  return (
    <div className="workflow-editor-inspector-section" data-component={dataComponent}>
      <div className="workflow-editor-inspector-section-title">{title}</div>
      <Text type="secondary">{description}</Text>
    </div>
  );
}

export function WorkflowEditorNodePanel({
  activeTabKey,
  activatedTabKeys,
  settingsProps,
  runtimeProps,
  assistantPanel = null,
  supportsAssistantTab = false,
  onActiveTabChange
}: WorkflowEditorNodePanelProps) {
  const definition = resolveWorkflowNodeTemplateDefinition(settingsProps.node);
  const hasActivatedTab = (tabKey: WorkflowEditorNodePanelTabKey) =>
    activatedTabKeys.includes(tabKey);

  return (
    <div
      data-component="workflow-editor-node-panel"
      data-node-type={definition.nodeType}
    >
      <Tabs
        activeKey={activeTabKey}
        animated={{ inkBar: true, tabPane: false }}
        onChange={(key) => onActiveTabChange(key as WorkflowEditorNodePanelTabKey)}
        className="workflow-editor-inspector-tabs"
        items={[
          {
            key: "node-config",
            label: "设置",
            children: hasActivatedTab("node-config") ? (
              <WorkflowEditorNodeSettingsPanel {...settingsProps} />
            ) : (
              renderDeferredTabPanel(
                "workflow-editor-node-settings-panel-deferred",
                "设置",
                "只有切到设置标签时，才挂载节点模板和精简后的高级设置。"
              )
            )
          },
          {
            key: "node-runtime",
            label: "运行时",
            children: hasActivatedTab("node-runtime") ? (
              <WorkflowEditorNodeRuntimePanel {...runtimeProps} />
            ) : (
              renderDeferredTabPanel(
                "workflow-editor-node-runtime-panel-deferred",
                "运行时",
                "只有切到运行时标签时，才挂载节点当前的 runtime 摘要与 trigger 输入表单。"
              )
            )
          },
          ...(supportsAssistantTab
            ? [
                {
                  key: "node-assistant",
                  label: "AI",
                  children: assistantPanel
                }
              ]
            : [])
        ]}
      />
    </div>
  );
}
