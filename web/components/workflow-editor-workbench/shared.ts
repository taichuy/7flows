"use client";

import type { XYPosition } from "@xyflow/react";

export type WorkflowEditorMessageTone = "success" | "error" | "idle";

export function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function stripUiPosition(config: Record<string, unknown>) {
  const nextConfig = { ...config };
  const ui = isRecord(nextConfig.ui) ? { ...(nextConfig.ui as Record<string, unknown>) } : null;
  if (!ui) {
    return nextConfig;
  }

  delete ui.position;
  if (Object.keys(ui).length === 0) {
    delete nextConfig.ui;
    return nextConfig;
  }

  nextConfig.ui = ui;
  return nextConfig;
}

export function readNodePosition(config: Record<string, unknown>): XYPosition {
  const ui = isRecord(config.ui) ? (config.ui as Record<string, unknown>) : null;
  const position = ui && isRecord(ui.position) ? (ui.position as Record<string, unknown>) : null;
  return {
    x: typeof position?.x === "number" ? position.x : 320,
    y: typeof position?.y === "number" ? position.y : 220
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
