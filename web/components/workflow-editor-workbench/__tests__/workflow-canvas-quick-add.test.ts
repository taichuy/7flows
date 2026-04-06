import { describe, expect, it } from "vitest";

import { workflowCanvasQuickAddMenuInteractionGuardProps } from "@/components/workflow-editor-workbench/workflow-canvas-quick-add";

describe("workflowCanvasQuickAddMenuInteractionGuardProps", () => {
  it("guards canvas interactions without using capture handlers that swallow option clicks", () => {
    expect(workflowCanvasQuickAddMenuInteractionGuardProps).toMatchObject({
      onPointerDown: expect.any(Function),
      onClick: expect.any(Function),
      onDoubleClick: expect.any(Function),
      onWheel: expect.any(Function)
    });
    expect("onPointerDownCapture" in workflowCanvasQuickAddMenuInteractionGuardProps).toBe(false);
    expect("onClickCapture" in workflowCanvasQuickAddMenuInteractionGuardProps).toBe(false);
    expect("onDoubleClickCapture" in workflowCanvasQuickAddMenuInteractionGuardProps).toBe(false);
    expect("onWheelCapture" in workflowCanvasQuickAddMenuInteractionGuardProps).toBe(false);
  });
});
