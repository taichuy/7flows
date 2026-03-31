import { describe, expect, it } from "vitest";

import {
  canAccessConsolePage,
  canAccessWorkflowStudioSurface,
  canViewConsoleNavItem,
  getConsoleAccessLevelForRole,
  getWorkflowStudioSurfacePermission,
  getWorkspaceConsoleNavigationItems,
  getWorkspaceConsolePageHref,
  WORKSPACE_MODEL_PROVIDER_SETTINGS_HREF,
  WORKSPACE_TEAM_SETTINGS_HREF
} from "@/lib/workspace-console";

function buildRoutePermission(route: string, accessLevel: "authenticated" | "manager") {
  return {
    route,
    access_level: accessLevel,
    methods: ["GET"],
    csrf_protected_methods: [],
    description: route
  };
}

describe("workspace-console route matrix", () => {
  it("maps member roles to console access levels", () => {
    expect(getConsoleAccessLevelForRole(null)).toBe("guest");
    expect(getConsoleAccessLevelForRole("viewer")).toBe("authenticated");
    expect(getConsoleAccessLevelForRole("editor")).toBe("authenticated");
    expect(getConsoleAccessLevelForRole("admin")).toBe("manager");
  });

  it("keeps team settings on a canonical workspace route", () => {
    expect(getWorkspaceConsolePageHref("team")).toBe(WORKSPACE_TEAM_SETTINGS_HREF);
    expect(getWorkspaceConsolePageHref("providers")).toBe(WORKSPACE_MODEL_PROVIDER_SETTINGS_HREF);
    expect(WORKSPACE_MODEL_PROVIDER_SETTINGS_HREF).toBe("/workspace/settings/providers");
    expect(
      getWorkspaceConsoleNavigationItems().find((item) => item.key === "team")?.href
    ).toBe(WORKSPACE_TEAM_SETTINGS_HREF);
  });

  it("allows only managers to access or see the team surface", () => {
    expect(
      canAccessConsolePage("team", {
        current_member: {
          role: "owner"
        },
        route_permissions: [
          {
            route: "/api/workspace/members",
            access_level: "authenticated",
            methods: ["GET"],
            csrf_protected_methods: [],
            description: "members"
          }
        ]
      })
    ).toBe(true);
    expect(
      canAccessConsolePage("providers", {
        current_member: {
          role: "owner"
        },
        route_permissions: [
          {
            route: "/api/workspace/model-providers/settings",
            access_level: "manager",
            methods: ["GET"],
            csrf_protected_methods: [],
            description: "provider settings"
          }
        ]
      })
    ).toBe(true);
    expect(
      canAccessConsolePage("team", {
        current_member: {
          role: "viewer"
        }
      })
    ).toBe(false);
    expect(
      canAccessConsolePage("providers", {
        current_member: {
          role: "owner"
        },
        route_permissions: []
      })
    ).toBe(true);
    expect(canAccessConsolePage("team", null)).toBe(false);
    expect(canViewConsoleNavItem("team", "admin")).toBe(true);
    expect(canViewConsoleNavItem("team", "editor")).toBe(false);
  });

  it("defines workflow studio surface route contracts from a shared matrix", () => {
    expect(getWorkflowStudioSurfacePermission("editor")?.routeContracts).toEqual([
      {
        route: "/api/workflows/{workflow_id}/detail",
        methods: ["GET"]
      }
    ]);
    expect(getWorkflowStudioSurfacePermission("publish")?.routeContracts).toEqual(
      expect.arrayContaining([
        {
          route: "/api/workflows/{workflow_id}/published-endpoints",
          methods: ["GET"]
        },
        {
          route: "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations",
          methods: ["GET"]
        }
      ])
    );
    expect(getWorkflowStudioSurfacePermission("logs")?.routeContracts).toEqual(
      expect.arrayContaining([
        {
          route: "/api/workflows/{workflow_id}/runs",
          methods: ["GET"]
        },
        {
          route: "/api/runs/{run_id}/execution-view",
          methods: ["GET"]
        }
      ])
    );
  });

  it("uses workflow studio route contracts to gate utility surfaces", () => {
    const viewerContext = {
      current_member: {
        role: "viewer" as const
      },
      route_permissions: [
        buildRoutePermission("/api/workflows/{workflow_id}/detail", "authenticated"),
        buildRoutePermission("/api/workflows/{workflow_id}/published-endpoints", "authenticated"),
        buildRoutePermission(
          "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations",
          "authenticated"
        ),
        buildRoutePermission(
          "/api/workflows/{workflow_id}/published-endpoints/{binding_id}/invocations/{invocation_id}",
          "authenticated"
        ),
        buildRoutePermission("/api/workflows/{workflow_id}/runs", "authenticated"),
        buildRoutePermission("/api/runs/{run_id}/detail", "authenticated"),
        buildRoutePermission("/api/runs/{run_id}/execution-view", "authenticated"),
        buildRoutePermission("/api/runs/{run_id}/evidence-view", "authenticated")
      ]
    };

    expect(canAccessWorkflowStudioSurface("editor", viewerContext)).toBe(true);
    expect(canAccessWorkflowStudioSurface("publish", viewerContext)).toBe(true);
    expect(canAccessWorkflowStudioSurface("logs", viewerContext)).toBe(true);
    expect(canAccessWorkflowStudioSurface("monitor", viewerContext)).toBe(true);
    expect(
      canAccessWorkflowStudioSurface("logs", {
        current_member: {
          role: "viewer"
        },
        route_permissions: [
          buildRoutePermission("/api/workflows/{workflow_id}/detail", "authenticated")
        ]
      })
    ).toBe(false);
    expect(canAccessWorkflowStudioSurface("editor", null)).toBe(false);
  });
});
