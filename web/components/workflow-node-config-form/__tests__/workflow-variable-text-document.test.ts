import { describe, expect, it } from "vitest";

import {
  buildReplyVariableReference,
  formatWorkflowVariableMachineName,
  formatWorkflowVariableToken,
  parseReplyTemplateToDocument,
  serializeReplyDocumentToTemplate,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

describe("workflow-variable-text-document", () => {
  it("parses selector tokens into document and references, then serializes selector tokens", () => {
    const parsed = parseReplyTemplateToDocument({
      ownerNodeId: "endNode_ab12cd34",
      ownerLabel: "直接回复",
      replyTemplate: "你好，{{#accumulated.agent.answer#}}",
    });

    expect(parsed.document).toEqual({
      version: 1,
      segments: [
        { type: "text", text: "你好，" },
        { type: "variable", refId: "ref_1" },
      ],
    });
    expect(parsed.references).toEqual([
      {
        refId: "ref_1",
        alias: "answer",
        ownerNodeId: "endNode_ab12cd34",
        selector: ["accumulated", "agent", "answer"],
      },
    ]);
    expect(
      serializeReplyDocumentToTemplate({
        document: parsed.document,
        references: parsed.references,
      }),
    ).toBe("你好，{{#accumulated.agent.answer#}}");
  });

  it("keeps alias generation inside the node scope", () => {
    const first = buildReplyVariableReference({
      ownerNodeId: "endNode_ab12cd34",
      aliasBase: "text",
      selector: ["trigger_input", "query"],
      existingAliases: [],
    });
    const second = buildReplyVariableReference({
      ownerNodeId: "endNode_ab12cd34",
      aliasBase: "text",
      selector: ["accumulated", "agent", "text"],
      existingAliases: [first.alias],
    });

    expect(formatWorkflowVariableMachineName(first)).toBe("endNode_ab12cd34.text");
    expect(formatWorkflowVariableToken(first)).toBe("{{#trigger_input.query#}}");
    expect(second.alias).toBe("text_2");
  });
});
