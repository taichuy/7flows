import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadWorkflowEditorWorkbenchBootstrap } from "@/components/workflow-editor-workbench/bootstrap";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflows } from "@/lib/get-workflows";

vi.mock("@/lib/get-workflow-library", () => ({
  getWorkflowLibrarySnapshot: vi.fn()
}));

vi.mock("@/lib/get-workflows", () => ({
  getWorkflows: vi.fn()
}));

vi.mock("@/lib/get-plugin-registry", () => ({
  getPluginRegistrySnapshot: vi.fn()
}));

vi.mock("@/lib/get-system-overview", () => ({
  getSystemOverview: vi.fn()
}));

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getWorkflows).mockResolvedValue([
    { id: "workflow-1" },
    { id: "workflow-2" }
  ] as Awaited<ReturnType<typeof getWorkflows>>);
  vi.mocked(getWorkflowLibrarySnapshot).mockResolvedValue({
    nodes: [{ type: "trigger" }],
    starters: [],
    starterSourceLanes: [],
    nodeSourceLanes: [{ kind: "node" }],
    toolSourceLanes: [{ kind: "tool" }],
    tools: [{ id: "tool-1" }]
  } as unknown as Awaited<ReturnType<typeof getWorkflowLibrarySnapshot>>);
  vi.mocked(getPluginRegistrySnapshot).mockResolvedValue({
    adapters: [{ id: "adapter-1" }],
    tools: [{ id: "tool-1" }]
  } as Awaited<ReturnType<typeof getPluginRegistrySnapshot>>);
  vi.mocked(getSystemOverview).mockResolvedValue({
    callback_waiting_automation: {
      pending_count: 1,
      recovery_queue_count: 0,
      summary: "1 callback waiting"
    },
    sandbox_readiness: {
      enabled_backend_count: 1,
      healthy_backend_count: 1,
      degraded_backend_count: 0,
      offline_backend_count: 0,
      execution_classes: [],
      supported_languages: [],
      supported_profiles: [],
      supported_dependency_modes: [],
      supports_tool_execution: true,
      supports_builtin_package_sets: true,
      supports_backend_extensions: false,
      supports_network_policy: true,
      supports_filesystem_policy: true,
      affected_run_count: 0,
      affected_workflow_count: 0,
      primary_blocker_kind: null,
      recommended_action: null
    },
    sandbox_backends: [{ backend_id: "sandbox-local" }],
    runtime_activity: {
      recent_runs: [],
      recent_events: [],
      summary: {
        recent_run_count: 0,
        recent_event_count: 0,
        run_statuses: {},
        event_types: {}
      }
    }
  } as unknown as Awaited<ReturnType<typeof getSystemOverview>>);
});

describe("loadWorkflowEditorWorkbenchBootstrap", () => {
  it("loads editor setup only after the entry bootstrap seam", async () => {
    const result = await loadWorkflowEditorWorkbenchBootstrap({
      workflowId: "workflow-1",
      surface: "editor"
    });

    expect(vi.mocked(getWorkflows)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getWorkflowLibrarySnapshot)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getPluginRegistrySnapshot)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getSystemOverview)).toHaveBeenCalledTimes(1);
    expect(result.workflows).toHaveLength(2);
    expect(result.nodeCatalog).toHaveLength(1);
    expect(result.nodeSourceLanes).toHaveLength(1);
    expect(result.toolSourceLanes).toHaveLength(1);
    expect(result.tools).toHaveLength(1);
    expect(result.adapters).toHaveLength(1);
    expect(result.callbackWaitingAutomation).not.toBeNull();
    expect(result.sandboxReadiness).not.toBeNull();
    expect(result.sandboxBackends).toHaveLength(1);
  });
});
