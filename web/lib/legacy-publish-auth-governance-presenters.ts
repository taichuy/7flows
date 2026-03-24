export type LegacyPublishAuthGovernanceSurfaceCopy = {
  title: string;
  description: string;
  workflowFollowUpTitle: string;
  workflowFollowUpFallback: string;
};

export function buildLegacyPublishAuthGovernanceSurfaceCopy(): LegacyPublishAuthGovernanceSurfaceCopy {
  return {
    title: "Legacy publish auth handoff",
    description:
      "publish activity export、run diagnostics 和 invocation detail 现在共享同一份 workflow 级 legacy publish auth artifact，避免 operator 在 audit 入口重新拼 draft cleanup / published blocker checklist。",
    workflowFollowUpTitle: "Workflow follow-up",
    workflowFollowUpFallback:
      "回到 workflow detail 继续处理 draft cleanup / published blocker；当前 publish audit detail 与 export 现在共享同一份 workflow handoff。"
  };
}
