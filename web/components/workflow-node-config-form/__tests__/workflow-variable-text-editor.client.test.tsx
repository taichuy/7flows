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
Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

function getEditorTextarea() {
  return document.querySelector(
    'textarea.workflow-variable-text-editor-input',
  ) as HTMLTextAreaElement;
}

function createClipboardData(initialText = "") {
  const store = new Map<string, string>();
  if (initialText) {
    store.set("text/plain", initialText);
  }

  return {
    getData: vi.fn((type: string) => store.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
  };
}

function dispatchClipboardEvent(
  target: HTMLTextAreaElement,
  type: "copy" | "cut" | "paste",
  clipboardData: ReturnType<typeof createClipboardData>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: clipboardData,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("WorkflowVariableTextEditor", () => {
  it("uses an ant textarea base while keeping the placeholder only in the overlay", () => {
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
    const textarea = getEditorTextarea();
    expect(textarea.getAttribute("placeholder")).toBeNull();
    expect(textarea.className).toContain("ant-input");
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
            segments: [{ type: "text", text: "" }],
          },
          references: [],
          variables: [
            {
              key: "upstream",
              label: "用户输入",
              items: [
                {
                  key: "llm-text",
                  label: "trigger_input.query",
                  selector: ["trigger_input", "query"],
                  token: "{{#endNode_ab12cd34.text#}}",
                  previewPath: "trigger_input.query",
                  machineName: "endNode_ab12cd34.text",
                  valueTypeLabel: "String",
                  inlineLabel: "[用户输入] test",
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

    const textarea = getEditorTextarea();
    act(() => {
      textarea.focus();
      textarea.value = "/te";
      textarea.setSelectionRange(3, 3);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("/te");
    expect(document.body.textContent).toContain("[用户输入] test");
    expect(document.body.textContent).not.toContain("answer");
    expect(document.body.textContent).not.toContain("复制机器别名");
    expect(document.querySelector('[data-element="workflow-variable-picker-search"]')).toBeNull();
    expect(document.activeElement).toBe(textarea);

    act(() => {
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
          alias: "query",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["trigger_input", "query"],
        },
      ],
    });
  });

  it("opens the slash picker only after typing slash in the editor", () => {
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

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeNull();

    const textarea = getEditorTextarea();
    act(() => {
      textarea.focus();
      textarea.value = "hello";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeNull();

    act(() => {
      textarea.value = "hello /";
      textarea.setSelectionRange(7, 7);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeTruthy();
  });

  it("does not reopen the variable picker for plain text after insertion", () => {
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

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeNull();

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
              { type: "text", text: "world!" },
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

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeNull();
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

    const textarea = getEditorTextarea();
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

    const textarea = getEditorTextarea();
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

  it("copies token selections as template text instead of leaking sentinel characters", () => {
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
          variables: [],
          onChange: handleChange,
        }),
      );
    });

    const textarea = getEditorTextarea();
    const clipboardData = createClipboardData();
    textarea.setSelectionRange(0, textarea.value.length);

    let event: Event;
    act(() => {
      event = dispatchClipboardEvent(textarea, "copy", clipboardData);
    });

    expect(event!.defaultPrevented).toBe(true);
    expect(clipboardData.setData).toHaveBeenCalledWith(
      "text/plain",
      "hello {{#endNode_ab12cd34.text#}}world",
    );
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("rehydrates copied template tokens back into inline variable chips on paste", async () => {
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
          references: [
            {
              refId: "ref_1",
              alias: "text",
              ownerNodeId: "endNode_ab12cd34",
              selector: ["accumulated", "llm", "text"],
            },
          ],
          variables: [],
          onChange: handleChange,
        }),
      );
    });

    const textarea = getEditorTextarea();
    const clipboardData = createClipboardData("copy {{#endNode_ab12cd34.text#}} now");

    textarea.focus();
    textarea.setSelectionRange(6, 11);

    let event: Event;
    await act(async () => {
      event = dispatchClipboardEvent(textarea, "paste", clipboardData);
      await Promise.resolve();
    });

    expect(event!.defaultPrevented).toBe(true);
    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [
          { type: "text", text: "hello copy " },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: " now" },
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
});
