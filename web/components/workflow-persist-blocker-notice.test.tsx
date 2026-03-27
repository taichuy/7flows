import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowPersistBlockerNotice } from "@/components/workflow-persist-blocker-notice";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkflowPersistBlockerNotice", () => {
  it("renders shared catalog-gap governance handoff for save gates", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPersistBlockerNotice, {
        title: "Publish save gate",
        summary: "当前保存仍被 catalog gap 阻断。",
        blockers: [
          {
            id: "tool_reference",
            label: "Catalog gap",
            detail:
              "当前 workflow definition 仍有 catalog gap · native.catalog-gap、native.second-gap。",
            nextStep:
              "请先补齐 catalog gap（native.catalog-gap、native.second-gap）里的 tool binding / LLM Agent tool policy 后再保存。",
            catalogGapToolIds: ["native.catalog-gap", "native.second-gap"]
          }
        ],
        currentHref: "/workflows/workflow-1?pane=publish"
      })
    );

    expect(html).toContain("catalog gap · native.catalog-gap、native.second-gap");
    expect(html).toContain(
      "当前这次保存入口 对应的 workflow 版本仍有 catalog gap（native.catalog-gap、native.second-gap）；先回到当前 workflow 编辑器补齐 binding / LLM Agent tool policy，再回来继续保存。"
    );
    expect(html).toContain(
      'href="/workflows/workflow-1?pane=publish&amp;definition_issue=missing_tool"'
    );
    expect(html).toContain("回到 workflow 编辑器处理 catalog gap");
  });

  it("skips governance handoff when save gate has no workflow catalog gap", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPersistBlockerNotice, {
        title: "Publish save gate",
        blockers: [
          {
            id: "publish_draft",
            label: "Publish draft",
            detail: "当前 workflow definition 还有 publish draft 待修正问题：publish.0.path 重复。",
            nextStep: "请先在 publish draft 表单里修正发布标识、schema、缓存或版本设置，再继续保存。"
          }
        ]
      })
    );

    expect(html).not.toContain("Workflow governance");
    expect(html).not.toContain("回到 workflow 编辑器处理 catalog gap");
  });

  it("renders shared publish auth contract for legacy auth save gates", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPersistBlockerNotice, {
        title: "Publish save gate",
        blockers: [
          {
            id: "publish_draft",
            label: "Publish draft",
            detail:
              "当前 workflow definition 还有 publish draft 待修正问题：Public Search 当前不能使用 authMode = token。",
            nextStep:
              "先把 workflow draft endpoint 切回 api_key/internal 并保存，再补发 replacement binding，最后清理 draft/offline legacy backlog。",
            hasLegacyPublishAuthModeIssues: true,
            hasGenericPublishDraftIssues: false
          }
        ]
      })
    );

    expect(html).toContain("Save-gate publish auth contract");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain("legacy token");
    expect(html).toContain("先把 workflow draft endpoint 切回 api_key/internal 并保存");
    expect(html).not.toContain("当前 workflow definition 还有 publish draft 待修正问题：Public Search 当前不能使用 authMode = token。");
    expect(html).not.toContain("<strong>Publish draft</strong>");
    expect(html).not.toContain("Workflow governance");
  });

  it("keeps generic publish draft issues visible when legacy auth save gates also carry non-auth blockers", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowPersistBlockerNotice, {
        title: "Publish save gate",
        blockers: [
          {
            id: "publish_draft",
            label: "Publish draft",
            detail:
              "当前 workflow definition 还有 publish draft 待修正问题：Public Search 的 workflowVersion 必须使用 major.minor.patch 语义版本格式。",
            nextStep: "如果 endpoint 要跟随本次保存版本，请把 workflowVersion 留空。",
            hasLegacyPublishAuthModeIssues: true,
            hasGenericPublishDraftIssues: true
          }
        ]
      })
    );

    expect(html).toContain("Save-gate publish auth contract");
    expect(html).toContain("workflowVersion 必须使用 major.minor.patch 语义版本格式");
    expect(html).toContain("如果 endpoint 要跟随本次保存版本，请把 workflowVersion 留空");
    expect(html).toContain("<strong>Publish draft</strong>");
  });
});
