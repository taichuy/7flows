"use client";

import { memo } from "react";
import Link from "next/link";
import { Typography } from "antd";

import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";
import type { WorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import type {
  WorkflowStarterTemplate,
  WorkflowStarterTemplateId,
  WorkflowStarterTrackItem
} from "@/lib/workflow-starters";

const { Title, Text } = Typography;

type WorkflowCreateSignalItem = {
  label: string;
  value: string;
};

type WorkflowCreateFeaturedNode = {
  type: string;
  label: string;
  supportStatus: "available" | "planned";
};

type WorkflowCreateLauncherPanelProps = {
  activeTrack: WorkflowBusinessTrack;
  createSignalItems: WorkflowCreateSignalItem[];
  featuredNodes: WorkflowCreateFeaturedNode[];
  hasScopedWorkspaceStarterFilters: boolean;
  scopedGovernanceBackLinkLabel: string;
  scopedGovernanceDescription: string;
  selectedStarterId: WorkflowStarterTemplateId;
  starterGovernanceHref: string;
  starterTracks: WorkflowStarterTrackItem[];
  visibleStarters: WorkflowStarterTemplate[];
  onSelectStarter: (starterId: WorkflowStarterTemplateId) => void;
  onSelectTrack: (track: WorkflowBusinessTrack) => void;
};

function WorkflowCreateLauncherPanelComponent({
  activeTrack,
  createSignalItems,
  featuredNodes,
  hasScopedWorkspaceStarterFilters,
  scopedGovernanceBackLinkLabel,
  scopedGovernanceDescription,
  selectedStarterId,
  starterGovernanceHref,
  starterTracks,
  visibleStarters,
  onSelectStarter,
  onSelectTrack
}: WorkflowCreateLauncherPanelProps) {
  return (
    <div className="workflow-create-main-card" data-component="workflow-create-launcher-panel">
      <div className="workflow-create-shell-bar">
        <div className="workflow-create-shell-copy">
          <p className="workspace-eyebrow">Applications / Create</p>
          <Title level={3} style={{ margin: 0, color: "#111827" }}>
            创建一个应用
          </Title>
          <Text type="secondary">先选起点，再命名进入 Studio。</Text>

          <div className="workflow-create-step-row" aria-label="应用创建步骤">
            <span className="workflow-create-step-pill active">1 选模板</span>
            <span className="workflow-create-step-pill">2 命名并进入画布</span>
          </div>

          <div className="workflow-create-signal-row">
            {createSignalItems.map((item) => (
              <span className="workflow-create-signal-pill" key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </span>
            ))}
          </div>

          {featuredNodes.length > 0 ? (
            <div aria-label="常用节点入口">
              <div style={{ marginBottom: 8 }}>
                <Text strong>常用原生节点</Text>
                <br />
                <Text type="secondary">创建后直接继续插入这条作者主链，不必再从长说明里找节点。</Text>
              </div>
              <div className="workflow-create-signal-row">
                {featuredNodes.map((node) => (
                  <span className="workflow-create-fact-pill" key={node.type}>
                    {node.label}
                    {node.supportStatus === "available" ? "" : "（规划中）"}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {hasScopedWorkspaceStarterFilters ? (
            <div className="workflow-create-scoped-banner">
              <strong>Scoped governance</strong>
              <span>{scopedGovernanceDescription}</span>
              <Link href={starterGovernanceHref} className="workflow-create-inline-link">
                {scopedGovernanceBackLinkLabel}
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className="workflow-create-browser-card">
        <WorkflowStarterBrowser
          activeTrack={activeTrack}
          selectedStarterId={selectedStarterId}
          starters={visibleStarters}
          tracks={starterTracks}
          onSelectTrack={onSelectTrack}
          onSelectStarter={onSelectStarter}
        />
      </div>
    </div>
  );
}

export const WorkflowCreateLauncherPanel = memo(WorkflowCreateLauncherPanelComponent);
