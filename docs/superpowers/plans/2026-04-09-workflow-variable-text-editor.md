# Workflow Variable Text Editor Interaction Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把通用 `WorkflowVariableTextEditor` 重做成接近 Dify 的交互：单一可增高文本域、变量内联 token、`/` 小型浮窗、右上角“变量”按钮，并继续基于现有 `replyDocument + replyReferences + replyTemplate` 工作。

**Architecture:** 保留现有结构化变量 document/references 数据模型，不再改后端；前端新增一层“projection” 帮助把结构化 segment 映射成 textarea 可编辑字符串与内联 token 投影。`WorkflowVariableTextEditor` 负责 slash/button 入口、小型变量浮窗、当前光标插入和 token 原子删除，`OutputNodeConfigForm` 只做变量分组和结构化配置写回。

**Tech Stack:** React 19、Next.js App Router、TypeScript、Vitest、全局 CSS

---

## File Structure

- Create: `web/components/workflow-node-config-form/workflow-variable-text-projection.ts`
  - 管理 `replyDocument <-> textarea projection` 映射、sentinel 插入/删除和 token 元数据。
- Create: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts`
  - 锁住 projection、slash 清除后插入、token 整体删除这些基础行为。
- Modify: `web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx`
  - 从大块展开式树状面板改成紧凑列表内容，只保留搜索、分组、类型提示和点击插入。
- Modify: `web/components/workflow-node-config-form/workflow-variable-text-editor.tsx`
  - 重写成单一 textarea + overlay token + slash/button popup 的编辑器。
- Modify: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx`
  - 锁住 slash popup、右上角按钮、当前光标插入和 token 整体删除。
- Modify: `web/components/workflow-node-config-form/output-node-config-form.tsx`
  - 调整变量分组数据、类型标签和 editor 文案，继续写回 `replyDocument + replyReferences + replyTemplate`。
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx`
  - 锁住静态渲染包含 toolbar 按钮和内联 token，而不是下方大面板。
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx`
  - 锁住通过右上角“变量”按钮插入后仍然正确写回结构化配置。
- Modify: `web/app/globals.css`
  - 收口 editor overlay、inline token 和 popup 样式，去掉当前大卡片式变量展示。

### Task 1: Add the Textarea Projection Helper

**Files:**
- Create: `web/components/workflow-node-config-form/workflow-variable-text-projection.ts`
- Create: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts`

- [ ] **Step 1: Write the failing projection helper test**

```ts
import { describe, expect, it } from "vitest";

