import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkflowEditorPublishEndpointCard } from "@/components/workflow-editor-publish-endpoint-card";
import type { WorkflowValidationNavigatorItem } from "@/lib/workflow-validation-navigation";

describe("WorkflowEditorPublishEndpointCard", () => {
  it("shows focused remediation inside the matching endpoint card", () => {
    const focusedValidationItem: WorkflowValidationNavigatorItem = {
      key: "publish-cache-vary-by",
      category: "publish_draft",
      message: "Public Search 的 cache.varyBy 不能包含重复字段。",
      target: {
        scope: "publish",
        endpointIndex: 0,
        fieldPath: "cache.varyBy",
        label: "Publish · Public Search"
      }
    };

    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishEndpointCard, {
        endpoint: {
          id: "public-search",
          name: "Public Search",
          alias: "public-search",
          path: "/public-search",
          protocol: "openai",
          authMode: "api_key",
          streaming: true,
          workflowVersion: undefined,
          inputSchema: {},
          cache: {
            enabled: true,
            ttl: 60,
            maxEntries: 128,
            varyBy: ["input.locale", "input.locale"]
          }
        },
        endpointIndex: 0,
        workflowVersion: "1.0.0",
        validationMessages: ["Public Search 的 cache.varyBy 不能包含重复字段。"],
        focusedValidationItem,
        highlighted: true,
        highlightedFieldPath: "cache.varyBy",
        onUpdateEndpoint: () => undefined,
        onDeleteEndpoint: () => undefined,
        onApplySchemaField: () => undefined
      })
    );

    expect(html).toContain("Publish · Public Search · Cache varyBy");
    expect(html).toContain("去掉重复或无意义的缓存维度");
    expect(html).toContain('data-validation-field="cache.varyBy"');
    expect(html).toContain("validation-focus-ring");
  });
});
