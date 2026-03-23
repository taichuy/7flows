import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceStarterSourceDiff } from "@/lib/get-workspace-starters";

import { WorkspaceStarterSourceDiffPanel } from "./source-diff-panel";

Object.assign(globalThis, { React });

describe("WorkspaceStarterSourceDiffPanel", () => {
  it("renders the shared source diff surface for operator review", () => {
    const sourceDiff: WorkspaceStarterSourceDiff = {
      template_id: "starter-a",
      workspace_id: "default",
      source_workflow_id: "wf-a",
      source_workflow_name: "Sandbox authoring",
      template_version: "0.1.0",
      source_version: "0.2.0",
      template_default_workflow_name: "Sandbox authoring",
      source_default_workflow_name: "Sandbox authoring",
      workflow_name_changed: false,
      changed: true,
      rebase_fields: ["definition", "created_from_workflow_version"],
      node_summary: {
        template_count: 1,
        source_count: 2,
        added_count: 1,
        removed_count: 0,
        changed_count: 0
      },
      edge_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 0
      },
      sandbox_dependency_summary: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1
      },
      action_decision: {
        recommended_action: "refresh",
        status_label: "建议 refresh",
        summary:
          "当前主要是 sandbox 依赖治理漂移。优先 refresh 同步最新 definition / version，并重点复核 dependencyMode、builtinPackageSet、dependencyRef 与 backendExtensions。",
        can_refresh: true,
        can_rebase: true,
        fact_chips: ["source 0.2.0", "sandbox drift 1", "rebase 2"]
      },
      node_entries: [
        {
          id: "node-sandbox",
          label: "Sandbox node",
          status: "added",
          changed_fields: ["config.timeout"],
          template_facts: [],
          source_facts: ["sandbox_code", "explicit execution"]
        }
      ],
      edge_entries: [],
      sandbox_dependency_entries: [
        {
          id: "sandbox-node",
          label: "sandbox_code",
          status: "changed",
          changed_fields: ["dependencyMode", "builtinPackageSet"],
          template_facts: ["host execution"],
          source_facts: ["strong isolation"]
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterSourceDiffPanel, {
        sourceDiff,
        isLoading: false,
        isRebasing: false,
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("Source drift detail");
    expect(html).toContain("Node changes");
    expect(html).toContain("Sandbox drift");
    expect(html).toContain("Suggested rebase fields");
    expect(html).toContain("建议 refresh");
    expect(html).toContain("definition");
    expect(html).toContain("created_from_workflow_version");
    expect(html).toContain("template 1 / source 2");
    expect(html).toContain("+1 / -0 / ~0");
    expect(html).toContain("Sandbox node");
    expect(html).toContain("config.timeout");
    expect(html).toContain("Added");
    expect(html).toContain("Changed");
    expect(html).toContain("Template snapshot");
    expect(html).toContain("Source workflow");
    expect(html).toContain("explicit execution");
    expect(html).toContain("dependencyMode");
    expect(html).toContain("strong isolation");
    expect(html).not.toContain("template facts");
    expect(html).not.toContain("source facts");
    expect(html).not.toContain("当前模板没有可用的 source diff");
  });
});
