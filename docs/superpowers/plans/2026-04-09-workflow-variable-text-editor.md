# Workflow Variable Text Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `endNode` 的直接回复配置落地第一版结构化变量文本编辑器：支持 `/` 触发变量选择器、节点内 alias、结构化 `replyDocument + replyReferences`、以及与旧 `replyTemplate` 的兼容。

**Architecture:** 先把 `endNode` 的变量文本模型从纯字符串拆成“document + references + template 派生”三层，再实现一个仅服务文本变量场景的 `WorkflowVariableTextEditor`，最后把 `OutputNodeConfigForm` 接到这套新模型，并在后端增加结构化渲染与 schema 校验。前端编排显示走 `[当前节点标题] alias`，复制与兼容 token 走 `ownerNodeId.alias`，runtime 仍通过 `selector` 取值。

**Tech Stack:** React 19、Next.js App Router、TypeScript、Vitest、Python 3.12、Pydantic、Pytest

---

## File Structure

- Create: `web/components/workflow-node-config-form/workflow-variable-text-document.ts`
  - 承载 `WorkflowVariableTextDocument` / `WorkflowVariableReference` 类型，以及 parse / serialize / alias 生成 helper。
- Create: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts`
  - 锁住 document/reference 与 `replyTemplate` 的往返转换和 alias 生成规则。
- Create: `web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx`
  - 承载接近 Dify 的变量选择器弹层：搜索、分组、展开、路径预览、复制机器别名。
- Create: `web/components/workflow-node-config-form/workflow-variable-text-editor.tsx`
  - 通用文本变量编辑器，负责 `/` 触发、渲染 text/variable segment、节点内 alias 编辑与联动。
- Create: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx`
  - 锁住 editor 的 `/` 触发、插入变量、alias 改名联动与复制行为。
- Modify: `web/components/workflow-node-config-form/output-node-config-form.tsx`
  - 从 `textarea + token button` 改成 `WorkflowVariableTextEditor + document/reference/template` 适配层。
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx`
  - 锁住静态渲染改为 editor 入口与结构化配置存在时的初始值。
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx`
  - 锁住 `OutputNodeConfigForm` 保存 `replyDocument + replyReferences + replyTemplate`。
- Modify: `api/app/schemas/workflow_node_validation.py`
  - 为 `endNode` 增加 `replyDocument` / `replyReferences` 校验模型。
- Modify: `api/app/services/runtime_node_dispatch_support.py`
  - 新增结构化 `replyDocument + replyReferences` 渲染分支，并保持旧 `replyTemplate` 兼容。
- Modify: `api/tests/test_runtime_service_agent_runtime.py`
  - 锁住结构化模型渲染、alias token 兼容和旧模板兼容。
- Modify: `api/tests/test_workflow_routes.py`
  - 锁住 `replyDocument` / `replyReferences` 通过 workflow definition 校验。

### Task 1: Add the Structured Reply Document Model

**Files:**
- Create: `web/components/workflow-node-config-form/workflow-variable-text-document.ts`
- Create: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts`

- [ ] **Step 1: Write the failing document-model test**

```ts
import { describe, expect, it } from "vitest";

