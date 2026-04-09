import { describe, expect, it } from "vitest";

import {
  buildReplyDocumentFromProjection,
  buildWorkflowVariableProjection,
  deserializeProjectionClipboardText,
  insertTokenIntoProjection,
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

    expect(projection.text).toBe("你好，{{#accumulated.llm.text#}} world");
    expect(projection.tokens).toEqual([
      {
        refId: "ref_1",
        start: 3,
        end: 29,
        label: "[直接回复] text",
        machineName: "endNode_ab12cd34.text",
      },
    ]);
  });

  it("rebuilds the reply document after slash replacement insert and token delete", () => {
    const inserted = insertTokenIntoProjection({
      text: "hello /world",
      cursor: 7,
      reference: {
        refId: "ref_1",
        alias: "text",
        ownerNodeId: "endNode_ab12cd34",
        selector: ["accumulated", "llm", "text"],
      },
      removeLeadingSlash: true,
    });

    expect(inserted.text).toBe("hello {{#accumulated.llm.text#}}world");
    expect(
      buildReplyDocumentFromProjection({
        text: inserted.text,
        references: [
          {
            refId: "ref_1",
            alias: "text",
            ownerNodeId: "endNode_ab12cd34",
            selector: ["accumulated", "llm", "text"],
          },
        ],
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
    });

    expect(removed).toEqual({
      text: "hello world",
      cursor: 6,
    });
  });

  it("serializes token selections to template text and restores them on paste", () => {
    expect(
      serializeProjectionSelectionToTemplate({
        text: "hello {{#accumulated.llm.text#}}world",
        selectionStart: 0,
        selectionEnd: 37,
      }),
    ).toBe("hello {{#accumulated.llm.text#}}world");

    const inserted = deserializeProjectionClipboardText({
      clipboardText: "copy {{#accumulated.llm.text#}} now",
    });

    expect(inserted).toEqual({
      text: "copy {{#accumulated.llm.text#}} now",
    });

    expect(
      replaceProjectionTextRange({
        text: "hello world",
        selectionStart: 6,
        selectionEnd: 11,
        insertText: inserted.text,
      }),
    ).toEqual({
      text: "hello copy {{#accumulated.llm.text#}} now",
      cursor: 41,
    });
  });
});
