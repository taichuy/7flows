import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WorkflowApiSurface } from "@/components/workflow-api-surface";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href?: string;
  } & Record<string, unknown>) => createElement("a", { href: href ?? "#", ...props }, children)
}));

vi.mock("@/app/actions/publish", () => ({
  invokePublishedEndpointSample: vi.fn()
}));

function buildBinding(
  id: string,
  overrides: Partial<WorkflowPublishedEndpointItem> = {}
): WorkflowPublishedEndpointItem {
  return {
    id,
    workflow_id: "workflow-1",
    workflow_version_id: "workflow-version-1",
    workflow_version: "v1",
    target_workflow_version_id: "workflow-version-1",
    target_workflow_version: "v1",
    compiled_blueprint_id: "blueprint-1",
    endpoint_id: `${id}-endpoint`,
    endpoint_name: `Endpoint ${id}`,
    endpoint_alias: `${id}.alias`,
    route_path: `/published/${id}`,
    protocol: "native",
    auth_mode: "api_key",
    streaming: false,
    lifecycle_status: "published",
    input_schema: {},
    output_schema: null,
    activity: {
      total_count: 2,
      succeeded_count: 2,
      failed_count: 0,
      rejected_count: 0,
      cache_hit_count: 0,
      cache_miss_count: 2,
      cache_bypass_count: 0,
      pending_approval_count: 0,
      pending_notification_count: 0,
      primary_sensitive_resource: null,
      last_invoked_at: "2026-03-31T08:10:00Z"
    },
    cache_inventory: null,
    rate_limit_policy: null,
    cache_policy: null,
    published_at: "2026-03-31T08:00:00Z",
    created_at: "2026-03-31T08:00:00Z",
    updated_at: "2026-03-31T08:10:00Z",
    issues: [],
    ...overrides
  } as WorkflowPublishedEndpointItem;
}

const idleSampleQueryScope = {
  status: "idle",
  bindingId: null,
  invocationId: null,
  runId: null,
  runStatus: null,
  message: null,
  requestSurface: null,
  cleanup: null
} as const;

describe("WorkflowApiSurface", () => {
  it("renders a navigable documentation layout with a local sample invocation form", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowApiSurface, {
        workflowId: "workflow-1",
        bindings: [
          buildBinding("binding-1", {
            endpoint_name: "OpenAI Chat",
            endpoint_alias: "chat.public",
            route_path: "/published/chat.public",
            protocol: "openai",
            streaming: true
          }),
          buildBinding("binding-2", {
            endpoint_name: "Claude Messages",
            endpoint_alias: "claude.public",
            route_path: "/published/claude.public",
            protocol: "anthropic"
          })
        ],
        apiHref: "/workflows/workflow-1/api",
        publishHref: "/workflows/workflow-1/publish",
        logsHref: "/workflows/workflow-1/logs",
        monitorHref: "/workflows/workflow-1/monitor",
        sampleQueryScope: idleSampleQueryScope
      })
    );

    expect(html).toContain('data-component="workflow-studio-utility-frame"');
    expect(html).toContain('data-surface="api"');
    expect(html).toContain('data-component="workflow-api-directory"');
    expect(html).toContain('data-component="workflow-api-directory-group"');
    expect(html).toContain('href="#workflow-api-binding-1-base-url"');
    expect(html).toContain('href="#workflow-api-binding-2-protocol-diff"');
    expect(html).toContain("基础 URL");
    expect(html).toContain("鉴权");
    expect(html).toContain("Endpoint 入口");
    expect(html).toContain("最小请求示例");
    expect(html).toContain("协议差异");
    expect(html).toContain("Authorization: Bearer &lt;published-api-key&gt;");
    expect(html).toContain("anthropic-version: 2023-06-01");
    expect(html).toContain("model 字段继续使用已发布 alias chat.public");
    expect(html).toContain("/messages");
    expect(html).toContain('data-component="workflow-api-sample-form"');
    expect(html).toContain("运行本地 sample invocation");
  });

  it("keeps an honest empty state when only draft bindings exist", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowApiSurface, {
        workflowId: "workflow-1",
        bindings: [
          buildBinding("binding-draft", {
            lifecycle_status: "draft",
            protocol: "openai"
          })
        ],
        apiHref: "/workflows/workflow-1/api",
        publishHref: "/workflows/workflow-1/publish",
        logsHref: "/workflows/workflow-1/logs",
        monitorHref: "/workflows/workflow-1/monitor",
        sampleQueryScope: idleSampleQueryScope
      })
    );

    expect(html).toContain('data-component="workflow-api-empty-state"');
    expect(html).toContain('data-surface="api"');
    expect(html).toContain("draft / offline publish definition");
    expect(html).toContain("前往发布治理");
    expect(html).not.toContain('data-component="workflow-api-directory"');
  });

  it("fails closed for internal-auth bindings and surfaces a fresh sample receipt when present", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowApiSurface, {
        workflowId: "workflow-1",
        bindings: [
          buildBinding("binding-1", {
            endpoint_name: "Internal native endpoint",
            auth_mode: "internal"
          })
        ],
        apiHref: "/workflows/workflow-1/api",
        publishHref: "/workflows/workflow-1/publish",
        logsHref: "/workflows/workflow-1/logs",
        monitorHref: "/workflows/workflow-1/monitor",
        sampleQueryScope: {
          status: "error",
          bindingId: "binding-1",
          invocationId: "invocation-1",
          runId: "run-1",
          runStatus: "failed",
          message: "当前 binding 使用 internal auth；sample invocation 已 fail-closed。",
          requestSurface: "native.alias",
          cleanup: "clean"
        }
      })
    );

    expect(html).toContain('data-component="workflow-api-sample-blocked"');
    expect(html).toContain("internal auth");
    expect(html).not.toContain('data-component="workflow-api-sample-form"');
    expect(html).toContain('data-component="workflow-api-sample-result"');
    expect(html).toContain("/workflows/workflow-1/logs?publish_binding=binding-1&amp;publish_invocation=invocation-1&amp;run=run-1");
    expect(html).toContain("/workflows/workflow-1/monitor?publish_binding=binding-1&amp;publish_invocation=invocation-1&amp;run=run-1");
    expect(html).toContain("/runs/run-1");
  });
});
