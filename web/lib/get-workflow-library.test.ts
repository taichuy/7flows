import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getWorkflowLibrarySnapshot } from "./get-workflow-library";

vi.mock("@/lib/api-base-url", () => ({
  getApiBaseUrl: () => "http://api.test"
}));

describe("getWorkflowLibrarySnapshot", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes workspace starter source governance follow-up", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        nodes: [],
        starter_source_lanes: [],
        node_source_lanes: [],
        tool_source_lanes: [],
        tools: [],
        starters: [
          {
            id: "workspace-starter-1",
            origin: "workspace",
            workspace_id: "default",
            name: "Governed Workspace Starter",
            description: "Starter with governance facts.",
            business_track: "应用新建编排",
            default_workflow_name: "Governed Workflow",
            workflow_focus: "Keep source facts aligned.",
            recommended_next_step: "Create after checking governance.",
            tags: ["workspace starter"],
            definition: {
              nodes: [],
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
              short_label: "workspace ready",
              summary: "Workspace starter library"
            },
            archived: false,
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
          }
        ]
      })
    } as Response);

    const snapshot = await getWorkflowLibrarySnapshot();

    expect(snapshot.starters).toHaveLength(1);
    expect(snapshot.starters[0]?.sourceGovernance).toEqual({
      kind: "drifted",
      statusLabel: "建议 refresh",
      summary: "当前主要是来源快照漂移。优先 refresh 同步最新 definition / version。",
      sourceWorkflowId: "wf-demo",
      sourceWorkflowName: "Demo Workflow",
      templateVersion: "0.1.0",
      sourceVersion: "0.2.0",
      actionDecision: {
        recommended_action: "refresh",
        status_label: "建议 refresh",
        summary: "优先 refresh 同步最新 definition / version。",
        can_refresh: true,
        can_rebase: true,
        fact_chips: ["template 0.1.0", "source 0.2.0"]
      },
      outcomeExplanation: {
        primary_signal: "来源 workflow 0.2.0 相比模板快照 0.1.0 已有漂移。",
        follow_up: "优先 refresh 同步最新 definition / version。"
      }
    });
  });
});
