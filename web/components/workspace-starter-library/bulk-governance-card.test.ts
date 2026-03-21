import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  WorkspaceStarterBulkActionResult,
  WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";

import { WorkspaceStarterBulkGovernanceCard } from "./bulk-governance-card";
import {
  buildBulkActionMessage,
  buildWorkspaceStarterBulkAffectedStarterTargets
} from "./shared";

describe("WorkspaceStarterBulkGovernanceCard", () => {
  it("renders sandbox dependency drift narrative for the latest bulk run", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-sandbox",
        workspace_id: "default",
        name: "Sandbox starter",
        description: "",
        business_track: "编排节点能力",
        default_workflow_name: "Sandbox starter",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-demo",
        created_from_workflow_version: "0.1.4",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T10:00:00Z"
      }
    ];
    const lastResult: WorkspaceStarterBulkActionResult = {
      workspace_id: "default",
      action: "refresh",
      requested_count: 2,
      updated_count: 1,
      skipped_count: 1,
      updated_items: [],
      deleted_items: [],
      skipped_items: [
        {
          template_id: "starter-manual",
          name: "Manual starter",
          reason: "no_source_workflow",
          detail: "Workspace starter has no source workflow."
        }
      ],
      skipped_reason_summary: [
        {
          reason: "no_source_workflow",
          count: 1,
          detail: "Workspace starter has no source workflow."
        }
      ],
      sandbox_dependency_changes: {
        template_count: 1,
        source_count: 1,
        added_count: 0,
        removed_count: 0,
        changed_count: 1
      },
      sandbox_dependency_items: [
        {
          template_id: "starter-sandbox",
          name: "Sandbox starter",
          source_workflow_id: "wf-demo",
          source_workflow_version: "0.1.5",
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"]
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterBulkGovernanceCard, {
        inScopeCount: 2,
        candidateCounts: {
          archive: 0,
          restore: 0,
          refresh: 2,
          rebase: 1,
          delete: 0
        },
        isMutating: false,
        lastResult,
        affectedStarterTargets: buildWorkspaceStarterBulkAffectedStarterTargets(lastResult, templates),
        selectedTemplateId: "starter-sandbox",
        onFocusTemplate: () => {},
        onAction: () => {}
      })
    );

    expect(html).toContain("last run: 刷新");
    expect(html).toContain("sandbox drift 1");
    expect(html).toContain("Sandbox drift:");
    expect(html).toContain("本次批量刷新涉及 1 个 starter、1 个 sandbox 依赖漂移节点");
    expect(html).toContain("Affected starters:");
    expect(html).toContain("Sandbox starter（sandbox）");
    expect(html).toContain("无来源 1");
    expect(html).toContain("Affected starter focus");
    expect(html).toContain("Sandbox starter · sandbox · drift 1 · source 0.1.5");
  });

  it("adds sandbox dependency drift summary into the bulk action message", () => {
    const message = buildBulkActionMessage({
      action: "rebase",
      updated_count: 2,
      skipped_count: 0,
      deleted_items: [],
      skipped_reason_summary: [],
      sandbox_dependency_changes: {
        template_count: 2,
        source_count: 2,
        added_count: 0,
        removed_count: 1,
        changed_count: 2
      },
      sandbox_dependency_items: [
        {
          template_id: "starter-a",
          name: "Starter A",
          source_workflow_id: "wf-a",
          source_workflow_version: "0.2.0",
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 0,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox"]
        },
        {
          template_id: "starter-b",
          name: "Starter B",
          source_workflow_id: "wf-b",
          source_workflow_version: "0.3.0",
          sandbox_dependency_changes: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 1,
            changed_count: 1
          },
          sandbox_dependency_nodes: ["sandbox", "auditor"]
        }
      ]
    });

    expect(message).toContain("已rebase 2 个模板");
    expect(message).toContain("涉及 2 个 starter / 3 个 sandbox 依赖漂移节点");
  });

  it("builds focus targets from bulk sandbox drift items", () => {
    const templates: WorkspaceStarterTemplateItem[] = [
      {
        id: "starter-a",
        workspace_id: "default",
        name: "Starter A",
        description: "",
        business_track: "应用新建编排",
        default_workflow_name: "Starter A",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-a",
        created_from_workflow_version: "0.2.0",
        archived: false,
        archived_at: null,
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T10:00:00Z"
      },
      {
        id: "starter-b",
        workspace_id: "default",
        name: "Starter B",
        description: "",
        business_track: "编排节点能力",
        default_workflow_name: "Starter B",
        workflow_focus: "",
        recommended_next_step: "",
        tags: [],
        definition: {
          nodes: [],
          edges: []
        },
        created_from_workflow_id: "wf-b",
        created_from_workflow_version: "0.3.0",
        archived: true,
        archived_at: "2026-03-21T11:00:00Z",
        created_at: "2026-03-21T10:00:00Z",
        updated_at: "2026-03-21T11:00:00Z"
      }
    ];

    const targets = buildWorkspaceStarterBulkAffectedStarterTargets(
      {
        sandbox_dependency_items: [
          {
            template_id: "starter-a",
            name: "Starter A",
            source_workflow_id: "wf-a",
            source_workflow_version: "0.2.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 1,
              changed_count: 1
            },
            sandbox_dependency_nodes: ["sandbox", "auditor"]
          },
          {
            template_id: "starter-b",
            name: "Starter B",
            source_workflow_id: "wf-b",
            source_workflow_version: "0.3.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 0,
              changed_count: 1
            },
            sandbox_dependency_nodes: []
          },
          {
            template_id: "starter-a",
            name: "Starter A duplicate",
            source_workflow_id: "wf-a",
            source_workflow_version: "0.2.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 0,
              changed_count: 1
            },
            sandbox_dependency_nodes: ["sandbox"]
          }
        ]
      },
      templates
    );

    expect(targets).toEqual([
      {
        templateId: "starter-a",
        name: "Starter A",
        sourceWorkflowVersion: "0.2.0",
        sandboxNodeSummary: "sandbox、auditor",
        driftNodeCount: 2,
        archived: false
      },
      {
        templateId: "starter-b",
        name: "Starter B",
        sourceWorkflowVersion: "0.3.0",
        sandboxNodeSummary: "未命名节点",
        driftNodeCount: 1,
        archived: true
      }
    ]);
  });
});
