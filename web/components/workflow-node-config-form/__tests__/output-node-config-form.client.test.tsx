// @vitest-environment jsdom

import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { $getRoot, $isElementNode, $isTextNode, type LexicalEditor } from "lexical";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";

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

function getEditorSurface() {
  return document.querySelector(
    '[data-component="workflow-variable-text-editor-input"]',
  ) as HTMLDivElement;
}

function getLexicalEditor() {
  return (getEditorSurface() as HTMLDivElement & { __lexicalEditor?: LexicalEditor }).__lexicalEditor!;
}

async function flushEditor() {
  await act(async () => {
    await Promise.resolve();
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

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("OutputNodeConfigForm client render", () => {
  it("writes replyDocument, replyReferences, and replyTemplate after inserting from the toolbar button", async () => {
    const handleChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(OutputNodeConfigForm, {
          node: {
            id: "endNode_ab12cd34",
            type: "workflowNode",
            position: { x: 0, y: 0 },
            data: {
              label: "直接回复",
              nodeType: "endNode",
              config: { replyTemplate: "hello world" },
            },
          } as never,
          nodes: [
            {
              id: "agent",
              type: "workflowNode",
              position: { x: 0, y: 0 },
              data: {
                label: "LLM",
                nodeType: "llmAgentNode",
                config: {},
                outputSchema: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                  },
                },
              },
            },
          ] as never,
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

    expect(document.body.textContent).toContain("上游节点");
    expect(document.body.textContent).toContain("String");
    expect(document.body.textContent).toContain("用户输入");
    expect(document.body.textContent).toContain("[LLM] text");

    const insertButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("[LLM] text"),
    ) as HTMLButtonElement;

    await act(async () => {
      insertButton.click();
      await Promise.resolve();
    });
    await flushEditor();

    expect(handleChange).toHaveBeenLastCalledWith({
      replyDocument: {
        version: 1,
        segments: [
          { type: "text", text: "hello " },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: "world" },
        ],
      },
      replyReferences: [
        {
          refId: "ref_1",
          alias: "text",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["accumulated", "agent", "text"],
        },
      ],
      replyTemplate: "hello {{#accumulated.agent.text#}}world",
    });
  });

  it("serializes trigger input variables to selector-based template tokens", async () => {
    const handleChange = vi.fn();

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        createElement(OutputNodeConfigForm, {
          node: {
            id: "endNode_ab12cd34",
            type: "workflowNode",
            position: { x: 0, y: 0 },
            data: {
              label: "直接回复",
              nodeType: "endNode",
              config: { replyTemplate: "hello world" },
              inputSchema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                },
              },
            },
          } as never,
          nodes: [
            {
              id: "start",
              type: "workflowNode",
              position: { x: 0, y: 0 },
              data: {
                label: "开始",
                nodeType: "startNode",
                config: {},
                inputSchema: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                  },
                },
              },
            },
          ] as never,
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
      button.textContent?.includes("[用户输入] query"),
    ) as HTMLButtonElement;

    await act(async () => {
      insertButton.click();
      await Promise.resolve();
    });
    await flushEditor();

    expect(handleChange).toHaveBeenLastCalledWith({
      replyDocument: {
        version: 1,
        segments: [
          { type: "text", text: "hello " },
          { type: "variable", refId: "ref_1" },
          { type: "text", text: "world" },
        ],
      },
      replyReferences: [
        {
          refId: "ref_1",
          alias: "query",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["trigger_input", "query"],
        },
      ],
      replyTemplate: "hello {{#trigger_input.query#}}world",
    });
  });
});
