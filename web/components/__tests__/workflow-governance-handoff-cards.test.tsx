import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowGovernanceHandoffCards } from "@/components/workflow-governance-handoff-cards";
import { buildLegacyPublishAuthWorkflowHandoff } from "@/lib/legacy-publish-auth-governance-presenters";
import { buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture } from "@/lib/workflow-publish-legacy-auth-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

function buildLegacyAuthHandoff() {
  return buildLegacyPublishAuthWorkflowHandoff(
    buildLegacyAuthGovernanceSinglePublishedBlockerSnapshotFixture({
      binding: {
        workflow_id: "workflow-1",
        workflow_name: "Governed Workflow"
      }
    }),
    "workflow-1"
  );
}

describe("WorkflowGovernanceHandoffCards", () => {
  it("renders separate catalog-gap and legacy-auth workflow links when both blockers coexist", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowGovernanceHandoffCards, {
        workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
        workflowCatalogGapDetail: "当前 workflow 仍有 catalog gap。",
        workflowCatalogGapHref: "/workflows/workflow-1?definition_issue=missing_tool",
        workflowGovernanceHref: "/workflows/workflow-1?definition_issue=legacy_publish_auth",
        legacyAuthHandoff: buildLegacyAuthHandoff()
      })
    );

    expect(html).toContain("Workflow governance");
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
    expect(html).toContain(
      'href="/workflows/workflow-1?definition_issue=legacy_publish_auth"'
    );
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });

  it("suppresses the current catalog-gap shortcut while keeping the legacy-auth handoff actionable", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowGovernanceHandoffCards, {
        workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
        workflowCatalogGapDetail: "当前 workflow 仍有 catalog gap。",
        workflowCatalogGapHref: "/workflows/workflow-1?definition_issue=missing_tool",
        workflowGovernanceHref: "/workflows/workflow-1?definition_issue=legacy_publish_auth",
        legacyAuthHandoff: buildLegacyAuthHandoff(),
        currentHref: "/workflows/workflow-1?definition_issue=missing_tool"
      })
    );

    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/workflows/workflow-1?definition_issue=missing_tool"');
    expect(html).toContain(
      'href="/workflows/workflow-1?definition_issue=legacy_publish_auth"'
    );
  });
});
