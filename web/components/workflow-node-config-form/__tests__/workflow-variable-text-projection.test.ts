import { describe, expect, it } from "vitest";

import {
  buildReplyDocumentFromProjection,
  buildWorkflowVariableProjection,
  deserializeProjectionClipboardText,
  formatWorkflowVariableProjectionTokenText,
  insertTokenIntoProjection,
  replaceProjectionTextRange,
  removeTokenBeforeCursor,
  serializeProjectionSelectionToTemplate,
} from "@/components/workflow-node-config-form/workflow-variable-text-projection";

describe("workflow-variable-text-projection", () => {
  it("builds a textarea projection and inline token metadata from the reply document", () => {
    const tokenText = formatWorkflowVariableProjectionTokenText("[直接回复] text");
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

    expect(projection.text).toBe(`你好，${tokenText} world`);
    expect(projection.tokens).toEqual([
      {
        refId: "ref_1",
        start: 3,
        end: 3 + tokenText.length,
        label: "[直接回复] text",
        machineName: "endNode_ab12cd34.text",
      },
    ]);
  });

  it("rebuilds the reply document after slash replacement insert and token delete", () => {
    const tokenText = formatWorkflowVariableProjectionTokenText("[直接回复] text");
    const inserted = insertTokenIntoProjection({
      text: "hello /world",
      cursor: 7,
      orderedRefIds: [],
      refId: "ref_1",
      tokenText,
      removeLeadingSlash: true,
    });

    expect(inserted.text).toBe(`hello ${tokenText}world`);
    expect(
      buildReplyDocumentFromProjection({
        text: inserted.text,
        orderedRefIds: ["ref_1"],
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
      cursor: inserted.cursor,
      orderedRefIds: inserted.orderedRefIds,
    });

    expect(removed).toEqual({
      text: "hello world",
      orderedRefIds: [],
      cursor: 6,
    });
  });

  it("serializes token selections to template text and restores them on paste", () => {
    const tokenText = formatWorkflowVariableProjectionTokenText("[直接回复] text");
    expect(
      serializeProjectionSelectionToTemplate({
        text: `hello ${tokenText}world`,
        selectionStart: 0,
        selectionEnd: 7 + tokenText.length + 5,
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
    ).toBe("hello {{#accumulated.llm.text#}}world");

    const inserted = deserializeProjectionClipboardText({
      clipboardText: "copy {{#accumulated.llm.text#}} now",
      references: [
        {
          refId: "ref_1",
          alias: "text",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["accumulated", "llm", "text"],
        },
      ],
      getTokenText: () => "[直接回复] text",
    });

    expect(inserted).toEqual({
      text: `copy ${tokenText} now`,
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
      text: `hello copy ${tokenText} now`,
      orderedRefIds: ["ref_1"],
      cursor: 15 + tokenText.length,
    });
  });
});
