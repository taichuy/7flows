import { describe, expect, it } from "vitest";

import type { PluginToolRegistryItem } from "../get-plugin-registry";
import { getToolExecutionOverrideScope } from "../tool-governance";

function createTool(
  overrides: Partial<PluginToolRegistryItem> & Pick<PluginToolRegistryItem, "id">
): PluginToolRegistryItem {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    ecosystem: overrides.ecosystem ?? "native",
    description: overrides.description ?? "",
    input_schema: overrides.input_schema ?? {},
    output_schema: overrides.output_schema ?? null,
    source: overrides.source ?? "test",
    plugin_meta: overrides.plugin_meta ?? null,
    callable: overrides.callable ?? true,
    supported_execution_classes: overrides.supported_execution_classes ?? ["inline"],
    default_execution_class: overrides.default_execution_class ?? null,
    sensitivity_level: overrides.sensitivity_level ?? null
  };
}

describe("tool governance execution override scope", () => {
  it("默认按全部 callable tools 收口共同支持的 execution class", () => {
    const scope = getToolExecutionOverrideScope({
      tools: [
        createTool({
          id: "tool-a",
          supported_execution_classes: ["inline", "sandbox", "microvm"]
        }),
        createTool({
          id: "tool-b",
          supported_execution_classes: ["sandbox", "microvm"]
        }),
        createTool({
          id: "tool-c",
          callable: false,
          supported_execution_classes: ["inline"]
        })
      ]
    });

    expect(scope.scopedTools.map((tool) => tool.id)).toEqual(["tool-a", "tool-b"]);
    expect(scope.sharedExecutionClasses).toEqual(["sandbox", "microvm"]);
    expect(scope.compatibleSelectedTools).toEqual([]);
    expect(scope.unsupportedSelectedTools).toEqual([]);
  });

  it("在 allow list 收窄后按选中工具重新计算 execution class", () => {
    const tools = [
      createTool({
        id: "tool-a",
        supported_execution_classes: ["inline", "sandbox"]
      }),
      createTool({
        id: "tool-b",
        supported_execution_classes: ["sandbox", "microvm"]
      })
    ];

    const scope = getToolExecutionOverrideScope({
      tools,
      allowedToolIds: ["tool-a"]
    });

    expect(scope.scopedTools.map((tool) => tool.id)).toEqual(["tool-a"]);
    expect(scope.sharedExecutionClasses).toEqual(["inline", "sandbox"]);
    expect(scope.compatibleSelectedTools).toEqual([]);
  });

  it("返回当前 override 不兼容的工具列表", () => {
    const scope = getToolExecutionOverrideScope({
      tools: [
        createTool({
          id: "tool-a",
          name: "Tool A",
          supported_execution_classes: ["inline", "sandbox"]
        }),
        createTool({
          id: "tool-b",
          name: "Tool B",
          supported_execution_classes: ["sandbox", "microvm"]
        })
      ],
      selectedExecutionClass: "microvm"
    });

    expect(scope.sharedExecutionClasses).toEqual(["sandbox"]);
    expect(scope.compatibleSelectedTools.map((tool) => tool.id)).toEqual(["tool-b"]);
    expect(scope.unsupportedSelectedTools.map((tool) => tool.id)).toEqual(["tool-a"]);
  });

  it("allow list 未命中任何 callable tool 时返回空 scope", () => {
    const scope = getToolExecutionOverrideScope({
      tools: [createTool({ id: "tool-a", supported_execution_classes: ["inline", "sandbox"] })],
      allowedToolIds: ["missing-tool"]
    });

    expect(scope.scopedTools).toEqual([]);
    expect(scope.sharedExecutionClasses).toEqual([]);
    expect(scope.compatibleSelectedTools).toEqual([]);
    expect(scope.unsupportedSelectedTools).toEqual([]);
  });

  it("在 allow list 已存在时只返回当前 scope 内兼容 override 的工具", () => {
    const scope = getToolExecutionOverrideScope({
      tools: [
        createTool({
          id: "tool-a",
          supported_execution_classes: ["inline", "sandbox"]
        }),
        createTool({
          id: "tool-b",
          supported_execution_classes: ["sandbox", "microvm"]
        }),
        createTool({
          id: "tool-c",
          supported_execution_classes: ["microvm"]
        })
      ],
      allowedToolIds: ["tool-a", "tool-b"],
      selectedExecutionClass: "microvm"
    });

    expect(scope.scopedTools.map((tool) => tool.id)).toEqual(["tool-a", "tool-b"]);
    expect(scope.compatibleSelectedTools.map((tool) => tool.id)).toEqual(["tool-b"]);
    expect(scope.unsupportedSelectedTools.map((tool) => tool.id)).toEqual(["tool-a"]);
  });
});
