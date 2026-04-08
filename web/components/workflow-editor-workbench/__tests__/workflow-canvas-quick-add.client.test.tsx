// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkflowCanvasQuickAddTrigger } from "@/components/workflow-editor-workbench/workflow-canvas-quick-add";

Object.assign(globalThis, { React });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const QUICK_ADD_OPTIONS = [
  {
    type: "llmAgentNode",
    label: "LLM Agent",
    description: "让 agent 继续推理。",
    capabilityGroup: "agent"
  },
  {
    type: "conditionNode",
    label: "Condition",
    description: "按条件分支继续主链。",
    capabilityGroup: "logic"
  },
  {
    type: "toolNode",
    label: "Tool",
    description: "调用工具目录中的能力。",
    capabilityGroup: "integration"
  }
] as const;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function openQuickAdd(onQuickAdd = vi.fn()) {
  act(() => {
    root?.render(
      <WorkflowCanvasQuickAddTrigger
        quickAddOptions={[...QUICK_ADD_OPTIONS]}
        triggerAriaLabel="添加节点"
        menuTitle="添加节点"
        menuDescription="直接插入当前节点后方，并自动续上主链。"
        containerClassName="test-shell"
        triggerClassName="test-trigger"
        onQuickAdd={onQuickAdd}
      />
    );
  });

  const trigger = container?.querySelector('button[aria-label="添加节点"]');
  expect(trigger).toBeInstanceOf(HTMLButtonElement);

  act(() => {
    (trigger as HTMLButtonElement).click();
  });

  return { onQuickAdd, trigger: trigger as HTMLButtonElement };
}

function getPreview() {
  return container?.querySelector(".workflow-canvas-quick-add-preview");
}

function setSearchValue(value: string) {
  const searchInput = container?.querySelector('input[type="search"]');
  expect(searchInput).toBeInstanceOf(HTMLInputElement);

  act(() => {
    const input = searchInput as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("WorkflowCanvasQuickAddTrigger client interactions", () => {
  it("shows the first filtered item in a preview panel by default and switches preview on hover", () => {
    openQuickAdd();

    const preview = getPreview();
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("LLM Agent");
    expect(preview?.textContent).toContain("让 agent 继续推理。");

    const conditionButton = container?.querySelector('button[aria-label="插入 Condition"]');
    expect(conditionButton).toBeInstanceOf(HTMLButtonElement);

    const PointerEventCtor = window.PointerEvent ?? MouseEvent;
    act(() => {
      conditionButton?.dispatchEvent(new PointerEventCtor("pointerover", { bubbles: true }));
    });

    expect(getPreview()?.textContent).toContain("Condition");
    expect(getPreview()?.textContent).toContain("按条件分支继续主链。");
  });

  it("updates preview on focus, falls back to the first matching search result, and closes after insert", () => {
    const { onQuickAdd } = openQuickAdd();
    const tabs = container?.querySelectorAll('button[role="tab"]');
    expect(tabs).toHaveLength(2);

    act(() => {
      (tabs?.[1] as HTMLButtonElement).click();
    });

    expect(getPreview()?.textContent).toContain("Tool");
    expect(getPreview()?.textContent).toContain("调用工具目录中的能力。");

    setSearchValue("cond");

    expect(getPreview()?.textContent).toContain("Condition");
    expect(getPreview()?.textContent).toContain("按条件分支继续主链。");

    const conditionButton = container?.querySelector('button[aria-label="插入 Condition"]');
    expect(conditionButton).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      (conditionButton as HTMLButtonElement).focus();
      conditionButton?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      (conditionButton as HTMLButtonElement).click();
    });

    expect(onQuickAdd).toHaveBeenCalledWith("conditionNode");
    expect(container?.querySelector('[role="menu"]')).toBeNull();
  });
});
