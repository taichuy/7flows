import { describe, expect, it } from "vitest";

import {
  buildWorkflowDefinitionSandboxGovernanceBadges,
  buildWorkflowDefinitionSandboxGovernanceTags,
  describeWorkflowDefinitionSandboxDependency,
  summarizeWorkflowDefinitionSandboxGovernance
} from "@/lib/workflow-definition-sandbox-governance";

describe("workflow definition sandbox governance", () => {
  it("summarizes sandbox dependency facts from workflow definition", () => {
    const governance = summarizeWorkflowDefinitionSandboxGovernance({
      nodes: [
        {
          id: "sandbox_builtin",
          type: "sandbox_code",
          name: "Builtin Sandbox",
          config: {},
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
          id: "sandbox_ref",
          type: "sandbox_code",
          name: "Dependency Ref Sandbox",
          config: {},
          runtimePolicy: {
            execution: {
              class: "microvm",
              dependencyMode: "dependency_ref",
              dependencyRef: "team-shared-sql"
            }
          }
        }
      ],
      edges: [],
      variables: [],
      publish: []
    });

    expect(governance.sandboxNodeCount).toBe(2);
    expect(governance.explicitExecutionCount).toBe(2);
    expect(governance.executionClasses).toEqual(["sandbox", "microvm"]);
    expect(governance.dependencyModes).toEqual(["builtin", "dependency_ref"]);
    expect(governance.builtinPackageSets).toEqual(["py-data-basic"]);
    expect(governance.dependencyRefs).toEqual(["team-shared-sql"]);
    expect(governance.backendExtensionKeys).toEqual(["mountPreset"]);

    expect(buildWorkflowDefinitionSandboxGovernanceTags(governance)).toEqual(
      expect.arrayContaining([
        "sandbox_code",
        "execution:sandbox",
        "execution:microvm",
        "dependencyMode:builtin",
        "dependencyMode:dependency_ref",
        "builtinPackageSet:py-data-basic",
        "dependencyRef:team-shared-sql",
        "backendExtensions"
      ])
    );
    expect(buildWorkflowDefinitionSandboxGovernanceBadges(governance)).toEqual(
      expect.arrayContaining([
        "sandbox 2",
        "execution sandbox / microvm",
        "deps builtin / dependency_ref",
        "builtin py-data-basic",
        "dependency ref team-shared-sql",
        "extensions mountPreset"
      ])
    );
    expect(describeWorkflowDefinitionSandboxDependency(governance)).toBe(
      "sandbox 依赖事实：execution = sandbox / microvm · dependencyMode = builtin / dependency_ref · builtinPackageSet = py-data-basic · dependencyRef = team-shared-sql · backendExtensions = mountPreset"
    );
  });

  it("returns no explicit dependency summary for blank sandbox starter", () => {
    const governance = summarizeWorkflowDefinitionSandboxGovernance({
      nodes: [
        {
          id: "sandbox",
          type: "sandbox_code",
          name: "Sandbox Code",
          config: {}
        }
      ],
      edges: [],
      variables: [],
      publish: []
    });

    expect(governance.sandboxNodeCount).toBe(1);
    expect(governance.executionClasses).toEqual(["sandbox"]);
    expect(governance.dependencyModes).toEqual([]);
    expect(describeWorkflowDefinitionSandboxDependency(governance)).toBeNull();
  });
});
