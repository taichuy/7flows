import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceStarterMetadataPanel } from "@/components/workspace-starter-library/starter-metadata-panel";

Object.assign(globalThis, { React });

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href?: string } & Record<string, unknown>) =>
    createElement("a", { href: href ?? "#", ...props }, children)
}));

describe("WorkspaceStarterMetadataPanel", () => {
  it("reuses the shared create entry contract in metadata follow-up actions", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceStarterMetadataPanel, {
        selectedTemplate: {
          id: "starter-1",
          workspace_id: "default",
          name: "Governed Starter",
          description: "Starter description",
          business_track: "应用新建编排",
          default_workflow_name: "Governed workflow",
          workflow_focus: "Keep source governance visible.",
          recommended_next_step: "Return to create flow after reviewing metadata.",
          tags: ["workspace starter"],
          definition: {
            nodes: [{ id: "trigger", type: "trigger", name: "Trigger", config: {} }],
            edges: [],
            variables: [],
            publish: []
          },
          created_from_workflow_id: "  workflow alpha/beta  ",
          archived: false,
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z"
        },
        formState: {
          name: "Governed Starter",
          description: "Starter description",
          businessTrack: "应用新建编排",
          defaultWorkflowName: "Governed workflow",
          workflowFocus: "Keep source governance visible.",
          recommendedNextStep: "Return to create flow after reviewing metadata.",
          tagsText: "workspace starter"
        },
        selectedTrackPriority: "P0 应用新建编排",
        hasPendingChanges: false,
        isSaving: false,
        isMutating: false,
        message: null,
        messageTone: "idle",
        createWorkflowHref: "/workflows/new?needs_follow_up=true&starter=starter-1",
        setFormState: vi.fn(),
        onSave: vi.fn(),
        onTemplateMutation: vi.fn()
      })
    );

    expect(html).toContain("带此 starter 回到创建页");
    expect(html).toContain('/workflows/new?needs_follow_up=true&amp;starter=starter-1');
    expect(html).toContain("打开源 workflow");
    expect(html).toContain('/workflows/workflow%20alpha%2Fbeta');
  });
});
