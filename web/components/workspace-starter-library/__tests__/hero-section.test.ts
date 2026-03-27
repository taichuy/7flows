import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildWorkspaceStarterGovernanceHeroSurfaceCopy } from "@/lib/workbench-entry-surfaces";

import { WorkspaceStarterHeroSection } from "../hero-section";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterHeroSection", () => {
  it("reuses the shared workbench entry contract for create and home actions", () => {
    const createWorkflowHref =
      "/workflows/new?needs_follow_up=true&starter=starter-a&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92";
    const surfaceCopy = buildWorkspaceStarterGovernanceHeroSurfaceCopy({ createWorkflowHref });
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterHeroSection, {
        activeTemplateCount: 5,
        archivedTemplateCount: 1,
        filteredTemplateCount: 3,
        governedTemplateCount: 2,
        missingToolTemplateCount: 1,
        selectedTemplateName: "Starter A",
        strongIsolationTemplateCount: 1,
        activeTrack: "应用新建编排",
        createWorkflowHref
      })
    );

    expect(html).toContain(surfaceCopy.heroDescription);
    expect(html).toContain(surfaceCopy.heroLinks.overrides?.createWorkflow?.label ?? "");
    expect(html).toContain(
      '/workflows/new?needs_follow_up=true&amp;starter=starter-a&amp;track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92'
    );
    expect(html).toContain("返回系统首页");
    expect(html).toContain('href="/"');
  });
});
