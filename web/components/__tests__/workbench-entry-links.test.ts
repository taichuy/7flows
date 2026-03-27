import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  WorkbenchEntryLink,
  WorkbenchEntryLinks,
  resolveWorkbenchEntryLink,
  resolveWorkbenchEntryLinks
} from "@/components/workbench-entry-links";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("workbench entry links", () => {
  it("resolves the shared workbench routes in a stable order", () => {
    expect(
      resolveWorkbenchEntryLinks(["workflowLibrary", "runLibrary", "operatorInbox"])
    ).toEqual([
      {
        key: "workflowLibrary",
        href: "/workflows",
        label: "打开 workflow 列表"
      },
      {
        key: "runLibrary",
        href: "/runs",
        label: "查看 run diagnostics"
      },
      {
        key: "operatorInbox",
        href: "/sensitive-access",
        label: "打开 sensitive access inbox"
      }
    ]);
  });

  it("supports scoped overrides without forking the shared contract", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchEntryLinks, {
        keys: ["operatorInbox", "workflowLibrary"],
        variant: "inline",
        primaryKey: "operatorInbox",
        overrides: {
          operatorInbox: {
            href: "/sensitive-access?status=pending",
            label: "打开待处理收件箱"
          }
        }
      })
    );

    expect(html).toContain("打开待处理收件箱");
    expect(html).toContain('/sensitive-access?status=pending');
    expect(html).toContain('/workflows');
  });

  it("resolves and renders a single inline entry for prose-level follow-up", () => {
    expect(
      resolveWorkbenchEntryLink("workspaceStarterLibrary", {
        href: "/workspace-starters?needs_follow_up=true",
        label: "回到治理页"
      })
    ).toEqual({
      key: "workspaceStarterLibrary",
      href: "/workspace-starters?needs_follow_up=true",
      label: "回到治理页"
    });

    const html = renderToStaticMarkup(
      createElement(
        WorkbenchEntryLink,
        {
          linkKey: "createWorkflow",
          className: "inline-link secondary",
          override: {
            href: "/workflows/new?needs_follow_up=true&starter=starter-1"
          }
        },
        "带此 starter 回到创建页"
      )
    );

    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain('/workflows/new?needs_follow_up=true&amp;starter=starter-1');
  });

  it("drops self-referential shared links while preserving copy", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchEntryLinks, {
        keys: ["operatorInbox", "workflowLibrary"],
        variant: "inline",
        primaryKey: "operatorInbox",
        currentHref: "/sensitive-access?status=pending",
        overrides: {
          operatorInbox: {
            href: "/sensitive-access?status=pending",
            label: "打开待处理收件箱"
          },
          workflowLibrary: {
            href: "/workflows?execution=sandbox",
            label: "Open workflow library"
          }
        }
      })
    );

    expect(html).toContain("打开待处理收件箱");
    expect(html).not.toContain('/sensitive-access?status=pending');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('/workflows?execution=sandbox');
  });

  it("treats reordered scoped query params as the current page", () => {
    const html = renderToStaticMarkup(
      createElement(WorkbenchEntryLink, {
        linkKey: "workflowLibrary",
        currentHref:
          "/workflows/workflow-1?definition_issue=legacy_publish_auth&starter=starter-1&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92",
        override: {
          href: "/workflows/workflow-1?track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92&starter=starter-1&definition_issue=legacy_publish_auth",
          label: "回到当前 workflow"
        }
      })
    );

    expect(html).toContain("回到当前 workflow");
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/workflows/workflow-1');
  });
});
