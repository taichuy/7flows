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
        validationIssues: [
          {
            key: "publish-cache-vary-by",
            endpointKey: "0",
            endpointId: "public-search",
            category: "publish_draft",
            message: "Public Search 的 cache.varyBy 不能包含重复字段。",
            path: "publish.0.cache.varyBy",
            field: "cache.varyBy"
          }
        ],
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
    expect(html).toContain('id="workflow-editor-publish-endpoint-public-search"');
    expect(html).toContain("validation-focus-ring");
  });

  it("surfaces legacy unsupported auth mode without keeping it in the selectable support list", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishEndpointCard, {
        endpoint: {
          id: "public-search",
          name: "Public Search",
          alias: "public-search",
          path: "/public-search",
          protocol: "openai",
          authMode: "token",
          streaming: true,
          workflowVersion: undefined,
          inputSchema: {}
        },
        endpointIndex: 0,
        workflowVersion: "1.0.0",
        validationIssues: [],
        onUpdateEndpoint: () => undefined,
        onDeleteEndpoint: () => undefined,
        onApplySchemaField: () => undefined
      })
    );

    expect(html).toContain("auth token");
    expect(html).toContain("token (unsupported legacy value)");
    expect(html).toContain("api_key");
    expect(html).toContain("internal");
    expect(html).toContain("Publish auth contract");
    expect(html).toContain("supported api_key / internal");
    expect(html).toContain("legacy token");
    expect(html).toContain("先把 workflow draft endpoint 切回 api_key/internal 并保存");
  });

  it("promotes legacy auth endpoint issues into shared remediation instead of raw lists", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishEndpointCard, {
        endpoint: {
          id: "public-search",
          name: "Public Search",
          alias: "public-search",
          path: "/public-search",
          protocol: "openai",
          authMode: "token",
          streaming: true,
          workflowVersion: undefined,
          inputSchema: {}
        },
        endpointIndex: 0,
        workflowVersion: "1.0.0",
        validationIssues: [
          {
            key: "public-search-auth-mode-token",
            endpointKey: "0",
            endpointId: "public-search",
            category: "publish_draft",
            message: "Public Search 当前不能使用 authMode = token。",
            path: "publish.0.authMode",
            field: "authMode"
          }
        ],
        onUpdateEndpoint: () => undefined,
        onDeleteEndpoint: () => undefined,
        onApplySchemaField: () => undefined
      })
    );

    expect(html).toContain("Publish · Public Search · Auth mode");
    expect(html).toContain("Publish auth contract");
    expect(html).not.toContain("<li>Public Search 当前不能使用 authMode = token。</li>");
  });

  it("promotes the first generic endpoint issue into shared remediation and keeps the rest listed", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowEditorPublishEndpointCard, {
        endpoint: {
          id: "public search",
          name: "Public Search",
          alias: "public-search",
          path: "public-search",
          protocol: "openai",
          authMode: "api_key",
          streaming: true,
          workflowVersion: undefined,
          inputSchema: {}
        },
        endpointIndex: 0,
        workflowVersion: "1.0.0",
        validationIssues: [
          {
            key: "public-search-id-format",
            endpointKey: "0",
            endpointId: "public-search",
            category: "publish_draft",
            message: "Public Search 的 endpoint id 只能包含小写字母、数字、- 和 _。",
            path: "publish.0.id",
            field: "id"
          },
          {
            key: "public-search-path-format",
            endpointKey: "0",
            endpointId: "public-search",
            category: "publish_draft",
            message: "Public Search 的 path 必须以 / 开头。",
            path: "publish.0.path",
            field: "path"
          }
        ],
        onUpdateEndpoint: () => undefined,
        onDeleteEndpoint: () => undefined,
        onApplySchemaField: () => undefined
      })
    );

    expect(html).toContain("Publish · Public Search · Endpoint id");
    expect(html).toContain("把名称和标识收敛成当前 workflow 内唯一且可读的一组入口");
    expect(html).not.toContain("<li>Public Search 的 endpoint id 只能包含小写字母、数字、- 和 _。</li>");
    expect(html).toContain("<li>Public Search 的 path 必须以 / 开头。</li>");
  });
});
