import {
  canManageWorkspaceMembers,
  type ConsoleRoutePermissionItem,
  type ConsoleAccessLevel,
  type WorkspaceContextResponse,
  type WorkspaceMemberRole
} from "@/lib/workspace-access";
import {
  getWorkflowStudioSurfaceDefinitions,
  type WorkflowStudioSurface,
  type WorkflowStudioSurfaceDefinition
} from "@/lib/workbench-links";

export const WORKSPACE_TEAM_SETTINGS_HREF = "/workspace/settings/team";
export const WORKSPACE_MODEL_PROVIDER_SETTINGS_HREF = "/workspace/settings/providers";
export const LEGACY_WORKSPACE_TEAM_SETTINGS_HREF = "/admin/members";

export type WorkspaceConsoleNavKey = "workspace" | "workflows" | "runs" | "starters" | "team";
export type WorkspaceConsolePageKey = "login" | WorkspaceConsoleNavKey | "providers";
export type WorkspaceShellNavigationMode = "all" | "core" | "studio";

export type WorkspaceConsoleRouteContract = {
  route: string;
  methods: string[];
};

export type WorkflowStudioSurfacePermission = WorkflowStudioSurfaceDefinition & {
  accessLevel: ConsoleAccessLevel;
  routeContracts: WorkspaceConsoleRouteContract[];
};

export type WorkspaceConsolePagePermission = {
  key: WorkspaceConsolePageKey;
  href: string;
  label: string;
  accessLevel: ConsoleAccessLevel;
  description: string;
  routeContracts?: WorkspaceConsoleRouteContract[];
};

const workspaceConsolePagePermissions: WorkspaceConsolePagePermission[] = [
  {
    key: "login",
    href: "/login",
    label: "登录",
    accessLevel: "guest",
    description: "访客通过本地管理员登录进入 workspace console。"
  },
  {
    key: "workspace",
    href: "/workspace",
    label: "工作台",
    accessLevel: "authenticated",
    description: "应用目录、快速新建与团队 workspace 扫描入口。"
  },
  {
    key: "workflows",
    href: "/workflows",
    label: "编排",
    accessLevel: "authenticated",
    description: "workflow library、create 与 studio surface 的作者入口。"
  },
  {
    key: "starters",
    href: "/workspace-starters",
    label: "模板",
    accessLevel: "authenticated",
    description: "团队 starter 模板与治理基线入口。"
  },
  {
    key: "runs",
    href: "/runs",
    label: "运行",
    accessLevel: "authenticated",
    description: "运行追踪、日志排查与 operator follow-up 入口。"
  },
  {
    key: "team",
    href: WORKSPACE_TEAM_SETTINGS_HREF,
    label: "团队",
    accessLevel: "manager",
    description: "workspace settings 下的成员与权限入口；后续 provider settings 继续在此扩展。",
    routeContracts: [
      {
        route: "/api/workspace/members",
        methods: ["GET"]
      }
    ]
  },
  {
    key: "providers",
    href: WORKSPACE_MODEL_PROVIDER_SETTINGS_HREF,
    label: "模型供应商设置",
    accessLevel: "manager",
    description: "团队级原生模型供应商与 credential 绑定入口。",
    routeContracts: [
      {
        route: "/api/workspace/model-providers/settings",
        methods: ["GET"]
      }
    ]
  }
];

const workspaceShellNavigationByMode = {
  all: ["workspace", "workflows", "starters", "runs", "team"],
  core: ["workspace", "workflows", "team"],
  studio: ["workspace", "workflows", "runs", "team"]
} satisfies Record<WorkspaceShellNavigationMode, WorkspaceConsoleNavKey[]>;

const workflowStudioSurfaceRouteContracts = {
  editor: [
    {
      route: "/api/workflows/{workflow_id}/detail",
      methods: ["GET"]
    }
  ],
  publish: [
    {
      route: "/api/workflows/{workflow_id}/detail",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/published-endpoints",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations/{invocation_id}",
      methods: ["GET"]
    }
  ],
  api: [
    {
      route: "/api/workflows/{workflow_id}/detail",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/published-endpoints",
      methods: ["GET"]
    }
  ],
  logs: [
    {
      route: "/api/workflows/{workflow_id}/detail",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/runs",
      methods: ["GET"]
    },
    {
      route: "/api/runs/{run_id}/detail",
      methods: ["GET"]
    },
    {
      route: "/api/runs/{run_id}/execution-view",
      methods: ["GET"]
    },
    {
      route: "/api/runs/{run_id}/evidence-view",
      methods: ["GET"]
    }
  ],
  monitor: [
    {
      route: "/api/workflows/{workflow_id}/detail",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/published-endpoints",
      methods: ["GET"]
    },
    {
      route: "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations",
      methods: ["GET"]
    }
  ]
} satisfies Record<WorkflowStudioSurface, WorkspaceConsoleRouteContract[]>;

