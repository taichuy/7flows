import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";

describe("OutputNodeConfigForm", () => {
  it("renders the inline variable editor toolbar instead of the large variable panel", () => {
    const html = renderToStaticMarkup(
      createElement(OutputNodeConfigForm, {
        node: {
          id: "endNode_ab12cd34",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "直接回复",
            nodeType: "endNode",
            config: {
              replyDocument: {
                version: 1,
                segments: [
                  { type: "text", text: "你好，" },
                  { type: "variable", refId: "ref_1" },
                ],
              },
              replyReferences: [
                {
                  refId: "ref_1",
                  alias: "answer",
                  ownerNodeId: "endNode_ab12cd34",
                  selector: ["accumulated", "agent", "answer"],
                },
              ],
            },
          },
        } as never,
        nodes: [] as never,
        onChange: () => undefined,
      }),
    );

    expect(html).toContain("workflow-variable-text-editor-toolbar");
    expect(html).toContain('data-component="workflow-variable-text-editor-input"');
    expect(html).not.toContain("复制机器别名");
    expect(html).not.toContain("复制出去的机器别名");
  });
});