import {
  buildReplyVariableReference,
  formatWorkflowVariableMachineName,
  formatWorkflowVariableToken,
  parseReplyTemplateToDocument,
  serializeReplyDocumentToTemplate,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";

describe("workflow-variable-text-document", () => {
  it("parses selector tokens into document and references, then serializes machine-name tokens", () => {
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
      })
    ).toBe("你好，{{#endNode_ab12cd34.answer#}}");
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
    expect(formatWorkflowVariableToken(first)).toBe("{{#endNode_ab12cd34.text#}}");
    expect(second.alias).toBe("text_2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts --cache=false
```

Expected: FAIL with `Cannot find module "@/components/workflow-node-config-form/workflow-variable-text-document"` or missing export errors.

- [ ] **Step 3: Implement the document/reference helper**

```ts
// web/components/workflow-node-config-form/workflow-variable-text-document.ts
export type WorkflowVariableTextDocument = {
  version: 1;
  segments: Array<
    | { type: "text"; text: string }
    | { type: "variable"; refId: string }
  >;
};

export type WorkflowVariableReference = {
  refId: string;
  alias: string;
  ownerNodeId: string;
  selector: string[];
};

export type WorkflowVariableReferenceItem = {
  key: string;
  label: string;
  selector: string[];
  token: string;
  previewPath: string;
  machineName: string;
};

export type WorkflowVariableReferenceGroup = {
  key: string;
  label: string;
  items: WorkflowVariableReferenceItem[];
};

const REPLY_TOKEN_PATTERN = /\{\{\s*(?:#\s*([^{}#]+?)\s*#|([^{}]+?))\s*\}\}/g;

export function buildReplyVariableReference({
  ownerNodeId,
  aliasBase,
  selector,
  existingAliases,
  refId,
}: {
  ownerNodeId: string;
  aliasBase: string;
  selector: string[];
  existingAliases: string[];
  refId?: string;
}): WorkflowVariableReference {
  const normalizedBase = aliasBase.trim().replace(/[^\w]+/g, "_") || "value";
  let alias = normalizedBase;
  let suffix = 2;
  while (existingAliases.includes(alias)) {
    alias = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }
  return {
    refId: refId ?? `ref_${existingAliases.length + 1}`,
    alias,
    ownerNodeId,
    selector,
  };
}

export function formatWorkflowVariableMachineName(reference: WorkflowVariableReference) {
  return `${reference.ownerNodeId}.${reference.alias}`;
}

export function formatWorkflowVariableToken(reference: WorkflowVariableReference) {
  return `{{#${formatWorkflowVariableMachineName(reference)}#}}`;
}

export function parseReplyTemplateToDocument({
  ownerNodeId,
  ownerLabel: _ownerLabel,
  replyTemplate,
}: {
  ownerNodeId: string;
  ownerLabel: string;
  replyTemplate: string;
}) {
  const segments: WorkflowVariableTextDocument["segments"] = [];
  const references: WorkflowVariableReference[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  REPLY_TOKEN_PATTERN.lastIndex = 0;
  while ((match = REPLY_TOKEN_PATTERN.exec(replyTemplate)) !== null) {
    const matchText = match[0];
    const rawPath = (match[1] || match[2] || "").trim();
    if (match.index > cursor) {
      segments.push({ type: "text", text: replyTemplate.slice(cursor, match.index) });
    }
    const selector = rawPath.split(".").filter(Boolean);
    const aliasBase = selector.at(-1) || "value";
    const reference = buildReplyVariableReference({
      ownerNodeId,
      aliasBase,
      selector,
      existingAliases: references.map((item) => item.alias),
      refId: `ref_${references.length + 1}`,
    });
    references.push(reference);
    segments.push({ type: "variable", refId: reference.refId });
    cursor = match.index + matchText.length;
  }

  if (cursor < replyTemplate.length) {
    segments.push({ type: "text", text: replyTemplate.slice(cursor) });
  }

  return {
    document: {
      version: 1,
      segments: segments.length > 0 ? segments : [{ type: "text", text: "" }],
    } satisfies WorkflowVariableTextDocument,
    references,
  };
}

export function serializeReplyDocumentToTemplate({
  document,
  references,
}: {
  document: WorkflowVariableTextDocument;
  references: WorkflowVariableReference[];
}) {
  const referenceMap = new Map(references.map((item) => [item.refId, item]));
  return document.segments
    .map((segment) => {
      if (segment.type === "text") {
        return segment.text;
      }
      const reference = referenceMap.get(segment.refId);
      return reference ? formatWorkflowVariableToken(reference) : "";
    })
    .join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts --cache=false
```

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add web/components/workflow-node-config-form/workflow-variable-text-document.ts web/components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts
git commit -m "feat(workflow): add reply document model"
```

### Task 2: Build the Variable Picker and Text Editor

**Files:**
- Create: `web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx`
- Create: `web/components/workflow-node-config-form/workflow-variable-text-editor.tsx`
- Create: `web/components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx`

- [ ] **Step 1: Write the failing editor interaction test**

```tsx
// @vitest-environment jsdom
import * as React from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  it("opens picker on slash, inserts a variable ref, and renames aliases in-place", () => {
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
              key: "accumulated",
              label: "上游节点",
              items: [
                {
                  key: "llm-text",
                  label: "LLM.text",
                  selector: ["accumulated", "llm", "text"],
                  token: "{{#endNode_ab12cd34.text#}}",
                  previewPath: "accumulated.llm.text",
                },
              ],
            },
          ],
          onChange: handleChange,
        })
      );
    });

    expect(document.body.textContent).toContain("上游节点");
    expect(document.body.textContent).toContain("accumulated.llm.text");

    const insertButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("LLM.text")
    ) as HTMLButtonElement;

    act(() => {
      insertButton.click();
    });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        document: {
          version: 1,
          segments: [{ type: "variable", refId: "ref_1" }],
        },
        references: [
          expect.objectContaining({
            refId: "ref_1",
            alias: "text",
            ownerNodeId: "endNode_ab12cd34",
            selector: ["accumulated", "llm", "text"],
          }),
        ],
      })
    );

    act(() => {
      root?.render(
        createElement(WorkflowVariableTextEditor, {
          ownerNodeId: "endNode_ab12cd34",
          ownerLabel: "直接回复",
          value: {
            version: 1,
            segments: [
              { type: "variable", refId: "ref_1" },
              { type: "text", text: " + " },
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
          variables: [],
          onChange: handleChange,
        })
      );
    });

    const aliasInput = document.querySelector('input[value="text"]') as HTMLInputElement;
    act(() => {
      aliasInput.value = "reply";
      aliasInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(handleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        references: [
          expect.objectContaining({
            refId: "ref_1",
            alias: "reply",
            ownerNodeId: "endNode_ab12cd34",
          }),
        ],
      })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx --cache=false
```

Expected: FAIL with missing component/module errors.

- [ ] **Step 3: Implement the picker and editor**

```tsx
// web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx
"use client";

import { useMemo, useState } from "react";

import type { WorkflowVariableReferenceGroup } from "@/components/workflow-node-config-form/workflow-variable-text-document";

export function WorkflowVariableReferencePicker({
  groups,
  onInsert,
  onCopyMachineName,
}: {
  groups: WorkflowVariableReferenceGroup[];
  onInsert: (selector: string[]) => void;
  onCopyMachineName: (machineName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleGroups = useMemo(() => {
    if (!query.trim()) {
      return groups;
    }
    const normalized = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.label.toLowerCase().includes(normalized) ||
            item.previewPath.toLowerCase().includes(normalized)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  return (
    <div className="binding-help" data-component="workflow-variable-reference-picker">
      <input
        className="trace-text-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索变量或路径"
      />
      {visibleGroups.map((group) => (
        <section key={group.key}>
          <strong>{group.label}</strong>
          {group.items.map((item) => (
            <div key={item.key} data-component="workflow-variable-picker-item">
              <button type="button" className="sync-button" onClick={() => onInsert(item.selector)}>
                {item.label}
              </button>
              <span>{item.previewPath}</span>
              <button
                type="button"
                className="sync-button"
                onClick={() => onCopyMachineName(item.machineName)}
              >
                复制机器别名
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
```

```tsx
// web/components/workflow-node-config-form/workflow-variable-text-editor.tsx
"use client";

import { useMemo } from "react";

import {
  buildReplyVariableReference,
  formatWorkflowVariableMachineName,
  type WorkflowVariableReferenceGroup,
  type WorkflowVariableReference,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";
import { WorkflowVariableReferencePicker } from "@/components/workflow-node-config-form/workflow-variable-reference-picker";

export function WorkflowVariableTextEditor({
  ownerNodeId,
  ownerLabel,
  value,
  references,
  variables,
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
  const shouldShowPicker = useMemo(() => {
    const lastSegment = value.segments.at(-1);
    return lastSegment?.type === "text" && lastSegment.text.endsWith("/");
  }, [value]);

  const referenceMap = useMemo(
    () => new Map(references.map((reference) => [reference.refId, reference])),
    [references]
  );

  return (
    <div data-component="workflow-variable-text-editor">
      <div className="editor-json-area">
        {value.segments.map((segment) => {
          if (segment.type === "text") {
            return <span key={`text-${segment.text}`}>{segment.text}</span>;
          }
          const reference = referenceMap.get(segment.refId);
          return (
            <span key={segment.refId}>
              <button type="button" className="sync-button">
                [{ownerLabel}] {reference?.alias}
              </button>
              <input
                className="trace-text-input"
                value={reference?.alias ?? ""}
                onChange={(event) => {
                  const nextAlias = event.target.value.trim() || "value";
                  onChange({
                    document: value,
                    references: references.map((item) =>
                      item.refId === segment.refId ? { ...item, alias: nextAlias } : item
                    ),
                  });
                }}
              />
            </span>
          );
        })}
      </div>
      {shouldShowPicker ? (
        <WorkflowVariableReferencePicker
          groups={variables}
          onInsert={(selector) => {
            const nextReference = buildReplyVariableReference({
              ownerNodeId,
              aliasBase: selector.at(-1) || "value",
              selector,
              existingAliases: references.map((item) => item.alias),
            });
            onChange({
              document: {
                version: 1,
                segments: [{ type: "variable", refId: nextReference.refId }],
              },
              references: [...references, nextReference],
            });
          }}
          onCopyMachineName={(machineName) => {
            void navigator.clipboard?.writeText(machineName);
          }}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the editor test to verify it passes**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts --cache=false
```

Expected: PASS with both test files green.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add web/components/workflow-node-config-form/workflow-variable-reference-picker.tsx web/components/workflow-node-config-form/workflow-variable-text-editor.tsx web/components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx web/components/workflow-node-config-form/workflow-variable-text-document.ts web/components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts
git commit -m "feat(workflow): add variable text editor"
```

### Task 3: Integrate the Editor into `OutputNodeConfigForm`

**Files:**
- Modify: `web/components/workflow-node-config-form/output-node-config-form.tsx`
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx`
- Modify: `web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx`

- [ ] **Step 1: Rewrite the output-form tests to expect structured config writes**

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
  it("writes replyDocument, replyReferences, and replyTemplate together", () => {
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
              config: { replyTemplate: "/" },
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
              },
            },
          ] as never,
          onChange: handleChange,
        })
      );
    });

    const insertButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("LLM.text")
    ) as HTMLButtonElement;

    act(() => {
      insertButton.click();
    });

    expect(handleChange).toHaveBeenLastCalledWith({
      replyDocument: {
        version: 1,
        segments: [{ type: "variable", refId: "ref_1" }],
      },
      replyReferences: [
        {
          refId: "ref_1",
          alias: "text",
          ownerNodeId: "endNode_ab12cd34",
          selector: ["accumulated", "agent", "text"],
        },
      ],
      replyTemplate: "{{#endNode_ab12cd34.text#}}",
    });
  });
});
```

```tsx
// web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";