import {
  WORKFLOW_VARIABLE_SENTINEL,
  buildReplyDocumentFromProjection,
  buildWorkflowVariableProjection,
  insertSentinelIntoProjection,
  removeTokenBeforeCursor,
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
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts --cache=false
```

Expected: FAIL with `Cannot find module "@/components/workflow-node-config-form/workflow-variable-text-projection"` or missing export errors.

- [ ] **Step 3: Implement the projection helper**

```ts
import {
  formatWorkflowVariableMachineName,
  type WorkflowVariableReference,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

export const WORKFLOW_VARIABLE_SENTINEL = "\x1f";

export type WorkflowVariableProjectionToken = {
  refId: string;
  start: number;
  end: number;
  label: string;
  machineName: string;
};

export type WorkflowVariableProjection = {
  text: string;
  tokens: WorkflowVariableProjectionToken[];
  orderedRefIds: string[];
};

function pushTextSegment(
  segments: WorkflowVariableTextDocument["segments"],
  text: string,
) {
  if (!text) {
    return;
  }

  const lastSegment = segments.at(-1);
  if (lastSegment?.type === "text") {
    lastSegment.text += text;
    return;
  }

  segments.push({ type: "text", text });
}

export function buildWorkflowVariableProjection({
  ownerLabel,
  document,
  references,
}: {
  ownerLabel: string;
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
}): WorkflowVariableProjection {
  const referenceMap = new Map(references.map((reference) => [reference.refId, reference]));
  const tokens: WorkflowVariableProjectionToken[] = [];
  const orderedRefIds: string[] = [];
  let cursor = 0;
  let text = "";

  document.segments.forEach((segment) => {
    if (segment.type === "text") {
      text += segment.text;
      cursor += segment.text.length;
      return;
    }

    const reference = referenceMap.get(segment.refId);
    if (!reference) {
      return;
    }

    text += WORKFLOW_VARIABLE_SENTINEL;
    tokens.push({
      refId: reference.refId,
      start: cursor,
      end: cursor + 1,
      label: `[${ownerLabel}] ${reference.alias}`,
      machineName: formatWorkflowVariableMachineName(reference),
    });
    orderedRefIds.push(reference.refId);
    cursor += 1;
  });

  return {
    text,
    tokens,
    orderedRefIds,
  };
}

export function buildReplyDocumentFromProjection({
  text,
  orderedRefIds,
}: {
  text: string;
  orderedRefIds: string[];
}): WorkflowVariableTextDocument {
  const segments: WorkflowVariableTextDocument["segments"] = [];
  let textBuffer = "";
  let refIndex = 0;

  for (const character of text) {
    if (character !== WORKFLOW_VARIABLE_SENTINEL) {
      textBuffer += character;
      continue;
    }

    pushTextSegment(segments, textBuffer);
    textBuffer = "";

    const refId = orderedRefIds[refIndex];
    if (refId) {
      segments.push({ type: "variable", refId });
    }

    refIndex += 1;
  }

  pushTextSegment(segments, textBuffer);

  return {
    version: 1,
    segments: segments.length > 0 ? segments : [{ type: "text", text: "" }],
  };
}

function countSentinelsBeforeIndex(text: string, index: number) {
  let count = 0;
  const clampedIndex = Math.max(0, Math.min(index, text.length));

  for (let cursor = 0; cursor < clampedIndex; cursor += 1) {
    if (text[cursor] === WORKFLOW_VARIABLE_SENTINEL) {
      count += 1;
    }
  }

  return count;
}

export function insertSentinelIntoProjection({
  text,
  cursor,
  orderedRefIds,
  refId,
  removeLeadingSlash,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
  refId: string;
  removeLeadingSlash: boolean;
}) {
  let nextText = text;
  let nextCursor = cursor;

  if (removeLeadingSlash && nextCursor > 0 && nextText[nextCursor - 1] === "/") {
    nextText = `${nextText.slice(0, nextCursor - 1)}${nextText.slice(nextCursor)}`;
    nextCursor -= 1;
  }

  const tokenInsertIndex = countSentinelsBeforeIndex(nextText, nextCursor);

  return {
    text: `${nextText.slice(0, nextCursor)}${WORKFLOW_VARIABLE_SENTINEL}${nextText.slice(nextCursor)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenInsertIndex),
      refId,
      ...orderedRefIds.slice(tokenInsertIndex),
    ],
    cursor: nextCursor + 1,
  };
}

export function removeTokenBeforeCursor({
  text,
  cursor,
  orderedRefIds,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
}) {
  if (cursor <= 0 || text[cursor - 1] !== WORKFLOW_VARIABLE_SENTINEL) {
    return {
      text,
      orderedRefIds,
      cursor,
    };
  }

  const tokenIndex = countSentinelsBeforeIndex(text, cursor) - 1;

  return {
    text: `${text.slice(0, cursor - 1)}${text.slice(cursor)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      ...orderedRefIds.slice(tokenIndex + 1),
    ],
    cursor: cursor - 1,
  };
}

export function removeTokenAfterCursor({
  text,
  cursor,
  orderedRefIds,
}: {
  text: string;
  cursor: number;
  orderedRefIds: string[];
}) {
  if (text[cursor] !== WORKFLOW_VARIABLE_SENTINEL) {
    return {
      text,
      orderedRefIds,
      cursor,
    };
  }

  const tokenIndex = countSentinelsBeforeIndex(text, cursor);

  return {
    text: `${text.slice(0, cursor)}${text.slice(cursor + 1)}`,
    orderedRefIds: [
      ...orderedRefIds.slice(0, tokenIndex),
      ...orderedRefIds.slice(tokenIndex + 1),
    ],
    cursor,
  };
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts --cache=false
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add web/components/workflow-node-config-form/workflow-variable-text-projection.ts web/components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts
git commit -m "feat(workflow): add variable text projection helper"
```

### Task 2: Rebuild the Inline Editor and Compact Picker

**Files:**
- Modify: `web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx`
- Modify: `web/components/workflow-node-config-form/workflow-variable-text-editor.tsx`
- Modify: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx`

- [ ] **Step 1: Rewrite the editor test around slash popup, toolbar button, and token delete**

```tsx
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
  it("opens a compact popup on slash and inserts the variable in place", () => {
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
            segments: [{ type: "text", text: "/" }],
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
                  valueTypeLabel: "String",
                },
              ],
            },
          ],
          onChange: handleChange,
        }),
      );
    });

    expect(document.querySelector('[data-component="workflow-variable-reference-popover"]')).toBeTruthy();
    expect(document.body.textContent).toContain("搜索变量");
    expect(document.body.textContent).not.toContain("复制机器别名");

    const insertButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("text"),
    ) as HTMLButtonElement;

    act(() => {
      insertButton.click();
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
          variables: [],
          onChange: handleChange,
        }),
      );
    });

    expect(document.body.textContent).toContain("[直接回复] text");
    expect(document.querySelector('[data-component="workflow-variable-reference-picker"]')).toBeFalsy();

    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain(WORKFLOW_VARIABLE_SENTINEL);

    act(() => {
      textarea.focus();
      textarea.setSelectionRange(7, 7);
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
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
```

- [ ] **Step 2: Run the editor test to verify it fails**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx --cache=false
```

Expected: FAIL because the current editor still renders slot textareas, alias inputs, and the large inline picker.

- [ ] **Step 3: Rebuild the picker and editor**

```tsx
// web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx
"use client";

import React, { useMemo, useState } from "react";

import type {
  WorkflowVariableReferenceGroup,
  WorkflowVariableReferenceItem,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

export function WorkflowVariableReferencePicker({
  groups,
  onInsert,
}: {
  groups: WorkflowVariableReferenceGroup[];
  onInsert: (selector: string[]) => void;
}) {
  const [query, setQuery] = useState("");

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const haystack = `${item.label} ${item.previewPath}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <div
      className="workflow-variable-reference-popover"
      data-component="workflow-variable-reference-popover"
    >
      <input
        className="trace-text-input"
        value={query}
        onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
        placeholder="搜索变量"
      />
      <div className="workflow-variable-reference-popover-body">
        {visibleGroups.map((group) => (
          <section key={group.key} className="workflow-variable-reference-popover-group">
            <strong>{group.label}</strong>
            <div className="workflow-variable-reference-popover-items">
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="workflow-variable-reference-popover-item"
                  onClick={() => onInsert(item.selector)}
                >
                  <span className="workflow-variable-reference-popover-item-main">
                    <span>{item.label}</span>
                    <small>{item.previewPath}</small>
                  </span>
                  <span className="workflow-variable-reference-popover-item-type">
                    {item.valueTypeLabel ?? "Value"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// web/components/workflow-node-config-form/workflow-variable-text-editor.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import {
  buildReplyVariableReference,
  type WorkflowVariableReference,
  type WorkflowVariableReferenceGroup,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";
import {
  buildReplyDocumentFromProjection,
  buildWorkflowVariableProjection,
  insertSentinelIntoProjection,
  removeTokenAfterCursor,
  removeTokenBeforeCursor,
} from "@/components/workflow-node-config-form/workflow-variable-text-projection";
import { WorkflowVariableReferencePicker } from "@/components/workflow-node-config-form/workflow-variable-reference-picker";

function selectorsMatch(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findReferenceBySelector(
  references: WorkflowVariableReference[],
  selector: string[],
) {
  return references.find((reference) => selectorsMatch(reference.selector, selector));
}

export function WorkflowVariableTextEditor({
  ownerNodeId,
  ownerLabel,
  value,
  references,
  variables,
  placeholder = "输入正文，输入 / 插入变量",
  onChange,
}: {
  ownerNodeId: string;
  ownerLabel: string;
  value: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
  variables: WorkflowVariableReferenceGroup[];
  placeholder?: string;
  onChange: (next: {
    document: WorkflowVariableTextDocument;
    references: WorkflowVariableReference[];
  }) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pickerTop, setPickerTop] = useState(56);
  const projection = useMemo(
    () => buildWorkflowVariableProjection({ ownerLabel, document: value, references }),
    [ownerLabel, references, value],
  );

  useEffect(() => {
    if (!isPickerOpen) {
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const nextTop = Math.min(textarea.scrollHeight + 14, 280);
    setPickerTop(nextTop);
  }, [isPickerOpen, projection.text]);

  const commitProjection = (nextText: string, nextRefIds: string[], nextReferences = references) => {
    const usedRefIds = new Set(nextRefIds);
    onChange({
      document: buildReplyDocumentFromProjection({
        text: nextText,
        orderedRefIds: nextRefIds,
      }),
      references: nextReferences.filter((reference) => usedRefIds.has(reference.refId)),
    });
  };

  const insertVariableAtSelection = (selector: string[], removeLeadingSlash: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const existingReference = findReferenceBySelector(references, selector);
    const nextReference =
      existingReference ??
      buildReplyVariableReference({
        ownerNodeId,
        aliasBase: selector.at(-1) || "value",
        selector,
        existingAliases: references.map((reference) => reference.alias),
      });

    const inserted = insertSentinelIntoProjection({
      text: projection.text,
      cursor: textarea.selectionStart ?? projection.text.length,
      orderedRefIds: projection.orderedRefIds,
      refId: nextReference.refId,
      removeLeadingSlash,
    });

    commitProjection(
      inserted.text,
      inserted.orderedRefIds,
      existingReference ? references : [...references, nextReference],
    );
    setIsPickerOpen(false);
  };

  return (
    <div
      className="workflow-variable-text-editor-shell"
      data-component="workflow-variable-text-editor"
    >
      <div className="workflow-variable-text-editor-toolbar" data-component="workflow-variable-text-editor-toolbar">
        <button
          type="button"
          className="sync-button secondary-button"
          data-action="open-variable-picker"
          onClick={() => setIsPickerOpen(true)}
        >
          变量
        </button>
      </div>

      <div className="workflow-variable-text-editor-composer">
        <div className="workflow-variable-text-editor-overlay" aria-hidden="true">
          {projection.tokens.length === 0 && projection.text.length === 0 ? (
            <span className="workflow-variable-text-editor-placeholder">{placeholder}</span>
          ) : (
            value.segments.map((segment, index) =>
              segment.type === "text" ? (
                <span key={`text-${index}`}>{segment.text}</span>
              ) : (
                <span
                  key={segment.refId}
                  className="workflow-variable-inline-token"
                  data-component="workflow-variable-inline-token"
                >
                  {projection.tokens.find((token) => token.refId === segment.refId)?.label ?? segment.refId}
                </span>
              ),
            )
          )}
        </div>

        <textarea
          ref={textareaRef}
          className="workflow-variable-text-editor-input"
          value={projection.text}
          onInput={(event) => {
            const nextText = (event.target as HTMLTextAreaElement).value;
            commitProjection(nextText, projection.orderedRefIds);
            setIsPickerOpen(nextText[(event.target as HTMLTextAreaElement).selectionStart - 1] === "/");
          }}
          onKeyDown={(event) => {
            const textarea = event.currentTarget;

            if (event.key === "Backspace") {
              const removed = removeTokenBeforeCursor({
                text: projection.text,
                cursor: textarea.selectionStart,
                orderedRefIds: projection.orderedRefIds,
              });

              if (removed.text !== projection.text) {
                event.preventDefault();
                commitProjection(removed.text, removed.orderedRefIds);
              }
            }

            if (event.key === "Delete") {
              const removed = removeTokenAfterCursor({
                text: projection.text,
                cursor: textarea.selectionStart,
                orderedRefIds: projection.orderedRefIds,
              });

              if (removed.text !== projection.text) {
                event.preventDefault();
                commitProjection(removed.text, removed.orderedRefIds);
              }
            }

            if (event.key === "Escape") {
              setIsPickerOpen(false);
            }
          }}
          placeholder={placeholder}
          rows={1}
        />

        {isPickerOpen ? (
          <div className="workflow-variable-reference-popover-anchor" style={{ top: `${pickerTop}px` }}>
            <WorkflowVariableReferencePicker
              groups={variables}
              onInsert={(selector) => insertVariableAtSelection(selector, projection.text[(textareaRef.current?.selectionStart ?? 0) - 1] === "/")}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the editor test to verify it passes**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx --cache=false
```

Expected: PASS with all tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx web/components/workflow-node-config-form/workflow-variable-text-editor.tsx web/components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx web/components/workflow-node-config-form/workflow-variable-text-projection.ts web/components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts
git commit -m "feat(workflow): rebuild inline variable text editor"
```

### Task 3: Reconnect OutputNodeConfigForm and Styles

**Files:**
- Modify: `web/components/workflow-node-config-form/output-node-config-form.tsx`
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx`
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx`
- Modify: `web/app/globals.css`

- [ ] **Step 1: Rewrite the output-form tests to match the toolbar + inline token model**

```tsx
// web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";

describe("OutputNodeConfigForm", () => {
  it("renders the inline variable editor toolbar instead of the large variable panel", () => {
    const html = renderToStaticMarkup(
      createElement(OutputNodeConfigForm, {
        node: {
          id: "endNode_ab12cd34",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "直接回复",
            nodeType: "endNode",
            config: {
              replyDocument: {
                version: 1,
                segments: [
                  { type: "text", text: "你好，" },
                  { type: "variable", refId: "ref_1" },
                ],
              },
              replyReferences: [
                {
                  refId: "ref_1",
                  alias: "answer",
                  ownerNodeId: "endNode_ab12cd34",
                  selector: ["accumulated", "agent", "answer"],
                },
              ],
            },
          },
        } as never,
        nodes: [] as never,
        onChange: () => undefined,
      }),
    );

    expect(html).toContain("workflow-variable-text-editor-toolbar");
    expect(html).toContain("[直接回复] answer");
    expect(html).not.toContain("复制机器别名");
  });
});
```

```tsx
// web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx
// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("OutputNodeConfigForm client render", () => {
  it("writes replyDocument, replyReferences, and replyTemplate after inserting from the toolbar button", () => {
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
      replyTemplate: "hello {{#endNode_ab12cd34.text#}}world",
    });
  });
});
```

- [ ] **Step 2: Run the output-form tests to verify they fail**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx --cache=false
```

