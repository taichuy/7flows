import { describe, expect, it } from "vitest";

import { buildWorkflowValidationRemediation } from "@/lib/workflow-validation-remediation";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("workflow validation remediation (skill + context)", () => {
  it("renders remediation for skill binding references", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "skill-binding-reference",
      category: "tool_reference",
      message: "LLM agent references missing skill binding.",
      target: {
        scope: "node",
        nodeId: "agent-node",
        section: "config",
        fieldPath: "config.skillBinding.references.0.skillId",
        label: "Node 路 Planner agent"
      }
    };

    const remediation = buildWorkflowValidationRemediation(item);
    expect(remediation.title).toBe("Node 路 Planner agent · Skill references");
    expect(remediation.suggestion).toContain("skillId:referenceId @");
  });

  it("renders remediation for context access readable nodes", () => {
    const item: WorkflowValidationNavigatorItem = {
      key: "context-access-readable-node",
      category: "tool_reference",
      message: "Readable node id points to a missing upstream node.",
      target: {
        scope: "node",
        nodeId: "agent-node",
        section: "config",
        fieldPath: "config.contextAccess.readableNodeIds.1",
        label: "Node 路 Planner agent"
      }
    };

    const remediation = buildWorkflowValidationRemediation(item);
    expect(remediation.title).toBe("Node 路 Planner agent · Readable upstream nodes");
    expect(remediation.suggestion).toContain("勾选仍存在的上游节点");
  });
});