const workflowStudioSurfacePermissions = getWorkflowStudioSurfaceDefinitions().map((item) => ({
  ...item,
  accessLevel: "authenticated" satisfies ConsoleAccessLevel,
  routeContracts: workflowStudioSurfaceRouteContracts[item.key]
})) satisfies WorkflowStudioSurfacePermission[];

export function getConsoleAccessLevelForRole(
  userRole: WorkspaceMemberRole | null | undefined
): ConsoleAccessLevel {
  if (!userRole) {
    return "guest";
  }

  return canManageWorkspaceMembers(userRole) ? "manager" : "authenticated";
}

function hasRequiredAccessLevel(
  currentLevel: ConsoleAccessLevel,
  requiredLevel: ConsoleAccessLevel
) {
  const rankByLevel = {
    guest: 0,
    authenticated: 1,
    manager: 2
  } satisfies Record<ConsoleAccessLevel, number>;

  return rankByLevel[currentLevel] >= rankByLevel[requiredLevel];
}

function canSatisfyRouteContract(
  routePermissions: ConsoleRoutePermissionItem[] | undefined,
  currentLevel: ConsoleAccessLevel,
  routeContract: WorkspaceConsoleRouteContract
) {
  if (!routePermissions || routePermissions.length === 0) {
    return true;
  }

  return routeContract.methods.every((method) => {
    const matchingPermission = routePermissions.find(
      (item) => item.route === routeContract.route && item.methods.includes(method)
    );

    if (!matchingPermission) {
      return false;
    }

    return hasRequiredAccessLevel(currentLevel, matchingPermission.access_level);
  });
}

function canAccessRouteContracts(
  requiredAccessLevel: ConsoleAccessLevel,
  routeContracts: WorkspaceConsoleRouteContract[] | undefined,
  workspaceContext:
    | {
        current_member: Pick<WorkspaceContextResponse["current_member"], "role">;
        route_permissions?: WorkspaceContextResponse["route_permissions"];
      }
    | null
) {
  const currentAccessLevel = getConsoleAccessLevelForRole(
    workspaceContext?.current_member.role
  );

  if (!hasRequiredAccessLevel(currentAccessLevel, requiredAccessLevel)) {
    return false;
  }

  return (routeContracts ?? []).every((routeContract) =>
    canSatisfyRouteContract(
      workspaceContext?.route_permissions,
      currentAccessLevel,
      routeContract
    )
  );
}

export function getWorkspaceConsolePagePermission(page: WorkspaceConsolePageKey) {
  return workspaceConsolePagePermissions.find((item) => item.key === page) ?? null;
}

export function getWorkspaceConsolePageHref(page: WorkspaceConsolePageKey) {
  return getWorkspaceConsolePagePermission(page)?.href ?? "/workspace";
}

export function getWorkspaceConsoleNavigationItems() {
  return workspaceConsolePagePermissions.filter(
    (item) => item.key !== "login" && item.key !== "providers"
  ) as Array<WorkspaceConsolePagePermission & { key: WorkspaceConsoleNavKey }>;
}

export function getWorkflowStudioSurfacePermission(surface: WorkflowStudioSurface) {
  return workflowStudioSurfacePermissions.find((item) => item.key === surface) ?? null;
}

export function canAccessConsolePage(
  page: WorkspaceConsolePageKey,
  workspaceContext:
    | {
        current_member: Pick<WorkspaceContextResponse["current_member"], "role">;
        route_permissions?: WorkspaceContextResponse["route_permissions"];
      }
    | null
) {
  const pagePermission = getWorkspaceConsolePagePermission(page);
  return canAccessRouteContracts(
    pagePermission?.accessLevel ?? "authenticated",
    pagePermission?.routeContracts,
    workspaceContext
  );
}

export function canAccessWorkflowStudioSurface(
  surface: WorkflowStudioSurface,
  workspaceContext:
    | {
        current_member: Pick<WorkspaceContextResponse["current_member"], "role">;
        route_permissions?: WorkspaceContextResponse["route_permissions"];
      }
    | null
) {
  const surfacePermission = getWorkflowStudioSurfacePermission(surface);
  return canAccessRouteContracts(
    surfacePermission?.accessLevel ?? "authenticated",
    surfacePermission?.routeContracts,
    workspaceContext
  );
}

export function canViewConsoleNavItem(item: WorkspaceConsoleNavKey, userRole: WorkspaceMemberRole) {
  const requiredAccessLevel =
    getWorkspaceConsolePagePermission(item)?.accessLevel ?? "authenticated";
  return hasRequiredAccessLevel(
    getConsoleAccessLevelForRole(userRole),
    requiredAccessLevel
  );
}

export function getWorkspaceShellNavigationKeys(mode: WorkspaceShellNavigationMode) {
  return workspaceShellNavigationByMode[mode];
}

export function getDefaultWorkspaceNavigationMode(layout: "default" | "focused" | "editor") {
  if (layout === "editor") {
    return "studio" satisfies WorkspaceShellNavigationMode;
  }

  if (layout === "focused") {
    return "core" satisfies WorkspaceShellNavigationMode;
  }

  return "all" satisfies WorkspaceShellNavigationMode;
}
