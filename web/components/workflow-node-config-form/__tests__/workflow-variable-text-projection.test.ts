import { describe, expect, it } from "vitest";

import {
  WORKFLOW_VARIABLE_SENTINEL,
  buildReplyDocumentFromProjection,
  buildWorkflowVariableProjection,
  deserializeProjectionClipboardText,
  insertSentinelIntoProjection,
  replaceProjectionTextRange,
  removeTokenBeforeCursor,
  serializeProjectionSelectionToTemplate,
} from "@/components/workflow-node-config-form/workflow-variable-text-projection";

describe("workflow-variable-text-projection", () => {
  it("builds a textarea projection and inline token metadata from the reply document", () => {
    const projection = buildWorkflowVariableProjection({
      ownerLabel: "直接回复",
      document: {
        version: 1,
        segments: [
          { type: "text", text: "你好，" },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: " world" },
        ],
      },
      references: [
        {
          refId: "ref_1",
          alias: "text",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["accumulated", "llm", "text"],
        },
      ],
    });

    expect(projection.text).toBe(`你好，${WORKFLOW_VARIABLE_SENTINEL} world`);
    expect(projection.tokens).toEqual([
      {
        refId: "ref_1",
        start: 3,
        end: 4,
        label: "[直接回复] text",
        machineName: "endNode_ab12cd34.text",
      },
    ]);
  });

  it("rebuilds the reply document after slash replacement insert and token delete", () => {
    const inserted = insertSentinelIntoProjection({
      text: "hello /world",
      cursor: 7,
      orderedRefIds: [],
      refId: "ref_1",
      removeLeadingSlash: true,
    });

    expect(inserted.text).toBe(`hello ${WORKFLOW_VARIABLE_SENTINEL}world`);
    expect(inserted.orderedRefIds).toEqual(["ref_1"]);
    expect(
      buildReplyDocumentFromProjection({
        text: inserted.text,
        orderedRefIds: inserted.orderedRefIds,
      }),
    ).toEqual({
      version: 1,
      segments: [
        { type: "text", text: "hello " },
        { type: "variable", refId: "ref_1" },
        { type: "text", text: "world" },
      ],
    });

    const removed = removeTokenBeforeCursor({
      text: inserted.text,
      cursor: 7,
      orderedRefIds: inserted.orderedRefIds,
    });

    expect(removed).toEqual({
      text: "hello world",
      orderedRefIds: [],
      cursor: 6,
    });
  });

  it("serializes token selections to template text and restores them on paste", () => {
    expect(
      serializeProjectionSelectionToTemplate({
        text: `hello ${WORKFLOW_VARIABLE_SENTINEL}world`,
        selectionStart: 0,
        selectionEnd: 12,
        orderedRefIds: ["ref_1"],
        references: [
          {
            refId: "ref_1",
            alias: "text",
            ownerNodeId: "endNode_ab12cd34",
            selector: ["accumulated", "llm", "text"],
          },
        ],
      }),
    ).toBe("hello {{#endNode_ab12cd34.text#}}world");

    const inserted = deserializeProjectionClipboardText({
      clipboardText: "copy {{#endNode_ab12cd34.text#}} now",
      references: [
        {
          refId: "ref_1",
          alias: "text",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["accumulated", "llm", "text"],
        },
      ],
    });

    expect(inserted).toEqual({
      text: `copy ${WORKFLOW_VARIABLE_SENTINEL} now`,
      orderedRefIds: ["ref_1"],
    });

    expect(
      replaceProjectionTextRange({
        text: "hello world",
        selectionStart: 6,
        selectionEnd: 11,
        orderedRefIds: [],
        insertText: inserted.text,
        insertRefIds: inserted.orderedRefIds,
      }),
    ).toEqual({
      text: `hello copy ${WORKFLOW_VARIABLE_SENTINEL} now`,
      orderedRefIds: ["ref_1"],
      cursor: 16,
    });
  });
});
