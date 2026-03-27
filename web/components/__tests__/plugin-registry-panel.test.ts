import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PluginRegistryPanel } from "@/components/plugin-registry-panel";
import type { PluginAdapterRegistryItem } from "@/lib/get-plugin-registry";

vi.mock("@/components/adapter-sync-form", () => ({
  AdapterSyncForm: ({ adapterId }: { adapterId: string }) =>
    createElement("div", null, `sync:${adapterId}`)
}));

vi.mock("@/components/tool-governance-summary", () => ({
  ToolGovernanceSummary: () => createElement("div", null, "tool-governance")
}));

function buildAdapter(overrides: Partial<PluginAdapterRegistryItem> = {}): PluginAdapterRegistryItem {
  return {
    id: "dify-default",
    ecosystem: "compat:dify",
    endpoint: "http://adapter.local",
    enabled: true,
    healthcheck_path: "/healthz",
    workspace_ids: [],
    plugin_kinds: ["node", "provider"],
    supported_execution_classes: ["subprocess"],
    status: "degraded",
    detail: null,
    mode: "translate",
    ...overrides
  };
}

describe("PluginRegistryPanel", () => {
  it("surfaces adapter mode specific guidance", () => {
    const html = renderToStaticMarkup(
      createElement(PluginRegistryPanel, {
        adapters: [buildAdapter()],
        tools: []
      })
    );

    expect(html).toContain("mode=translate");
    expect(html).toContain("只做受约束 contract 校验与 payload 翻译");
    expect(html).toContain("sync:dify-default");
  });

  it("prefers explicit adapter detail when available", () => {
    const html = renderToStaticMarkup(
      createElement(PluginRegistryPanel, {
        adapters: [buildAdapter({ detail: "daemon unreachable", mode: "proxy" })],
        tools: []
      })
    );

    expect(html).toContain("mode=proxy");
    expect(html).toContain("daemon unreachable");
    expect(html).not.toContain("继续代理到 Dify plugin daemon");
  });
});
