import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";

Object.assign(globalThis, { React });

describe("WorkflowStarterBrowser", () => {
  it("renders a compact starter list with selection state", () => {
    const props = {
      activeTrack: "应用新建编排",
      selectedStarterId: "starter-1",
      onSelectTrack: vi.fn(),
      onSelectStarter: vi.fn(),
      tracks: [
        {
          id: "应用新建编排",
          priority: "P0",
          focus: "登录 -> 工作台 -> 画布",
          summary: "先打通应用创建主链。",
          starterCount: 2
        }
      ],
      starters: [
        {
          id: "starter-1",
          name: "Blank Flow",
          description: "保留最小 trigger -> output 骨架。",
          businessTrack: "应用新建编排",
          priority: "P0",
          nodeLabels: ["Trigger", "Output"],
          nodeCount: 2,
          governedToolCount: 0,
          source: { shortLabel: "7Flows builtin" },
          sourceGovernance: null,
          sandboxGovernance: { dependencyModes: [], sandboxNodeCount: 0 },
          tags: ["starter"],
          trackSummary: "创建后直达 xyflow。"
        },
        {
          id: "starter-2",
          name: "Agent Flow",
          description: "内置一个 LLM Agent 节点。",
          businessTrack: "编排节点能力",
          priority: "P1",
          nodeLabels: ["Trigger", "LLM Agent", "Output"],
          nodeCount: 3,
          governedToolCount: 0,
          source: { shortLabel: "7Flows builtin" },
          sourceGovernance: { statusLabel: "建议 refresh" },
          sandboxGovernance: { dependencyModes: ["inline"], sandboxNodeCount: 0 },
          tags: ["agent"],
          trackSummary: "适合直接开始搭 Agent。"
        }
      ]
    } as any;

    const html = renderToStaticMarkup(
      createElement(WorkflowStarterBrowser, props)
    );

    expect(html).toContain("starter-browser-list-shell");
    expect(html).toContain("选择模板");
    expect(html).toContain("starter-list-row selected");
    expect(html).toContain("当前模板");
    expect(html).toContain("选中后在右侧创建");
  });
});
