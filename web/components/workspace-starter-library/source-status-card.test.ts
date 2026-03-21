import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";

import { WorkspaceStarterSourceCard } from "./source-status-card";

Object.assign(globalThis, { React });

describe("WorkspaceStarterSourceCard", () => {
  it("renders shared source governance follow-up without waiting for source workflow fetch", () => {
    const template: WorkspaceStarterTemplateItem = {
      id: "starter-1",
      workspace_id: "default",
      name: "Governed Workspace Starter",
      description: "Starter with shared source governance.",
      business_track: "应用新建编排",
      default_workflow_name: "Governed Workflow",
      workflow_focus: "Keep governance aligned.",
      recommended_next_step: "Review the follow-up before refreshing.",
      tags: ["workspace starter"],
      definition: {
        nodes: [
          { id: "trigger", type: "trigger", name: "Trigger", config: {} },
          { id: "output", type: "output", name: "Output", config: {} }
        ],
        edges: [{ id: "e1", sourceNodeId: "trigger", targetNodeId: "output" }],
        variables: [],
        publish: []
      },
      created_from_workflow_id: "wf-demo",
      created_from_workflow_version: "0.1.0",
      archived: false,
      archived_at: null,
      created_at: "2026-03-21T12:00:00Z",
      updated_at: "2026-03-21T12:30:00Z",
      source_governance: {
        kind: "drifted",
        status_label: "建议 refresh",
        summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。",
        source_workflow_id: "wf-demo",
        source_workflow_name: "Demo Workflow",
        template_version: "0.1.0",
        source_version: "0.2.0",
        action_decision: {
          recommended_action: "refresh",
          status_label: "建议 refresh",
          summary: "优先 refresh 同步最新 definition / version。",
          can_refresh: true,
          can_rebase: true,
          fact_chips: ["template 0.1.0", "source 0.2.0"]
        },
        outcome_explanation: {
          primary_signal: "来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。",
          follow_up: "优先 refresh 同步最新 definition / version。"
        }
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceCard, {
        template,
        sourceGovernance: template.source_governance ?? null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("建议 refresh");
    expect(html).toContain("来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。");
    expect(html).toContain("优先 refresh 同步最新 definition / version。");
    expect(html).toContain("template 0.1.0");
    expect(html).toContain("source 0.2.0");
    expect(html).toContain("Demo Workflow");
    expect(html).toContain("Review the follow-up before refreshing.");
  });
});
