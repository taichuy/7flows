import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceStarterDefinitionSnapshotPanel } from "./definition-snapshot-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterDefinitionSnapshotPanel", () => {
  it("shows the shared follow-up card when no starter is selected", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterDefinitionSnapshotPanel, {
        selectedTemplate: null,
        selectedTemplateSandboxGovernance: {
          sandboxNodeCount: 0,
          explicitExecutionCount: 0,
          executionClasses: [],
          dependencyModes: [],
          dependencyModeCounts: {},
          builtinPackageSets: [],
          dependencyRefs: [],
          backendExtensionNodeCount: 0,
          backendExtensionKeys: [],
          nodes: []
        },
        selectedTemplateToolGovernance: {
          referencedToolIds: [],
          referencedTools: [],
          missingToolIds: [],
          governedToolCount: 0,
          strongIsolationToolCount: 0
        },
        sourceGovernance: null,
        sourceDiff: null,
        isLoadingSourceDiff: false,
        isRefreshing: false,
        isRebasing: false,
        createWorkflowHref: "/workflows/new?needs_follow_up=true&source_governance_kind=drifted",
        onRefresh: vi.fn(),
        onRebase: vi.fn()
      })
    );

    expect(html).toContain("当前没有可预览的模板定义。");
    expect(html).toContain("Recommended next step");
    expect(html).toContain("当前筛选条件下还没有可继续治理的 workspace starter。");
    expect(html).toContain("去创建第一个 starter");
    expect(html).toContain(
      "/workflows/new?needs_follow_up=true&amp;source_governance_kind=drifted"
    );
  });
});
