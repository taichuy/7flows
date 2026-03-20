import { describe, expect, it } from "vitest";

import {
  buildRunDiagnosticsHeroSurfaceCopy,
  buildRunDiagnosticsTraceSurfaceCopy
} from "./run-diagnostics-presenters";

describe("run diagnostics presenters", () => {
  it("为 diagnostics hero 提供统一入口说明", () => {
    expect(buildRunDiagnosticsHeroSurfaceCopy()).toEqual({
      description: expect.stringContaining("直接消费 `run trace`"),
      homeLinkLabel: "返回系统首页",
      eventsApiLinkLabel: "打开原始 events API"
    });
  });

  it("为 trace filters 提供统一说明、hint 与空态 copy", () => {
    expect(
      buildRunDiagnosticsTraceSurfaceCopy({
        defaultLimit: 200
      })
    ).toEqual({
      sectionDescription: "这里直接消费 `/trace`，用于人类排障；AI 和自动化仍应优先直连机器接口。",
      applyFiltersLabel: "应用过滤",
      resetFiltersLabel: "重置过滤",
      defaultLimitHint: "默认 limit 200",
      utcTimeWindowHint: "时间窗输入按 UTC ISO 传给 API",
      cursorPaginationHint: "翻页通过 opaque cursor 保持当前过滤条件",
      emptyState: "当前是默认 trace 视图，没有额外过滤条件。"
    });
  });
});
