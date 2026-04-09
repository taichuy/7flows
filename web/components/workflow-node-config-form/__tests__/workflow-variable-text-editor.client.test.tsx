// @vitest-environment jsdom

import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  ClipboardEvent: class extends Event {
    clipboardData?: ReturnType<typeof createClipboardData>;
  },
});
Object.defineProperty(HTMLElement.prototype, "focus", {
  configurable: true,
  value() {},
});
Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value() {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON() {
        return {};
      },
    };
  },
});
if (typeof Range !== "undefined") {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        toJSON() {
          return {};
        },
      };
    },
  });
}
if (typeof Selection !== "undefined" && !Selection.prototype.modify) {
  Object.defineProperty(Selection.prototype, "modify", {
    configurable: true,
    value() {},
  });
}
if (typeof Text !== "undefined") {
  Object.defineProperty(Text.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        toJSON() {
          return {};
        },
      };
    },
  });
}

function getEditorSurface() {
  return document.querySelector(
    '[data-component="workflow-variable-text-editor-input"]',
  ) as HTMLDivElement;
}

function getLexicalEditor() {
  return (getEditorSurface() as HTMLDivElement & { __lexicalEditor?: LexicalEditor }).__lexicalEditor!;
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

async function flushEditor() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function insertTextAtSelection(text: string) {
  const editor = getLexicalEditor();
  await act(async () => {
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertText(text);
      } else {
        $getRoot().selectEnd();
        const nextSelection = $getSelection();
        if ($isRangeSelection(nextSelection)) {
          nextSelection.insertText(text);
        }
      }
    });
    await Promise.resolve();
  });
}

async function selectEditorEnd() {
  const editor = getLexicalEditor();
  await act(async () => {
    editor.update(() => {
      $getRoot().selectEnd();
    });
    await Promise.resolve();
  });
}

async function selectFirstTextOffset(offset: number) {
  const editor = getLexicalEditor();
  await act(async () => {
    editor.update(() => {
      const paragraph = $getRoot().getFirstChild();
      if (!$isElementNode(paragraph)) {
        return;
      }

      const firstChild = paragraph.getFirstChild();
      if ($isTextNode(firstChild)) {
        firstChild.select(offset, offset);
      }
    });
    await Promise.resolve();
  });
}

async function selectLastTextOffset(offset: number) {
  const editor = getLexicalEditor();
  await act(async () => {
    editor.update(() => {
      const paragraph = $getRoot().getFirstChild();
      if (!$isElementNode(paragraph)) {
        return;
      }

      const lastChild = paragraph.getLastChild();
      if ($isTextNode(lastChild)) {
        lastChild.select(offset, offset);
      }
    });
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("WorkflowVariableTextEditor", () => {
  it("renders a real contenteditable surface instead of a mirrored textarea overlay", () => {
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

    expect(document.querySelector("textarea.workflow-variable-text-editor-input")).toBeNull();
    const surface = getEditorSurface();
    expect(surface.getAttribute("contenteditable")).toBe("true");
    expect(document.body.textContent).toContain("输入正文，输入 / 插入变量");
  });

  it("opens the slash picker from editor text and inserts the first match on enter", async () => {
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
                  key: "input-test",
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

    await selectEditorEnd();
    await insertTextAtSelection("/te");
    await flushEditor();

    expect(
      document.querySelector('[data-component="workflow-variable-reference-popover"]'),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("[用户输入] test");
    expect(document.body.textContent).not.toContain("answer");

    await act(async () => {
      getLexicalEditor().dispatchCommand(
        KEY_ENTER_COMMAND,
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await Promise.resolve();
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

  it("opens the same popup from the toolbar button and inserts at the current caret", async () => {
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

    await selectFirstTextOffset(6);

    const toolbarButton = document.querySelector(
      '[data-action="open-variable-picker"]',
    ) as HTMLButtonElement;

    await act(async () => {
      toolbarButton.click();
      await Promise.resolve();
    });

    const insertButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("text"),
    ) as HTMLButtonElement;

    await act(async () => {
      insertButton.click();
      await Promise.resolve();
    });
    await flushEditor();

    expect(document.querySelector('[data-component="workflow-variable-reference-popover"]')).toBeNull();
    expect(getEditorSurface().getAttribute("contenteditable")).toBe("true");

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

  it("switches a toolbar-open picker back to slash filtering when typing slash in the editor", async () => {
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
                  key: "input-test",
                  label: "trigger_input.test",
                  selector: ["trigger_input", "test"],
                  token: "{{#endNode_ab12cd34.test#}}",
                  previewPath: "trigger_input.test",
                  machineName: "endNode_ab12cd34.test",
                  valueTypeLabel: "String",
                  inlineLabel: "[用户输入] test",
                },
                {
                  key: "input-query",
                  label: "trigger_input.query",
                  selector: ["trigger_input", "query"],
                  token: "{{#endNode_ab12cd34.query#}}",
                  previewPath: "trigger_input.query",
                  machineName: "endNode_ab12cd34.query",
                  valueTypeLabel: "String",
                  inlineLabel: "[用户输入] query",
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
    await act(async () => {
      toolbarButton.click();
      await Promise.resolve();
    });

    expect(document.querySelector('[data-element="workflow-variable-picker-search"]')).toBeTruthy();

    await selectEditorEnd();
    await insertTextAtSelection("/test");
    await flushEditor();

    expect(document.querySelector('[data-element="workflow-variable-picker-search"]')).toBeNull();
    expect(document.body.textContent).toContain("[用户输入] test");
    expect(document.body.textContent).not.toContain("[用户输入] query");
  });

  it("removes tokens atomically on backspace from the trailing text edge", async () => {
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

    await selectLastTextOffset(0);

    await act(async () => {
      getLexicalEditor().dispatchCommand(
        KEY_BACKSPACE_COMMAND,
        new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }),
      );
      await Promise.resolve();
    });
    await flushEditor();

    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [{ type: "text", text: "hello world" }],
      },
      references: [],
    });
  });

  it("appends plain text after a variable token when the caret is placed at the tail", async () => {
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

    await selectEditorEnd();
    await insertTextAtSelection("!");
    await flushEditor();

    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [
          { type: "text", text: "hello " },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: "!" },
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

    await selectFirstTextOffset(6);
    const clipboardData = createClipboardData("copy {{#accumulated.llm.text#}} now");
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: clipboardData,
    });

    await act(async () => {
      getLexicalEditor().dispatchCommand(PASTE_COMMAND, event as ClipboardEvent);
      await Promise.resolve();
    });
    await flushEditor();

    expect(event.defaultPrevented).toBe(true);
    expect(handleChange).toHaveBeenLastCalledWith({
      document: {
        version: 1,
        segments: [
          { type: "text", text: "hello copy " },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: " nowworld" },
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
