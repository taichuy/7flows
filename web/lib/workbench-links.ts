function normalizeWorkbenchEntityId(entityId: string, entityLabel: string) {
  const normalized = entityId.trim();

  if (!normalized) {
    throw new Error(`Cannot build ${entityLabel} href without an id.`);
  }

  return normalized;
}

export type WorkflowStudioSurface = "editor" | "publish";

export function buildRunDetailHref(runId: string) {
  return `/runs/${encodeURIComponent(normalizeWorkbenchEntityId(runId, "run"))}`;
}

export function buildWorkflowStudioSurfaceHref(
  workflowId: string,
  surface: WorkflowStudioSurface = "editor"
) {
  return `/workflows/${encodeURIComponent(normalizeWorkbenchEntityId(workflowId, "workflow"))}/${surface}`;
}

export function buildWorkflowDetailHref(workflowId: string) {
  return `/workflows/${encodeURIComponent(normalizeWorkbenchEntityId(workflowId, "workflow"))}`;
}
