import { describe, expect, it } from "vitest";

import {
  buildAuthorFacingRunDetailLinkSurface,
  buildAuthorFacingWorkflowDetailLinkSurface,
  buildRunDetailExecutionFocusSurfaceCopy,
  buildRunDiagnosticsOperatorFollowUpSurfaceCopy,
  buildRunLibrarySurfaceCopy,
  buildSensitiveAccessInboxEntryExecutionSurfaceCopy,
  buildSensitiveAccessInboxSurfaceCopy,
  buildWorkflowCreateWizardSurfaceCopy,
  buildWorkflowEditorHeroSurfaceCopy,
  buildWorkflowLibrarySurfaceCopy,
  buildWorkflowPublishPanelSurfaceCopy,
  buildWorkspaceStarterGovernanceHeroSurfaceCopy,
  buildWorkspaceStarterTemplateListSurfaceCopy
} from "@/lib/workbench-entry-surfaces";

describe("workbench entry surface copy", () => {
  it("reuses the operator run-detail contract for author-facing run links", () => {
    expect(buildAuthorFacingRunDetailLinkSurface({ runId: "run-1" })).toEqual({
      href: "/runs/run-1",
      label: "查看 run 诊断面板"
    });
    expect(
      buildAuthorFacingRunDetailLinkSurface({
        runId: "run-1",
        variant: "latest"
      })
    ).toEqual({
      href: "/runs/run-1",
      label: "打开最新 run 诊断面板"
    });
  });

  it("keeps author-facing workflow entry labels on the shared workflow detail contract", () => {
    expect(buildAuthorFacingWorkflowDetailLinkSurface({ workflowId: "workflow-1" })).toEqual({
      href: "/workflows/workflow-1",
      label: "打开 workflow 详情"
    });
    expect(
      buildAuthorFacingWorkflowDetailLinkSurface({
        workflowId: "workflow-1",
        variant: "editor"
      })
    ).toEqual({
      href: "/workflows/workflow-1",
      label: "回到 workflow 编辑器"
    });
    expect(
      buildAuthorFacingWorkflowDetailLinkSurface({
        workflowId: "workflow-1",
        variant: "recent"
      })
    ).toEqual({
      href: "/workflows/workflow-1",
      label: "打开最近 workflow"
    });
    expect(
      buildAuthorFacingWorkflowDetailLinkSurface({
        workflowId: "workflow-1",
        variant: "source"
      })
    ).toEqual({
      href: "/workflows/workflow-1",
      label: "打开源 workflow"
    });
  });

  it("keeps the run library operator follow-up on the shared inbox contract", () => {
    const surfaceCopy = buildRunLibrarySurfaceCopy();

    expect(surfaceCopy.heroLinks).toMatchObject({
      keys: ["operatorInbox", "workflowLibrary", "home"]
    });
    expect(surfaceCopy.heroLinks.overrides?.operatorInbox?.label).toBe(
      "回到 sensitive access inbox"
    );
    expect(surfaceCopy.operatorEntryLinks).toMatchObject({
      keys: ["operatorInbox", "workflowLibrary"],
      primaryKey: "operatorInbox",
      variant: "inline"
    });
  });

  it("keeps workflow library follow-up copy and CTA set centralized", () => {
    const surfaceCopy = buildWorkflowLibrarySurfaceCopy();

    expect(surfaceCopy.heroLinks.keys).toEqual([
      "createWorkflow",
      "workspaceStarterLibrary",
      "runLibrary",
      "home"
    ]);
    expect(surfaceCopy.nextStepTitle).toBe("继续推进主链");
    expect(surfaceCopy.nextStepLinks.overrides?.workspaceStarterLibrary?.label).toBe(
      "打开 workspace starter library"
    );
    expect(surfaceCopy.nextStepLinks.overrides?.operatorInbox?.label).toBe(
      "打开 sensitive access inbox"
    );
  });

  it("keeps workspace starter governance hero CTA copy on the shared surface contract", () => {
    const surfaceCopy = buildWorkspaceStarterGovernanceHeroSurfaceCopy({
      createWorkflowHref:
        "/workflows/new?needs_follow_up=true&starter=starter-a&track=%E5%BA%94%E7%94%A8%E6%96%B0%E5%BB%BA%E7%BC%96%E6%8E%92"
    });

    expect(surfaceCopy.heroDescription).toContain("workspace starter");
    expect(surfaceCopy.heroLinks).toMatchObject({
      keys: ["createWorkflow", "home"],
      primaryKey: "createWorkflow",
      variant: "inline"
    });
    expect(surfaceCopy.heroLinks.overrides?.createWorkflow?.label).toBe("返回创建页");
  });

  it("keeps workspace starter template-list follow-up copy on the shared surface contract", () => {
    const surfaceCopy = buildWorkspaceStarterTemplateListSurfaceCopy({
      createWorkflowHref:
        "/workflows/new?needs_follow_up=true&q=sandbox&source_governance_kind=drifted"
    });

    expect(surfaceCopy.sectionDescription).toContain("关键字收敛范围");
    expect(surfaceCopy.sourceGovernanceMeta).toContain("deep link 口径一致");
    expect(surfaceCopy.followUpQueueLabel).toBe("仅显示需要 follow-up 的 starter");
    expect(surfaceCopy.followUpQueueMeta).toContain("来源漂移 / 来源缺失");
    expect(surfaceCopy.emptyStateLinks).toMatchObject({
      keys: ["createWorkflow"],
      primaryKey: "createWorkflow",
      variant: "inline"
    });
    expect(surfaceCopy.emptyStateLinks.overrides?.createWorkflow?.label).toBe(
      "去创建第一个 starter"
    );
  });

  it("normalizes the sensitive access hero back-link to the shared workflow label", () => {
    const surfaceCopy = buildSensitiveAccessInboxSurfaceCopy();

    expect(surfaceCopy.heroLinks).toMatchObject({
      keys: ["runLibrary", "workflowLibrary", "home"]
    });
    expect(surfaceCopy.heroLinks.overrides?.workflowLibrary?.label).toBe(
      "回到 workflow 列表"
    );
  });

  it("reuses the shared workflow library CTA contract for publish governance", () => {
    const surfaceCopy = buildWorkflowPublishPanelSurfaceCopy();

    expect(surfaceCopy.eyebrow).toBe("Publish");
    expect(surfaceCopy.title).toBe("Endpoint governance");
    expect(surfaceCopy.primaryFollowUpTitle).toBe("Primary follow-up");
    expect(surfaceCopy.sandboxReadinessTitle).toBe("Live sandbox readiness");
    expect(surfaceCopy.sandboxReadinessDescription).toContain("live sandbox readiness");
    expect(surfaceCopy.headerLinks).toMatchObject({
      keys: ["workflowLibrary", "runLibrary", "operatorInbox", "home"],
      primaryKey: "workflowLibrary",
      variant: "inline"
    });
    expect(surfaceCopy.headerLinks.overrides?.workflowLibrary?.label).toBe(
      "回到 workflow 列表"
    );
    expect(surfaceCopy.emptyStateDescription).toContain("还没有声明 `publish`");
  });

  it("keeps sensitive access execution-card prose on the shared focus contract", () => {
    const surfaceCopy = buildSensitiveAccessInboxEntryExecutionSurfaceCopy({
      focusMatchesEntry: false,
      entryNodeRunId: "node-run-entry",
      focusNodeName: "Focus Node",
      focusInboxHref: "/sensitive-access?run_id=run-1&node_run_id=node-run-focus",
      runId: "run-1"
    });

    expect(surfaceCopy.focusDescription).toContain("node run node-run-entry");
    expect(surfaceCopy.focusDescription).toContain("Focus Node");
    expect(surfaceCopy.recommendedNextStepLabel).toBe("focus node");
    expect(surfaceCopy.recommendedNextStepHrefLabel).toBe("slice to focus node");
    expect(surfaceCopy.recommendedNextStepFallbackDetail).toContain("focus node 的 inbox slice");
  });

  it("keeps run detail execution focus fallback and skill trace narrative centralized", () => {
    const surfaceCopy = buildRunDetailExecutionFocusSurfaceCopy();

    expect(surfaceCopy.recommendedNextStepFallbackDetail).toContain(
      "canonical execution focus"
    );
    expect(surfaceCopy.focusedSkillTraceDescription).toContain(
      "execution focus skill trace"
    );
  });

  it("keeps diagnostics operator snapshot prose on the shared workbench surface", () => {
    const surfaceCopy = buildRunDiagnosticsOperatorFollowUpSurfaceCopy();

    expect(surfaceCopy.description).toContain("canonical operator snapshot");
    expect(surfaceCopy.callbackFallbackDetail).toContain("waiting / callback 事实");
  });

  it("keeps workflow editor governance CTA copy in the shared hero contract", () => {
    const surfaceCopy = buildWorkflowEditorHeroSurfaceCopy({
      createWorkflowHref:
        "/workflows/new?needs_follow_up=true&q=drift&source_governance_kind=drifted",
      workspaceStarterLibraryHref:
        "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted",
      plannedNodeSummary: "Loop x1"
    });

    expect(surfaceCopy.heroLinks).toMatchObject({
      keys: ["workflowLibrary", "home", "createWorkflow", "workspaceStarterLibrary"],
      primaryKey: "workflowLibrary",
      variant: "inline"
    });
    expect(surfaceCopy.heroLinks.overrides?.workflowLibrary?.label).toBe("回到 workflow 列表");
    expect(surfaceCopy.heroLinks.overrides?.createWorkflow?.href).toContain("needs_follow_up=true");
    expect(surfaceCopy.heroLinks.overrides?.workspaceStarterLibrary?.href).toContain(
      "source_governance_kind=drifted"
    );
    expect(surfaceCopy.plannedNodeBoundaryValue).toBe(
      "Loop x1 仍保持 planned；发布网关 / 调试联动继续推进"
    );
    expect(surfaceCopy.scopedGovernanceBackLinkLabel).toBe("回到治理页");
    expect(surfaceCopy.scopedGovernanceCreateWorkflowLabel).toBe("再新建一个 workflow");
  });

  it("keeps workflow create wizard governance scope copy in the shared surface contract", () => {
    const surfaceCopy = buildWorkflowCreateWizardSurfaceCopy({
      starterGovernanceHref:
        "/workspace-starters?needs_follow_up=true&q=drift&source_governance_kind=drifted"
    });

    expect(surfaceCopy.heroLinks).toMatchObject({
      keys: ["home", "workspaceStarterLibrary"],
      primaryKey: "home",
      variant: "inline"
    });
    expect(surfaceCopy.emptyStateLinks.overrides?.workspaceStarterLibrary?.label).toBe(
      "回到治理页"
    );
    expect(surfaceCopy.scopedGovernanceBackLinkLabel).toBe("回到治理页");
    expect(surfaceCopy.sourceGovernanceFollowUpLinkLabel).toBe(
      "管理这个 workspace starter"
    );
  });
});