Expected: FAIL because `OutputNodeConfigForm` still exposes old helper copy and the editor does not yet behave like a toolbar-driven inline composer.

- [ ] **Step 3: Update the output form wiring and styles**

```ts
// web/components/workflow-node-config-form/output-node-config-form.tsx
function formatSchemaTypeLabel(schema: unknown) {
  const record = toRecord(schema);
  const type = typeof record?.type === "string" ? record.type : "string";

  if (type === "string") {
    return "String";
  }
  if (type === "number" || type === "integer") {
    return "Number";
  }
  if (type === "boolean") {
    return "Boolean";
  }
  if (type === "array") {
    const itemType = typeof toRecord(record?.items)?.type === "string" ? String(toRecord(record?.items)?.type) : "Value";
    return `Array[${itemType[0]?.toUpperCase() ?? "V"}${itemType.slice(1)}]`;
  }
  return "Object";
}

function buildLeafItem({
  key,
  label,
  selector,
  ownerNodeId,
  valueTypeLabel,
}: {
  key: string;
  label: string;
  selector: string[];
  ownerNodeId: string;
  valueTypeLabel: string;
}): WorkflowVariableReferenceItem {
  const aliasBase = selector.at(-1) || "value";
  const machineName = `${ownerNodeId}.${aliasBase}`;

  return {
    key,
    label,
    selector,
    previewPath: selector.join("."),
    machineName,
    token: `{{#${machineName}#}}`,
    valueTypeLabel,
  };
}
```

```css
/* web/app/globals.css */
.workflow-variable-text-editor-shell {
  display: grid;
  gap: 10px;
}

