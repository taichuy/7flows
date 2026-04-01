import { normalizeWorkbenchRelativeHref } from "@/lib/workbench-entry-links";

function normalizeWorkbenchEntityId(entityId: string, entityLabel: string) {
  const normalized = entityId.trim();

  if (!normalized) {
    throw new Error(`Cannot build ${entityLabel} href without an id.`);
  }

  return normalized;
}

export const WORKSPACE_TOOLS_HREF = "/workspace/tools";

export const WORKFLOW_STUDIO_SURFACES = [
  "editor",
  "publish",
  "api",
  "logs",
  "monitor"
] as const;

export type WorkflowStudioSurface = (typeof WORKFLOW_STUDIO_SURFACES)[number];

export type WorkflowStudioSurfaceDefinition = {
  key: WorkflowStudioSurface;
  label: string;
  modeLabel: string;
  description: string;
};

const workflowStudioSurfaceDefinitions = [
  {
    key: "editor",
    label: "画布编排",
    modeLabel: "xyflow studio",
    description: "workflow canvas、节点编排与草稿编辑。"
  },
  {
    key: "publish",
    label: "发布治理",
    modeLabel: "publish governance",
    description: "published binding、鉴权与治理摘要。"
  },
  {
    key: "api",
    label: "访问 API",
    modeLabel: "api docs",
    description: "对外调用 contract、请求示例与团队对接入口。"
  },
  {
    key: "logs",
    label: "日志与标注",
    modeLabel: "运行日志",
    description: "运行追踪、节点日志与标注回看入口。"
  },
  {
    key: "monitor",
    label: "监测报表",
    modeLabel: "监测报表",
    description: "运行健康、报表与 follow-up 监测入口。"
  }
] satisfies WorkflowStudioSurfaceDefinition[];

export function getWorkflowStudioSurfaceDefinitions() {
  return workflowStudioSurfaceDefinitions;
}

export function getWorkflowStudioSurfaceDefinition(surface: WorkflowStudioSurface) {
  return (
    workflowStudioSurfaceDefinitions.find((item) => item.key === surface) ??
    workflowStudioSurfaceDefinitions[0]
  );
}

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

type WorkspaceToolsHubContext = {
  returnHref?: string | null;
  workflowId?: string | null;
  workflowSurface?: WorkflowStudioSurface | null;
};

function readRelativeQueryParam(value: string | string[] | undefined) {
  return normalizeWorkbenchRelativeHref(Array.isArray(value) ? value[0] : value);
}

function readStringQueryParam(value: string | string[] | undefined) {
  const normalized = (Array.isArray(value) ? value[0] : value)?.trim();
  return normalized ? normalized : null;
}

export function readWorkspaceToolsHubContext(
  searchParams: Record<string, string | string[] | undefined>
): Required<WorkspaceToolsHubContext> {
  const workflowSurface = readStringQueryParam(searchParams.workflow_surface);

  return {
    returnHref: readRelativeQueryParam(searchParams.return_href),
    workflowId: readStringQueryParam(searchParams.workflow_id),
    workflowSurface: WORKFLOW_STUDIO_SURFACES.includes(
      workflowSurface as WorkflowStudioSurface
    )
      ? (workflowSurface as WorkflowStudioSurface)
      : null
  };
}

export function buildWorkspaceToolsHref(context: WorkspaceToolsHubContext = {}) {
  const searchParams = new URLSearchParams();
  const returnHref = normalizeWorkbenchRelativeHref(context.returnHref);
  const workflowId = context.workflowId?.trim();
  const workflowSurface =
    context.workflowSurface && WORKFLOW_STUDIO_SURFACES.includes(context.workflowSurface)
      ? context.workflowSurface
      : null;

  if (returnHref) {
    searchParams.set("return_href", returnHref);
  }

  if (workflowId) {
    searchParams.set("workflow_id", workflowId);
  }

  if (workflowSurface) {
    searchParams.set("workflow_surface", workflowSurface);
  }

  const query = searchParams.toString();

  return query ? `${WORKSPACE_TOOLS_HREF}?${query}` : WORKSPACE_TOOLS_HREF;
}

export function resolveWorkspaceToolsReturnHref(context: WorkspaceToolsHubContext) {
  const returnHref = normalizeWorkbenchRelativeHref(context.returnHref);

  if (returnHref) {
    return returnHref;
  }

  const workflowId = context.workflowId?.trim();

  if (!workflowId) {
    return null;
  }

  return buildWorkflowStudioSurfaceHref(
    workflowId,
    context.workflowSurface && WORKFLOW_STUDIO_SURFACES.includes(context.workflowSurface)
      ? context.workflowSurface
      : "editor"
  );
}