describe("OutputNodeConfigForm", () => {
  it("renders the structured variable editor entry", () => {
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
                segments: [{ type: "text", text: "你好，" }, { type: "variable", refId: "ref_1" }],
              },
              replyReferences: [
                {
                  refId: "ref_1",
                  alias: "text",
                  ownerNodeId: "endNode_ab12cd34",
                  selector: ["accumulated", "agent", "text"],
                },
              ],
              replyTemplate: "你好，{{#endNode_ab12cd34.text#}}",
            },
          },
        } as never,
        nodes: [] as never,
        onChange: () => undefined,
      })
    );

    expect(html).toContain("workflow-variable-text-editor");
    expect(html).toContain("[直接回复] text");
    expect(html).toContain("回复字段名");
  });
});
```

- [ ] **Step 2: Run the output-form tests to verify they fail**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx --cache=false
```

Expected: FAIL because `OutputNodeConfigForm` still writes only `replyTemplate`.

- [ ] **Step 3: Integrate `WorkflowVariableTextEditor` into the output form**

```tsx
// web/components/workflow-node-config-form/output-node-config-form.tsx
"use client";

import type { Node } from "@xyflow/react";

import type { WorkflowCanvasNodeData } from "@/lib/workflow-editor";
import { cloneRecord } from "@/components/workflow-node-config-form/shared";
import {
  parseReplyTemplateToDocument,
  serializeReplyDocumentToTemplate,
  type WorkflowVariableReference,
  type WorkflowVariableTextDocument,
} from "@/components/workflow-node-config-form/workflow-variable-text-document";
import {
  WorkflowVariableTextEditor,
  type WorkflowVariableReferenceGroup,
} from "@/components/workflow-node-config-form/workflow-variable-text-editor";

export function OutputNodeConfigForm({
  node,
  nodes,
  onChange,
}: {
  node: Node<WorkflowCanvasNodeData>;
  nodes: Array<Node<WorkflowCanvasNodeData>>;
  onChange: (nextConfig: Record<string, unknown>) => void;
}) {
  const config = cloneRecord(node.data.config);
  const normalized = (() => {
    const replyDocument = config.replyDocument;
    const replyReferences = config.replyReferences;
    if (
      replyDocument &&
      typeof replyDocument === "object" &&
      Array.isArray((replyDocument as any).segments) &&
      Array.isArray(replyReferences)
    ) {
      return {
        document: replyDocument as WorkflowVariableTextDocument,
        references: replyReferences as WorkflowVariableReference[],
      };
    }
    return parseReplyTemplateToDocument({
      ownerNodeId: node.id,
      ownerLabel: node.data.label,
      replyTemplate: typeof config.replyTemplate === "string" ? config.replyTemplate : "",
    });
  })();

  const variableGroups: WorkflowVariableReferenceGroup[] = [
    {
      key: "mapped",
      label: "当前节点映射字段",
      items: [
        {
          key: "mapped-text",
          label: "text",
          selector: ["text"],
          token: `{{#${node.id}.text#}}`,
          previewPath: "text",
          machineName: `${node.id}.text`,
        },
      ],
    },
    {
      key: "upstream",
      label: "上游节点",
      items: nodes
        .filter((item) => item.id !== node.id)
        .map((item) => ({
          key: `${item.id}-answer`,
          label: `${item.data.label}.text`,
          selector: ["accumulated", item.id, "text"],
          token: `{{#${node.id}.text#}}`,
          previewPath: `accumulated.${item.id}.text`,
          machineName: `${node.id}.text`,
        })),
    },
  ];

  return (
    <div className="binding-form">
      <WorkflowVariableTextEditor
        ownerNodeId={node.id}
        ownerLabel={node.data.label}
        value={normalized.document}
        references={normalized.references}
        variables={variableGroups}
        onChange={({ document, references }) => {
          onChange({
            ...config,
            replyDocument: document,
            replyReferences: references,
            replyTemplate: serializeReplyDocumentToTemplate({ document, references }),
          });
        }}
      />
      <label className="binding-field">
        <span className="binding-label">回复字段名</span>
        <input
          className="trace-text-input"
          value={typeof config.responseKey === "string" ? config.responseKey : ""}
          onChange={(event) =>
            onChange({
              ...config,
              responseKey: event.target.value.trim() || undefined,
              replyDocument: normalized.document,
              replyReferences: normalized.references,
              replyTemplate: serializeReplyDocumentToTemplate(normalized),
            })
          }
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run the output-form tests to verify they pass**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx --cache=false
```

Expected: PASS with all four test files green.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add web/components/workflow-node-config-form/output-node-config-form.tsx web/components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx web/components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx
git commit -m "feat(workflow): integrate variable text editor"
```

### Task 4: Add Backend Validation and Structured Rendering

**Files:**
- Modify: `api/app/schemas/workflow_node_validation.py`
- Modify: `api/app/services/runtime_node_dispatch_support.py`
- Modify: `api/tests/test_runtime_service_agent_runtime.py`
- Modify: `api/tests/test_workflow_routes.py`

- [ ] **Step 1: Add the failing backend tests**

```py
# api/tests/test_runtime_service_agent_runtime.py
def test_end_node_renders_structured_reply_document(sqlite_session: Session) -> None:
    workflow = Workflow(
        id="wf-end-node-structured-reply",
        name="End Node Structured Reply Workflow",
        version="0.1.0",
        status="draft",
        definition={
            "nodes": [
                {"id": "startNode", "type": "startNode", "name": "startNode", "config": {}},
                {
                    "id": "agent",
                    "type": "llmAgentNode",
                    "name": "Agent",
                    "config": {"assistant": {"enabled": False}, "mock_output": {"answer": "legacy-compatible"}},
                },
                {
                    "id": "endNode_ab12cd34",
                    "type": "endNode",
                    "name": "endNode",
                    "config": {
                        "replyDocument": {
                            "version": 1,
                            "segments": [
                                {"type": "text", "text": "最终回复："},
                                {"type": "variable", "refId": "ref_1"},
                            ],
                        },
                        "replyReferences": [
                            {
                                "refId": "ref_1",
                                "alias": "text",
                                "ownerNodeId": "endNode_ab12cd34",
                                "selector": ["accumulated", "agent", "answer"],
                            }
                        ],
                    },
                },
            ],
            "edges": [
                {"id": "e1", "sourceNodeId": "startNode", "targetNodeId": "agent"},
                {"id": "e2", "sourceNodeId": "agent", "targetNodeId": "endNode_ab12cd34"},
            ],
        },
    )
    sqlite_session.add(workflow)
    sqlite_session.commit()

    artifacts = RuntimeService().execute_workflow(sqlite_session, workflow, {"topic": "agent"})

    end_run = next(node_run for node_run in artifacts.node_runs if node_run.node_id == "endNode_ab12cd34")
    assert end_run.output_payload == {"answer": "最终回复：legacy-compatible"}
```

```py
# api/tests/test_workflow_routes.py
def test_create_workflow_accepts_end_node_reply_document(client: TestClient) -> None:
    definition = _valid_definition()
    definition["nodes"][2]["id"] = "endNode_ab12cd34"
    definition["nodes"][2]["config"] = {
        "replyDocument": {
            "version": 1,
            "segments": [
                {"type": "text", "text": "最终回复："},
                {"type": "variable", "refId": "ref_1"},
            ],
        },
        "replyReferences": [
            {
                "refId": "ref_1",
                "alias": "text",
                "ownerNodeId": "endNode_ab12cd34",
                "selector": ["accumulated", "toolNode", "answer"],
            }
        ],
        "replyTemplate": "{{#endNode_ab12cd34.text#}}",
    }

    response = client.post("/api/workflows", json={"name": "Structured Reply Workflow", "definition": definition})

    assert response.status_code == 201
    body = response.json()
    assert body["definition"]["nodes"][2]["config"]["replyReferences"][0]["ownerNodeId"] == "endNode_ab12cd34"
```

- [ ] **Step 2: Run the backend tests to verify they fail**

Run:

```bash
cd /home/taichu/git/7flows && api/.venv/bin/pytest api/tests/test_runtime_service_agent_runtime.py -q -k "structured_reply_document" && api/.venv/bin/pytest api/tests/test_workflow_routes.py -q -k "reply_document"
```

Expected: FAIL because `replyDocument` / `replyReferences` are not validated or rendered.

- [ ] **Step 3: Implement backend validation and rendering**

```py
# api/app/schemas/workflow_node_validation.py
from pydantic import BaseModel, ConfigDict, Field

class WorkflowNodeReplyDocumentSegmentText(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["text"]
    text: str

class WorkflowNodeReplyDocumentSegmentVariable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["variable"]
    refId: str = Field(min_length=1, max_length=64)

class WorkflowNodeReplyReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refId: str = Field(min_length=1, max_length=64)
    alias: str = Field(min_length=1, max_length=64)
    ownerNodeId: str = Field(min_length=1, max_length=64)
    selector: list[str] = Field(min_length=1)

class WorkflowNodeReplyDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    segments: list[WorkflowNodeReplyDocumentSegmentText | WorkflowNodeReplyDocumentSegmentVariable] = Field(min_length=1)
```

```py
# inside validate_workflow_node_embedded_config
    reply_document = config.get("replyDocument")
    reply_references = config.get("replyReferences")
    if reply_document is not None or reply_references is not None:
        if node_type != "endNode":
            raise ValueError("Only endNode nodes may define config.replyDocument or config.replyReferences.")
        WorkflowNodeReplyDocument.model_validate(reply_document or {"version": 1, "segments": []})
        if not isinstance(reply_references, list) or len(reply_references) == 0:
            raise ValueError("config.replyReferences must be a non-empty list when config.replyDocument is present.")
        [WorkflowNodeReplyReference.model_validate(item) for item in reply_references]
```

```py
# api/app/services/runtime_node_dispatch_support.py
    def _build_end_node_output(self, *, node: dict, node_input: dict) -> dict:
        config = node.get("config") if isinstance(node.get("config"), dict) else {}
        reply_document = config.get("replyDocument")
        reply_references = config.get("replyReferences")
        response_key = config.get("responseKey")
        normalized_response_key = (
            response_key.strip()
            if isinstance(response_key, str) and response_key.strip()
            else "answer"
        )

        if isinstance(reply_document, dict) and isinstance(reply_references, list):
            return {
                normalized_response_key: self._render_end_node_document(
                    reply_document=reply_document,
                    reply_references=reply_references,
                    node_input=node_input,
                )
            }

        reply_template = config.get("replyTemplate")
        if not isinstance(reply_template, str) or not reply_template.strip():
            return node_input.get("accumulated", {})
        return {
            normalized_response_key: self._render_end_node_template(reply_template, node_input)
        }

    def _render_end_node_document(
        self,
        *,
        reply_document: dict,
        reply_references: list[dict],
        node_input: dict,
    ) -> str:
        reference_map = {
            str(item.get("refId")): item
            for item in reply_references
            if isinstance(item, dict) and item.get("refId")
        }
        parts: list[str] = []
        for segment in reply_document.get("segments") or []:
            if not isinstance(segment, dict):
                continue
            if segment.get("type") == "text":
                parts.append(str(segment.get("text") or ""))
                continue
            if segment.get("type") == "variable":
                reference = reference_map.get(str(segment.get("refId") or ""))
                selector = reference.get("selector") if isinstance(reference, dict) else None
                resolved = self._resolve_selector_path(node_input, ".".join(selector or []))
                if resolved is MISSING or resolved is None:
                    continue
                if isinstance(resolved, (dict, list)):
                    parts.append(json.dumps(resolved, ensure_ascii=False))
                elif isinstance(resolved, bool):
                    parts.append("true" if resolved else "false")
                else:
                    parts.append(str(resolved))
        return "".join(parts).strip()
```

- [ ] **Step 4: Run the backend tests to verify they pass**

Run:

```bash
cd /home/taichu/git/7flows && api/.venv/bin/pytest api/tests/test_runtime_service_agent_runtime.py -q && api/.venv/bin/pytest api/tests/test_workflow_routes.py -q -k "reply_document"
```

Expected: PASS with the new structured reply tests green.

- [ ] **Step 5: Commit**

```bash
cd /home/taichu/git/7flows
git add api/app/schemas/workflow_node_validation.py api/app/services/runtime_node_dispatch_support.py api/tests/test_runtime_service_agent_runtime.py api/tests/test_workflow_routes.py
git commit -m "feat(workflow): support structured reply documents"
```

### Task 5: Full Verification and Branch Hygiene

**Files:**
- Modify: none
- Verify: `web/components/workflow-node-config-form/**`
- Verify: `api/app/services/runtime_node_dispatch_support.py`
- Verify: `api/app/schemas/workflow_node_validation.py`

- [ ] **Step 1: Run the full targeted frontend verification**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec vitest run components/workflow-node-config-form/__tests__/workflow-variable-text-document.test.ts components/workflow-node-config-form/__tests__/workflow-variable-text-editor.client.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.test.tsx components/workflow-node-config-form/__tests__/output-node-config-form.client.test.tsx --cache=false
```

Expected: PASS with all four test files green.

- [ ] **Step 2: Run the targeted backend verification**

Run:

```bash
cd /home/taichu/git/7flows && api/.venv/bin/pytest api/tests/test_runtime_service_agent_runtime.py api/tests/test_workflow_routes.py -q -k "reply_document or direct_reply_template or legacy_direct_reply_template"
```

Expected: PASS with structured reply and compatibility tests green.

- [ ] **Step 3: Run lint and diff checks**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web lint && git diff --check
```

Expected: `✔ No ESLint warnings or errors` and no `git diff --check` output.

- [ ] **Step 4: Run type-check and record existing unrelated failures if they persist**

Run:

```bash
cd /home/taichu/git/7flows && corepack pnpm --dir web exec tsc --noEmit --incremental false
```

Expected: Either PASS, or the pre-existing failures remain limited to:

```text
components/__tests__/workflow-create-wizard.test.ts(44,5)
components/__tests__/workflow-studio-layout-shell.test.tsx(57,9)
```

- [ ] **Step 5: Push the branch**

```bash
cd /home/taichu/git/7flows
git push origin taichuy_dev
```
