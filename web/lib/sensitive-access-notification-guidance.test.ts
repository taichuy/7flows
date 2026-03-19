import { describe, expect, it } from "vitest";

import type { NotificationChannelCapabilityItem } from "@/lib/get-sensitive-access";
import {
  buildSensitiveAccessNotificationRetryGuidance,
  resolveSensitiveAccessNotificationChannelCapability
} from "@/lib/sensitive-access-notification-guidance";

function createChannel(
  overrides: Partial<NotificationChannelCapabilityItem>
): NotificationChannelCapabilityItem {
  return {
    channel: "webhook",
    delivery_mode: "worker",
    target_kind: "http_url",
    configured: true,
    health_status: "ready",
    summary: "通过通用 HTTP POST 投递；target 必须是可达的 http(s) URL。",
    target_hint: "Webhook delivery requires the notification target to be an http(s) URL.",
    target_example: "https://ops.example/webhook",
    health_reason: "当前 channel contract 已就绪，暂无待排查的 dispatch 失败记录。",
    config_facts: [
      {
        key: "target_contract",
        label: "Target contract",
        status: "info",
        value: "Webhook delivery requires a notification target URL."
      },
      {
        key: "default_target",
        label: "Default target",
        status: "info",
        value: "No preset target; each request must provide notification_target."
      },
      {
        key: "channel_scope",
        label: "Channel scope",
        status: "info",
        value: "Per-request target; no shared adapter credential in current kernel."
      }
    ],
    dispatch_summary: {
      pending_count: 0,
      delivered_count: 2,
      failed_count: 0,
      latest_dispatch_at: null,
      latest_delivered_at: null,
      latest_failure_at: null,
      latest_failure_error: null,
      latest_failure_target: null
    },
    ...overrides
  };
}

describe("sensitive access notification retry guidance", () => {
  it("returns null when the channel capability is absent", () => {
    expect(resolveSensitiveAccessNotificationChannelCapability([], "webhook")).toBeNull();
    expect(
      buildSensitiveAccessNotificationRetryGuidance({
        notification: {
          channel: "webhook",
          target: "https://ops.example/webhook"
        },
        channels: []
      })
    ).toBeNull();
  });

  it("warns when the latest dispatch has no reusable target", () => {
    const channel = createChannel({
      configured: false,
      health_status: "degraded",
      health_reason: "当前 channel contract 已知，但关键配置缺失；新 dispatch 会在 preflight 直接失败。",
      config_facts: [
        {
          key: "target_contract",
          label: "Target contract",
          status: "info",
          value: "Webhook delivery requires a notification target URL."
        },
        {
          key: "default_target",
          label: "Default target",
          status: "info",
          value: "No preset target; each request must provide notification_target."
        },
        {
          key: "delivery_timeout",
          label: "Delivery timeout",
          status: "missing",
          value: "Worker timeout is missing"
        }
      ],
      dispatch_summary: {
        pending_count: 1,
        delivered_count: 0,
        failed_count: 2,
        latest_dispatch_at: null,
        latest_delivered_at: null,
        latest_failure_at: null,
        latest_failure_error: null,
        latest_failure_target: null
      }
    });

    const guidance = buildSensitiveAccessNotificationRetryGuidance({
      notification: {
        channel: "webhook",
        target: ""
      },
      channels: [channel]
    });

    expect(guidance).not.toBeNull();
    expect(guidance?.headline).toContain("没有可复用 target");
    expect(guidance?.placeholder).toContain("https://ops.example/webhook");
    expect(guidance?.warning).toContain("不要直接空值重试");
    expect(guidance?.warning).toContain("关键配置缺失");
    expect(guidance?.chips).toContain("dispatch target missing");
    expect(guidance?.chips).toContain("failed 2");
    expect(guidance?.configFacts.map((fact) => fact.key)).toContain("delivery_timeout");
  });

  it("keeps the existing target reuse guidance when the channel is healthy", () => {
    const channel = createChannel({
      channel: "slack",
      summary: "当前仅支持 Slack incoming webhook URL，不支持 channel 名称或 bot token 路由。",
      target_hint: "Slack delivery requires the notification target to be an incoming webhook URL.",
      target_example: "https://hooks.slack.com/services/T000/B000/XXXX"
    });

    const guidance = buildSensitiveAccessNotificationRetryGuidance({
      notification: {
        channel: "slack",
        target: "https://hooks.slack.com/services/T000/B000/XXXX"
      },
      channels: [channel]
    });

    expect(guidance).not.toBeNull();
    expect(guidance?.headline).toContain("沿用最近一次通知 target");
    expect(guidance?.placeholder).toBe("输入新的通知目标；留空则沿用当前目标");
    expect(guidance?.warning).toBeNull();
    expect(guidance?.chips).toContain("ready");
    expect(guidance?.chips).toContain("configured");
    expect(guidance?.chips).toContain("target Webhook URL");
  });
});