.workflow-variable-text-editor-toolbar {
  display: flex;
  justify-content: flex-end;
}

.workflow-variable-text-editor-composer {
  position: relative;
  min-height: 84px;
  border: 1px solid rgba(28, 25, 21, 0.14);
  border-radius: 18px;
  background: #fff;
  padding: 14px 16px;
}

.workflow-variable-text-editor-overlay {
  position: absolute;
  inset: 14px 16px;
  pointer-events: none;
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--ink);
}

.workflow-variable-text-editor-input {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: 56px;
  resize: none;
  border: none;
  background: transparent;
  color: transparent;
  caret-color: var(--ink);
  font: inherit;
  line-height: 1.6;
}

.workflow-variable-inline-token {
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid rgba(52, 105, 255, 0.22);
  border-radius: 999px;
  background: rgba(236, 243, 255, 0.92);
  color: #1f5ed5;
}

.workflow-variable-reference-popover-anchor {
  position: absolute;
  left: 16px;
  z-index: 3;
}

.workflow-variable-reference-popover {
  width: min(360px, calc(100vw - 64px));
  max-height: 320px;
  overflow: auto;
  border: 1px solid rgba(28, 25, 21, 0.12);
  border-radius: 18px;
  background: #fff;
  padding: 12px;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}
```

- [ ] **Step 4: Run the output-form tests to verify they pass**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx --cache=false
```

