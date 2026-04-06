"use client";

import {
  forwardRef,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode
} from "react";
import { CloseOutlined } from "@ant-design/icons";
import { Button } from "antd";

type WorkflowEditorFloatingPanelProps = {
  title: string;
  children: ReactNode;
  style: CSSProperties;
  panelKind: string;
  dragging?: boolean;
  closeLabel?: string;
  closeAction?: string;
  onClose: () => void;
  onHeaderPointerDown?: PointerEventHandler<HTMLDivElement>;
};

export const WorkflowEditorFloatingPanel = forwardRef<
  HTMLDivElement,
  WorkflowEditorFloatingPanelProps
>(function WorkflowEditorFloatingPanel(
{
  title,
  children,
  style,
  panelKind,
  dragging = false,
  closeLabel = "关闭悬浮面板",
  closeAction = "close-floating-panel",
  onClose,
  onHeaderPointerDown
},
ref
) {
  return (
    <div
      ref={ref}
      className="workflow-editor-floating-panel"
      data-component="workflow-editor-floating-panel"
      data-panel-kind={panelKind}
      data-dragging={dragging ? "true" : "false"}
      style={style}
    >
      <div
        className="workflow-editor-floating-panel-header"
        data-component="workflow-editor-floating-panel-header"
        onPointerDown={onHeaderPointerDown}
      >
        <div className="workflow-editor-floating-panel-title-group">
          <strong>{title}</strong>
        </div>
        <Button
          aria-label={closeLabel}
          className="workflow-editor-floating-panel-close"
          data-action={closeAction}
          icon={<CloseOutlined />}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          type="text"
        />
      </div>

      <div
        className="workflow-editor-floating-panel-body"
        data-component="workflow-editor-floating-panel-body"
      >
        {children}
      </div>
    </div>
  );
});

WorkflowEditorFloatingPanel.displayName = "WorkflowEditorFloatingPanel";
