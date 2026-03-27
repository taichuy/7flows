import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowPublishLifecycleForm } from "@/components/workflow-publish-lifecycle-form";
import type { UpdatePublishedEndpointLifecycleState } from "@/app/actions/publish";

type MockActionState = Record<string, unknown>;

let actionStateQueue: MockActionState[] = [];

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: () => [actionStateQueue.shift() ?? { status: "idle", message: "" }, vi.fn()]
  };
});

vi.mock("react-dom", async () => {
  const actual = await vi.importActual<typeof import("react-dom")>("react-dom");
  return {
    ...actual,
    useFormStatus: () => ({ pending: false })
  };
});

describe("WorkflowPublishLifecycleForm", () => {
  beforeEach(() => {
    actionStateQueue = [];
  });

  it("disables publish action when binding still has a blocking legacy auth issue", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishLifecycleForm, {
        workflowId: "workflow-1",
        bindingId: "binding-1",
        currentStatus: "draft",
        issues: [
          {
            category: "unsupported_auth_mode",
            message: "Legacy token auth is still persisted on this binding.",
            remediation: "Switch back to api_key or internal before publishing.",
            blocks_lifecycle_publish: true
          }
        ],
        action: async (state: UpdatePublishedEndpointLifecycleState) => state
      })
    );

    expect(html).toContain("Legacy token auth is still persisted on this binding.");
    expect(html).toContain("Switch back to api_key or internal before publishing.");
    expect(html).toContain("发布 endpoint");
    expect(html).toContain('<button class="sync-button" type="submit" disabled="">');
  });

  it("keeps offline action available even if the binding reports legacy auth issues", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishLifecycleForm, {
        workflowId: "workflow-1",
        bindingId: "binding-1",
        currentStatus: "published",
        issues: [
          {
            category: "unsupported_auth_mode",
            message: "Legacy token auth is still persisted on this binding.",
            remediation: "Switch back to api_key or internal before publishing.",
            blocks_lifecycle_publish: true
          }
        ],
        action: async (state: UpdatePublishedEndpointLifecycleState) => state
      })
    );

    expect(html).toContain("下线 endpoint");
    expect(html).toContain('<button class="sync-button" type="submit">');
  });

  it("renders shared workflow governance handoff when lifecycle publish stays blocked", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPublishLifecycleForm, {
        workflowId: "workflow-1",
        bindingId: "binding-1",
        currentStatus: "draft",
        issues: [
          {
            category: "unsupported_auth_mode",
            message: "Legacy token auth is still persisted on this binding.",
            remediation: "Switch back to api_key or internal before publishing.",
            blocks_lifecycle_publish: true
          }
        ],
        workflowGovernanceHandoff: {
          workflowId: "workflow-1",
          workflowGovernanceHref:
            "/workflows/workflow-1?definition_issue=legacy_publish_auth",
          workflowCatalogGapHref: "/workflows/workflow-1?definition_issue=missing_tool",
          workflowCatalogGapSummary: "catalog gap · native.catalog-gap",
          workflowCatalogGapDetail:
            "当前 publish lifecycle action 对应的 workflow 版本仍有 catalog gap（native.catalog-gap）；先回到 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续执行当前 lifecycle preflight。",
          legacyAuthHandoff: {
            bindingChipLabel: "1 legacy bindings",
            statusChipLabel: "publish auth blocker",
            detail:
              "当前 workflow 仍有 1 条 draft cleanup、1 条 published blocker、0 条 offline inventory。",
            workflowSummary: {
              workflow_id: "workflow-1",
              workflow_name: "Demo workflow",
              binding_count: 1,
              draft_candidate_count: 1,
              published_blocker_count: 1,
              offline_inventory_count: 0,
              tool_governance: {
                referenced_tool_ids: ["native.catalog-gap"],
                missing_tool_ids: ["native.catalog-gap"],
                governed_tool_count: 1,
                strong_isolation_tool_count: 0
              }
            }
          }
        },
        action: async (state: UpdatePublishedEndpointLifecycleState) => state
      })
    );

    expect(html).toContain("Workflow handoff");
    expect(html).toContain(
      "当前 lifecycle preflight 也直接复用 shared workflow governance handoff"
    );
    expect(html).toContain("catalog gap · native.catalog-gap");
    expect(html).toContain("publish auth blocker");
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
    expect(html).toContain("回到 workflow 编辑器处理 publish auth contract");
  });
});
