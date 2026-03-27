import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowLibraryLegacyAuthGovernanceCard } from "@/components/workflow-library-legacy-auth-governance-card";
import {
  buildLegacyAuthGovernancePublishedFollowUpChecklistFixture,
  buildLegacyAuthGovernanceSnapshotFixture
} from "@/lib/workflow-publish-legacy-auth-test-fixtures";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkflowLibraryLegacyAuthGovernanceCard", () => {
  it("keeps shared workflow governance handoff visible for mixed legacy-auth workflows", () => {
    const html = renderToStaticMarkup(
      <WorkflowLibraryLegacyAuthGovernanceCard
        snapshot={buildLegacyAuthGovernanceSnapshotFixture({
          workflow_count: 1,
          binding_count: 2,
          summary: {
            draft_candidate_count: 0,
            published_blocker_count: 1,
            offline_inventory_count: 1
          },
          checklist: [
            buildLegacyAuthGovernancePublishedFollowUpChecklistFixture({
              workflow_name: "Mixed Governance workflow"
            })
          ],
          workflows: [
            {
              workflow_id: "workflow-mixed",
              workflow_name: "Mixed Governance workflow",
              binding_count: 2,
              draft_candidate_count: 0,
              published_blocker_count: 1,
              offline_inventory_count: 1,
              tool_governance: {
                referenced_tool_ids: ["native.catalog-gap", "native.available"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 2,
                strong_isolation_tool_count: 1
              }
            }
          ],
          buckets: {
            draft_candidates: [],
            published_blockers: [],
            offline_inventory: []
          }
        })}
        workflowDetailHrefsById={{
          "workflow-mixed": "/workflows/workflow-mixed?definition_issue=legacy_publish_auth"
        }}
        workflowLibraryFilterHref="/workflows?definition_issue=legacy_publish_auth"
      />
    );

    expect(html).toContain("Workflow handoff");
    expect(html).toContain("Mixed Governance workflow");
    expect(html).toContain("Workflow governance");
    expect(html).toContain("Legacy publish auth handoff");
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("2 legacy bindings");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain(
      "当前 workflow 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回 workflow 编辑器补齐 binding / LLM Agent tool policy，再继续对齐 publish auth contract，避免同一 workflow 的治理事实被拆到两张卡里。"
    );
    expect(html).toContain(
      "当前 workflow 仍有 0 条 draft cleanup、1 条 published blocker、1 条 offline inventory。"
    );
    expect(html).toContain('/workflows/workflow-mixed?definition_issue=missing_tool');
    expect(html).toContain('/workflows/workflow-mixed?definition_issue=legacy_publish_auth');
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });

  it("returns no markup when the snapshot has no legacy-auth backlog", () => {
    const html = renderToStaticMarkup(
      <WorkflowLibraryLegacyAuthGovernanceCard
        snapshot={buildLegacyAuthGovernanceSnapshotFixture({
          workflow_count: 0,
          binding_count: 0,
          summary: {
            draft_candidate_count: 0,
            published_blocker_count: 0,
            offline_inventory_count: 0
          },
          checklist: [],
          workflows: [],
          buckets: {
            draft_candidates: [],
            published_blockers: [],
            offline_inventory: []
          }
        })}
        workflowDetailHrefsById={{}}
        workflowLibraryFilterHref="/workflows?definition_issue=legacy_publish_auth"
      />
    );

    expect(html).toBe("");
  });
});
