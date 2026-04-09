// @vitest-environment jsdom

import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKFLOW_VARIABLE_SENTINEL } from "@/components/workflow-node-config-form/workflow-variable-text-projection";
import { WorkflowVariableTextEditor } from "@/components/workflow-node-config-form/workflow-variable-text-editor";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("WorkflowVariableTextEditor", () => {
  it("renders the placeholder only in the overlay instead of the native textarea placeholder", () => {
    const handleChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(WorkflowVariableTextEditor, {
          ownerNodeId: "endNode_ab12cd34",
          ownerLabel: "直接回复",
          value: {
            version: 1,
            segments: [{ type: "text", text: "" }],
          },
          references: [],
          variables: [],
          onChange: handleChange,
        }),
      );
    });

    expect(document.body.textContent).toContain("输入正文，输入 / 插入变量");
    expect((document.querySelector("textarea") as HTMLTextAreaElement).getAttribute("placeholder")).toBeNull();
  });

  it("keeps focus in the textarea for slash filtering and inserts the first match on enter", () => {
    const handleChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(WorkflowVariableTextEditor, {
          ownerNodeId: "endNode_ab12cd34",
          ownerLabel: "直接回复",
          value: {
            version: 1,
            segments: [{ type: "text", text: "/te" }],
          },
          references: [],
          variables: [
            {
              key: "upstream",
              label: "上游节点",
              items: [
                {
                  key: "llm-text",
                  label: "test",
                  selector: ["accumulated", "llm", "text"],
                  token: "{{#endNode_ab12cd34.text#}}",
                  previewPath: "LLM.test",
                  machineName: "endNode_ab12cd34.text",
                  valueTypeLabel: "String",
                  inlineLabel: "[LLM] test",
                },
                {
                  key: "llm-answer",
                  label: "answer",
                  selector: ["accumulated", "llm", "answer"],
                  token: "{{#endNode_ab12cd34.answer#}}",
                  previewPath: "LLM.answer",
                  machineName: "endNode_ab12cd34.answer",
                  valueTypeLabel: "String",
                },
              ],
            },
          ],
          onChange: handleChange,
        }),
      );
    });

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("test");
    expect(document.body.textContent).not.toContain("answer");
    expect(document.body.textContent).not.toContain("复制机器别名");
    expect(document.querySelector('[data-element="workflow-variable-picker-search"]')).toBeNull();

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(3, 3);
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [{ type: "variable", refId: "ref_1" }],
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
  });

  it("opens the same popup from the toolbar button and inserts at the current caret", () => {
    const handleChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(WorkflowVariableTextEditor, {
          ownerNodeId: "endNode_ab12cd34",
          ownerLabel: "直接回复",
          value: {
            version: 1,
            segments: [{ type: "text", text: "hello world" }],
          },
          references: [],
          variables: [
            {
              key: "upstream",
              label: "上游节点",
              items: [
                {
                  key: "llm-text",
                  label: "text",
                  selector: ["accumulated", "llm", "text"],
                  token: "{{#endNode_ab12cd34.text#}}",
                  previewPath: "LLM.text",
                  machineName: "endNode_ab12cd34.text",
                  valueTypeLabel: "String",
                },
              ],
            },
          ],
          onChange: handleChange,
        }),
      );
    });

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      textarea.focus();
      textarea.setSelectionRange(6, 6);
    });

    const toolbarButton = document.querySelector(
      '[data-action="open-variable-picker"]',
    ) as HTMLButtonElement;

    act(() => {
      toolbarButton.click();
    });

    const insertButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("text"),
    ) as HTMLButtonElement;

    act(() => {
      insertButton.click();
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [
          { type: "text", text: "hello " },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: "world" },
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
  });

  it("renders inline tokens and removes them atomically on backspace", () => {
    const handleChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(WorkflowVariableTextEditor, {
          ownerNodeId: "endNode_ab12cd34",
          ownerLabel: "直接回复",
          value: {
            version: 1,
            segments: [
              { type: "text", text: "hello " },
              { type: "variable", refId: "ref_1" },
              { type: "text", text: "world" },
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
          variables: [
            {
              key: "upstream",
              label: "上游节点",
              items: [
                {
                  key: "llm-text",
                  label: "LLM.text",
                  selector: ["accumulated", "llm", "text"],
                  token: "{{#endNode_ab12cd34.text#}}",
                  previewPath: "LLM.text",
                  machineName: "endNode_ab12cd34.text",
                  valueTypeLabel: "String",
                  inlineLabel: "[LLM] text",
                } as never,
              ],
            },
          ],
          onChange: handleChange,
        }),
      );
    });

    expect(document.body.textContent).toContain("[LLM] text");
    expect(
      document.querySelector('[data-component="workflow-variable-reference-picker"]'),
    ).toBeFalsy();

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain(WORKFLOW_VARIABLE_SENTINEL);

    act(() => {
      textarea.focus();
      textarea.setSelectionRange(7, 7);
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
      );
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [{ type: "text", text: "hello world" }],
      },
      references: [],
    });
  });
});
