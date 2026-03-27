import { describe, expect, it } from "vitest";

import type { WorkflowDetail } from "@/lib/get-workflows";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import { summarizeWorkspaceStarterSourceStatus } from "@/lib/workspace-starter-source-status";

describe("summarizeWorkspaceStarterSourceStatus", () => {
  it("surfaces sandbox dependency drift in summary text", () => {
    const template = {
      id: "starter_sandbox",
      workspace_id: "default",
      name: "Sandbox Starter",
      description: "",
      business_track: "编排节点能力",
      default_workflow_name: "Sandbox Workflow",
      workflow_focus: "",
      recommended_next_step: "",
      tags: [],
      created_from_workflow_id: "wf_sandbox",
      created_from_workflow_version: "1",
      archived: false,
      archived_at: null,
      created_at: "2026-03-21T00:00:00Z",
      updated_at: "2026-03-21T00:00:00Z",
      definition: {
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            name: "Trigger",
            config: {}
          },
          {
            id: "sandbox",
            type: "sandbox_code",
            name: "Sandbox Code",
            config: {
              language: "python"
            },
            runtimePolicy: {
              execution: {
                class: "subprocess",
                dependencyMode: "builtin",
                builtinPackageSet: "py-data-basic"
              }
            }
          }
        ],
        edges: [],
        variables: [],
        publish: []
      }
    } satisfies WorkspaceStarterTemplateItem;

    const sourceWorkflow = {
      id: "wf_sandbox",
      name: "Sandbox Workflow",
      version: "2",
      status: "draft",
      node_count: 2,
      tool_governance: {
        referenced_tool_ids: [],
        missing_tool_ids: [],
        governed_tool_count: 0,
        strong_isolation_tool_count: 0
      },
      definition: {
        nodes: [
          {
            id: "trigger",
            type: "trigger",
            name: "Trigger",
            config: {}
          },
          {
            id: "sandbox",
            type: "sandbox_code",
            name: "Sandbox Code",
            config: {
              language: "python"
            },
            runtimePolicy: {
              execution: {
                class: "subprocess",
                dependencyMode: "dependency_ref",
                dependencyRef: "deps://analytics-v2",
                backendExtensions: {
                  mountPreset: "analytics"
                }
              }
            }
          }
        ],
        edges: [],
        variables: [],
        publish: []
      },
      created_at: "2026-03-21T00:00:00Z",
      updated_at: "2026-03-21T00:00:00Z",
      versions: []
    } satisfies WorkflowDetail;

    const status = summarizeWorkspaceStarterSourceStatus(template, sourceWorkflow);

    expect(status.kind).toBe("drifted");
    expect(status.summary).toContain("版本号已经前进");
    expect(status.summary).toContain("sandbox 依赖约束已变化");
  });
});
