import { describe, expect, it } from "vitest";

import {
  buildWorkflowStarterTemplates,
  inferWorkflowBusinessTrack
} from "@/lib/workflow-starters";

describe("inferWorkflowBusinessTrack", () => {
  it("classifies sandbox_code workflows as orchestration capability", () => {
    expect(
      inferWorkflowBusinessTrack({
        nodes: [
          { id: "trigger", type: "trigger", name: "Trigger", config: {} },
          {
            id: "sandbox",
            type: "sandbox_code",
            name: "Sandbox Code",
            config: { language: "python", code: "result = {'ok': True}" }
          },
          { id: "output", type: "output", name: "Output", config: {} }
        ],
        edges: [
          {
            id: "edge_trigger_sandbox",
            sourceNodeId: "trigger",
            targetNodeId: "sandbox",
            channel: "control"
          },
          {
            id: "edge_sandbox_output",
            sourceNodeId: "sandbox",
            targetNodeId: "output",
            channel: "control"
          }
        ],
        variables: [],
        publish: []
      })
    ).toBe("编排节点能力");
  });

  it("can classify lightweight workflow summaries without full definitions", () => {
    expect(
      inferWorkflowBusinessTrack({
        nodeTypes: ["trigger", "output"],
        publishCount: 1
      })
    ).toBe("API 调用开放");
  });

  it("keeps workspace source-governance binding facts on starter templates", () => {
    const templates = buildWorkflowStarterTemplates(
      [
        {
          id: "starter-governed",
          origin: "workspace",
          workspaceId: "default",
          name: "Governed starter",
          description: "Starter with source governance",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Governed workflow",
          workflowFocus: "Keep source facts visible",
          recommendedNextStep: "Review governance before creating.",
          tags: ["workspace"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          source: {
            kind: "starter",
            scope: "workspace",
            status: "available",
            governance: "workspace",
            ecosystem: "native",
            label: "Workspace starters",
            shortLabel: "workspace ready",
            summary: "Workspace starter library"
          },
          createdFromWorkflowId: "wf-source-a",
          createdFromWorkflowVersion: "0.1.0",
          archived: true,
          archivedAt: "2026-03-23T09:00:00Z",
          createdAt: "2026-03-22T09:00:00Z",
          updatedAt: "2026-03-23T09:00:00Z",
          sourceGovernance: {
            kind: "drifted",
            statusLabel: "建议 refresh",
            summary: "当前主要是来源快照漂移。",
            sourceWorkflowId: "wf-source-a",
            sourceWorkflowName: "Source A",
            templateVersion: "0.1.0",
            sourceVersion: "0.2.0",
            actionDecision: {
              recommended_action: "refresh",
              status_label: "建议 refresh",
              summary: "优先 refresh。",
              can_refresh: true,
              can_rebase: true,
              fact_chips: ["source 0.2.0"]
            },
            outcomeExplanation: {
              primary_signal: "来源 workflow 已更新。",
              follow_up: "先 refresh。"
            }
          }
        }
      ],
      [
        {
          type: "trigger",
          label: "Trigger",
          description: "Trigger node",
          ecosystem: "native",
          source: {
            kind: "node",
            scope: "builtin",
            status: "available",
            governance: "repo",
            ecosystem: "native",
            label: "Native node catalog",
            shortLabel: "native nodes",
            summary: "Native nodes"
          },
          capabilityGroup: "entry",
          businessTrack: "应用新建编排",
          tags: [],
          supportStatus: "available",
          supportSummary: "",
          bindingRequired: false,
          bindingSourceLanes: [],
          palette: { enabled: true, order: 0, defaultPosition: { x: 0, y: 0 } },
          defaults: { name: "Trigger", config: {} }
        }
      ],
      []
    );

    expect(templates[0]).toMatchObject({
      createdFromWorkflowId: "wf-source-a",
      archived: true,
      sourceGovernance: {
        kind: "drifted",
        sourceWorkflowId: "wf-source-a",
        actionDecision: {
          recommended_action: "refresh"
        }
      }
    });
  });
});
