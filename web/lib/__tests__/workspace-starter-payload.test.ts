import { describe, expect, it } from "vitest";

import { buildWorkspaceStarterPayload } from "@/lib/workspace-starter-payload";

describe("buildWorkspaceStarterPayload", () => {
  it("persists sandbox dependency facts into starter metadata", () => {
    const payload = buildWorkspaceStarterPayload({
      workflowId: "wf_sandbox",
      workflowName: "Sandbox SQL Workflow",
      workflowVersion: "7",
      businessTrack: "编排节点能力",
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
                class: "sandbox",
                dependencyMode: "builtin",
                builtinPackageSet: "py-data-basic",
                backendExtensions: {
                  mountPreset: "analytics"
                }
              }
            }
          },
          {
            id: "output",
            type: "output",
            name: "Output",
            config: {}
          }
        ],
        edges: [],
        variables: [],
        publish: []
      }
    });

    expect(payload.tags).toEqual(
      expect.arrayContaining([
        "workspace starter",
        "editor saved",
        "编排节点能力",
        "sandbox_code",
        "execution:sandbox",
        "dependencyMode:builtin",
        "builtinPackageSet:py-data-basic",
        "backendExtensions"
      ])
    );
    expect(payload.recommended_next_step).toContain("sandbox 依赖事实");
    expect(payload.recommended_next_step).toContain("builtinPackageSet = py-data-basic");
    expect(payload.recommended_next_step).toContain("backendExtensions = mountPreset");
  });
});
