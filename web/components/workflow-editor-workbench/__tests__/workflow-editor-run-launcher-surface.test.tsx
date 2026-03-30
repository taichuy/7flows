import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowEditorRunLauncherSurface } from "@/components/workflow-editor-workbench/workflow-editor-run-launcher-surface";

Object.assign(globalThis, { React });

vi.mock("next/dynamic", async () => {
  const runLauncherModule = await vi.importMock<typeof import("@/components/workflow-run-launcher")>(
    "@/components/workflow-run-launcher"
  );

  return {
    default: (loader: { toString: () => string }) => {
      const source = loader.toString();

      if (source.includes("workflow-run-launcher")) {
        return runLauncherModule.WorkflowRunLauncher;
      }

      return () => null;
    }
  };
});

vi.mock("@/app/actions/runs", () => ({
  triggerWorkflowRun: vi.fn()
}));

vi.mock("@/components/workflow-run-launcher", () => ({
  WorkflowRunLauncher: ({ open }: { open: boolean }) =>
    createElement(
      "div",
      {
        "data-component": "workflow-run-launcher",
        "data-open": String(open)
      },
      "workflow-run-launcher"
    )
}));

describe("WorkflowEditorRunLauncherSurface", () => {
  it("does not mount the launcher surface before it is opened", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorRunLauncherSurface, {
        workflowId: "workflow-1",
        open: false,
        workflowVariables: [],
        onClose: () => undefined,
        onRunSuccess: () => undefined,
        onRunError: () => undefined
      })
    );

    expect(html).not.toContain('data-component="workflow-run-launcher"');
  });

  it("mounts the launcher surface only after the editor explicitly opens it", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorRunLauncherSurface, {
        workflowId: "workflow-1",
        open: true,
        workflowVariables: [],
        onClose: () => undefined,
        onRunSuccess: () => undefined,
        onRunError: () => undefined
      })
    );

    expect(html).toContain('data-component="workflow-run-launcher"');
    expect(html).toContain('data-open="true"');
  });
});
