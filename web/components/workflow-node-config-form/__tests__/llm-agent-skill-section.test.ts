import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LlmAgentSkillSection } from "@/components/workflow-node-config-form/llm-agent-skill-section";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("LlmAgentSkillSection", () => {
  it("shows field-level remediation for focused skill id issues", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "llm-agent-skill-ids",
      category: "tool_reference",
      message: "skillIds 中包含当前 catalog 不存在的 skill。",
      target: {
        scope: "node",
        nodeId: "agent-node",
        section: "config",
        fieldPath: "config.skillIds.0",
        label: "Node · Planner agent"
      }
    };

    const html = renderToStaticMarkup(
      createElement(LlmAgentSkillSection, {
        skillIds: ["missing-skill"],
        highlightedFieldKey: "skillIds",
        focusedValidationItem,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Node · Planner agent · Skill IDs");
    expect(html).toContain("把 skillIds 对齐到当前可用的 SkillDoc");
    expect(html).toContain('data-validation-field="skillIds"');
    expect(html).toContain("validation-focus-ring");
  });
});
