export type RunDiagnosticsHeroSurfaceCopy = {
  description: string;
  homeLinkLabel: string;
  eventsApiLinkLabel: string;
};

export type RunDiagnosticsTraceSurfaceCopy = {
  sectionDescription: string;
  applyFiltersLabel: string;
  resetFiltersLabel: string;
  defaultLimitHint: string;
  utcTimeWindowHint: string;
  cursorPaginationHint: string;
  emptyState: string;
};

export function buildRunDiagnosticsHeroSurfaceCopy(): RunDiagnosticsHeroSurfaceCopy {
  return {
    description:
      "这页现在直接消费 `run trace`，可以按事件类型、节点、时间窗和 payload key 顺着 `run_events` 排障，同时保留导出与原始事件入口。",
    homeLinkLabel: "返回系统首页",
    eventsApiLinkLabel: "打开原始 events API"
  };
}

export function buildRunDiagnosticsTraceSurfaceCopy({
  defaultLimit
}: {
  defaultLimit: number;
}): RunDiagnosticsTraceSurfaceCopy {
  return {
    sectionDescription:
      "这里直接消费 `/trace`，用于人类排障；AI 和自动化仍应优先直连机器接口。",
    applyFiltersLabel: "应用过滤",
    resetFiltersLabel: "重置过滤",
    defaultLimitHint: `默认 limit ${defaultLimit}`,
    utcTimeWindowHint: "时间窗输入按 UTC ISO 传给 API",
    cursorPaginationHint: "翻页通过 opaque cursor 保持当前过滤条件",
    emptyState: "当前是默认 trace 视图，没有额外过滤条件。"
  };
}
