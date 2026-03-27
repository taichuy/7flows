import { describe, expect, it } from "vitest";

import {
  buildWorkspaceStarterBulkActionErrorMessage,
  buildWorkspaceStarterBulkActionPendingMessage,
  buildWorkspaceStarterBulkActionSuccessMessage,
  buildWorkspaceStarterBulkResultSurfaceCopy,
  buildWorkspaceStarterMetadataIdleMessage,
  buildWorkspaceStarterMutationPendingMessage,
  buildWorkspaceStarterMutationNetworkErrorMessage,
  buildWorkspaceStarterMutationSuccessMessage,
  getWorkspaceStarterBulkActionConfirmationMessage,
  getWorkspaceStarterBulkPreviewReasonLabel,
  getWorkspaceStarterBulkSkipReasonLabel
} from "../workspace-starter-mutation-presenters";

describe("workspace starter mutation presenters", () => {
  it("keeps create/save copy on the shared mutation presenter", () => {
    expect(buildWorkspaceStarterMutationPendingMessage("create")).toBe(
      "正在保存到 workspace starter library..."
    );
    expect(
      buildWorkspaceStarterMutationSuccessMessage({
        action: "create",
        templateName: "Starter A"
      })
    ).toBe("已保存 workspace starter：Starter A。");
    expect(buildWorkspaceStarterMutationNetworkErrorMessage("create")).toContain(
      "保存 workspace starter"
    );
  });

  it("keeps refresh and rebase sandbox drift success copy on the shared presenter", () => {
    expect(
      buildWorkspaceStarterMutationSuccessMessage({
        action: "refresh",
        templateName: "Starter A",
        sourceDiff: {
          sandbox_dependency_summary: {
            template_count: 1,
            source_count: 1,
            added_count: 1,
            removed_count: 0,
            changed_count: 2
          }
        } as never
      })
    ).toBe("已刷新 workspace starter：Starter A。 已同步 3 个 sandbox 依赖漂移节点。");

    expect(
      buildWorkspaceStarterMutationSuccessMessage({
        action: "rebase",
        templateName: "Starter A",
        sourceDiff: {
          sandbox_dependency_summary: {
            template_count: 1,
            source_count: 1,
            added_count: 0,
            removed_count: 1,
            changed_count: 0
          }
        } as never
      })
    ).toBe("已完成 workspace starter rebase：Starter A。 已接受 1 个 sandbox 依赖漂移节点的来源变更。");
  });

  it("builds canonical bulk mutation feedback messages", () => {
    expect(buildWorkspaceStarterBulkActionPendingMessage("rebase")).toBe(
      "正在对当前筛选结果批量rebase..."
    );
    expect(buildWorkspaceStarterBulkActionErrorMessage("delete")).toBe("批量删除失败。");
    expect(
      buildWorkspaceStarterBulkActionSuccessMessage({
        action: "refresh",
        updated_count: 1,
        skipped_count: 2,
        deleted_items: [],
        skipped_reason_summary: [
          { reason: "no_source_workflow", count: 1, detail: "missing source" },
          { reason: "already_aligned", count: 1, detail: "already synced" }
        ],
        sandbox_dependency_changes: {
          template_count: 1,
          source_count: 1,
          added_count: 0,
          removed_count: 1,
          changed_count: 1
        },
        sandbox_dependency_items: [
          {
            template_id: "starter-a",
            name: "Starter A",
            source_workflow_id: "wf-a",
            source_workflow_version: "0.1.0",
            sandbox_dependency_changes: {
              template_count: 1,
              source_count: 1,
              added_count: 0,
              removed_count: 1,
              changed_count: 1
            },
            sandbox_dependency_nodes: ["sandbox"]
          }
        ]
      })
    ).toBe("已刷新 1 个模板，跳过 2 个模板（无来源 1 / 已对齐 1），涉及 1 个 starter / 2 个 sandbox 依赖漂移节点。");
  });

  it("keeps shared guidance copy for bulk result and metadata idle state", () => {
    expect(buildWorkspaceStarterBulkResultSurfaceCopy()).toEqual({
      recommendedNextStepDescription:
        "同一份 result receipt 现在会先投影稳定的 next-step presenter；`follow_up` 只保留为解释文本，不再承担主要导航语义。",
      focusDescription:
        "result receipt 已把“已处理 / 已跳过”的 starter 收口到同一张清单里；点击任一条目会自动切换筛选范围，并把右侧详情聚焦到对应模板的 source diff / metadata。"
    });
    expect(buildWorkspaceStarterMetadataIdleMessage()).toBe(
      "更新后会直接写回 workspace starter library，创建页会立刻复用最新元数据。"
    );
  });

  it("normalizes skip reasons and confirmation copy on the presenter layer", () => {
    expect(getWorkspaceStarterBulkSkipReasonLabel("source_workflow_missing")).toBe("来源缺失");
    expect(getWorkspaceStarterBulkPreviewReasonLabel("name_drift_only")).toBe("仅名称漂移");
    expect(getWorkspaceStarterBulkActionConfirmationMessage("delete", 3)).toContain(
      "3 个已归档 starter"
    );
    expect(buildWorkspaceStarterMutationNetworkErrorMessage("refresh")).toContain("确认 API 已启动");
  });
});
