"use server";

import { revalidatePath } from "next/cache";

import { getApiBaseUrl } from "@/lib/api-base-url";

export type SyncAdapterToolsState = {
  status: "idle" | "success" | "error";
  message: string;
  syncedCount: number;
};

export type UpdateWorkflowToolBindingState = {
  status: "idle" | "success" | "error";
  message: string;
  workflowId: string;
  nodeId: string;
  toolId: string;
};

export async function syncAdapterTools(
  _: SyncAdapterToolsState,
  formData: FormData
): Promise<SyncAdapterToolsState> {
  const adapterId = String(formData.get("adapterId") ?? "").trim();
  if (!adapterId) {
    return {
      status: "error",
      message: "未提供 adapter 标识，无法同步工具目录。",
      syncedCount: 0
    };
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/plugins/adapters/${encodeURIComponent(adapterId)}/sync-tools`,
      {
        method: "POST",
        cache: "no-store"
      }
    );
    const body = (await response.json().catch(() => null)) as
      | { discovered_count?: number; detail?: string }
      | null;

    if (!response.ok) {
      return {
        status: "error",
        message: body?.detail ?? `工具目录同步失败，API 返回 ${response.status}。`,
        syncedCount: 0
      };
    }

    const syncedCount = body?.discovered_count ?? 0;
    revalidatePath("/");
    return {
      status: "success",
      message: `已从 ${adapterId} 同步 ${syncedCount} 个工具定义。`,
      syncedCount
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端同步工具目录，请确认 API 与 adapter 已启动。",
      syncedCount: 0
    };
  }
}

export async function updateWorkflowToolBinding(
  _: UpdateWorkflowToolBindingState,
  formData: FormData
): Promise<UpdateWorkflowToolBindingState> {
  const workflowId = String(formData.get("workflowId") ?? "").trim();
  const nodeId = String(formData.get("nodeId") ?? "").trim();
  const toolId = String(formData.get("toolId") ?? "").trim();

  if (!workflowId || !nodeId) {
    return {
      status: "error",
      message: "缺少 workflow 或节点标识，无法保存工具绑定。",
      workflowId,
      nodeId,
      toolId
    };
  }

  try {
    const workflowResponse = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflowId)}`,
      {
        cache: "no-store"
      }
    );

    const workflowBody = (await workflowResponse.json().catch(() => null)) as
      | {
          detail?: string;
          definition?: {
            nodes?: Array<{
              id: string;
              type: string;
              config?: Record<string, unknown>;
            }>;
          };
        }
      | null;

    if (!workflowResponse.ok || !workflowBody?.definition?.nodes) {
      return {
        status: "error",
        message: workflowBody?.detail ?? "无法读取 workflow 定义。",
        workflowId,
        nodeId,
        toolId
      };
    }

    let selectedTool:
      | {
          id: string;
          ecosystem: string;
        }
      | null = null;
    if (toolId) {
      const toolsResponse = await fetch(`${getApiBaseUrl()}/api/plugins/tools`, {
        cache: "no-store"
      });
      const toolsBody = (await toolsResponse.json().catch(() => null)) as
        | Array<{ id: string; ecosystem: string }>
        | { detail?: string }
        | null;

      if (!toolsResponse.ok || !Array.isArray(toolsBody)) {
        return {
          status: "error",
          message:
            (!Array.isArray(toolsBody) ? toolsBody?.detail : null) ??
            "无法读取插件目录。",
          workflowId,
          nodeId,
          toolId
        };
      }

      selectedTool = toolsBody.find((item) => item.id === toolId) ?? null;
      if (!selectedTool) {
        return {
          status: "error",
          message: "选择的工具不在当前插件目录中，请先重新同步。",
          workflowId,
          nodeId,
          toolId
        };
      }
    }

    const nextDefinition = structuredClone(workflowBody.definition);
    const targetNode = nextDefinition.nodes?.find((node) => node.id === nodeId);
    if (!targetNode || targetNode.type !== "tool") {
      return {
        status: "error",
        message: "目标节点不存在，或该节点不是 tool 节点。",
        workflowId,
        nodeId,
        toolId
      };
    }

    nextDefinition.nodes = nextDefinition.nodes?.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const nextConfig = { ...(node.config ?? {}) };
      const previousToolBinding =
        typeof nextConfig.tool === "object" && nextConfig.tool !== null
          ? (nextConfig.tool as Record<string, unknown>)
          : {};

      delete nextConfig.toolId;

      if (!selectedTool) {
        delete nextConfig.tool;
        return {
          ...node,
          config: nextConfig
        };
      }

      nextConfig.tool = {
        toolId: selectedTool.id,
        ecosystem: selectedTool.ecosystem,
        ...(previousToolBinding.credentials
          ? { credentials: previousToolBinding.credentials }
          : {}),
        ...(typeof previousToolBinding.timeoutMs === "number"
          ? { timeoutMs: previousToolBinding.timeoutMs }
          : {})
      };

      return {
        ...node,
        config: nextConfig
      };
    });

    const updateResponse = await fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(workflowId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          definition: nextDefinition
        }),
        cache: "no-store"
      }
    );

    const updateBody = (await updateResponse.json().catch(() => null)) as
      | { detail?: string; version?: string }
      | null;

    if (!updateResponse.ok) {
      return {
        status: "error",
        message: updateBody?.detail ?? "保存 workflow 工具绑定失败。",
        workflowId,
        nodeId,
        toolId
      };
    }

    revalidatePath("/");
    return {
      status: "success",
      message: selectedTool
        ? `已将节点 ${nodeId} 绑定到 ${selectedTool.id}，workflow 已更新为 ${updateBody?.version ?? "新版本"}。`
        : `已清除节点 ${nodeId} 的工具绑定，workflow 已保存。`,
      workflowId,
      nodeId,
      toolId
    };
  } catch {
    return {
      status: "error",
      message: "无法连接后端保存 workflow 工具绑定。",
      workflowId,
      nodeId,
      toolId
    };
  }
}