Expected: PASS with all four test files green.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add web/components/workflow-node-config-form/output-node-config-form.tsx web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx web/app/globals.css
git commit -m "feat(workflow): align variable text editor with dify interaction"
```

### Task 4: Full Frontend Verification and Branch Hygiene

**Files:**
- Verify: `web/components/workflow-node-config-form/workflow-variable-text-projection.ts`
- Verify: `web/components/workflow-node-config-form/workflow-variable-text-editor.tsx`
- Verify: `web/components/workflow-node-config-form/output-node-config-form.tsx`
- Verify: `web/app/globals.css`

- [ ] **Step 1: Run the full targeted frontend verification**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-projection.test.ts components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx --cache=false
```

Expected: PASS with all target tests green.

- [ ] **Step 2: Run lint and diff checks**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web lint && git diff --check
```

Expected: `✔ No ESLint warnings or errors` and no `git diff --check` output.

- [ ] **Step 3: Run type-check and record existing unrelated failures if they persist**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec tsc --noEmit --incremental false
```

Expected: if the repository-wide pre-existing failures still persist, they should remain limited to:

```text
components/__tests__/workflow-create-wizard.test.ts(44,5)
components/__tests__/workflow-studio-layout-shell.test.tsx(57,9)
```

Any new `workflow-variable-*` or `output-node-config-form` type failure means this task is not done.

- [ ] **Step 4: Push the branch**

```bash
cd /home/taichu/git/7flows
git push origin taichuy_dev
```
