import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutputNodeConfigForm } from "@/components/workflow-node-config-form/output-node-config-form";

describe("OutputNodeConfigForm", () => {
  it("renders direct-reply template controls and reference hints", () => {
    const html = renderToStaticMarkup(
      createElement(OutputNodeConfigForm, {
        node: {
          id: "end-1",
          type: "workflowNode",
          position: { x: 0, y: 0 },
          data: {
            label: "结束",
            nodeType: "endNode",
            config: {
              replyTemplate: "你好，{{ accumulated.agent.answer }}",
              responseKey: "answer"
            }
          }
        } as never,
        nodes: [
          {
            id: "agent",
            type: "workflowNode",
            position: { x: 0, y: 0 },
            data: {
              label: "LLM",
              nodeType: "llmAgentNode",
              config: {}
            }
          }
        ] as never,
        onChange: () => undefined
      })
    );

    expect(html).toContain("Direct reply");
    expect(html).toContain("回复模板");
    expect(html).toContain("{{ text }}");
    expect(html).toContain("{{ accumulated.agent.answer }}");
    expect(html).toContain("LLM · agent");
    expect(html).toContain("回复字段名");
  });
});
