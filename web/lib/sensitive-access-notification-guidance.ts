import type { NotificationChannelCapabilityItem } from "@/lib/get-sensitive-access";

type RetryGuidanceNotification = {
  channel?: string | null;
  target?: string | null;
};

export type SensitiveAccessNotificationRetryGuidance = {
  headline: string;
  summary: string | null;
  targetHint: string;
  targetExample: string;
  warning: string | null;
  placeholder: string;
  chips: string[];
  configFacts: NotificationChannelCapabilityItem["config_facts"];
};

const TARGET_KIND_LABELS: Record<NotificationChannelCapabilityItem["target_kind"], string> = {
  in_app: "站内 inbox",
  http_url: "Webhook URL",
  email_list: "邮箱列表"
};

function normalizeText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function pickImportantConfigFacts(
  capability: NotificationChannelCapabilityItem
): NotificationChannelCapabilityItem["config_facts"] {
  const selected: NotificationChannelCapabilityItem["config_facts"] = [];
  const selectedKeys = new Set<string>();

  const tryPush = (fact?: NotificationChannelCapabilityItem["config_facts"][number]) => {
    if (!fact || selectedKeys.has(fact.key)) {
      return;
    }
    selected.push(fact);
    selectedKeys.add(fact.key);
  };

  ["target_contract", "default_target", "channel_scope"].forEach((key) => {
    tryPush(capability.config_facts.find((fact) => fact.key === key));
  });

  capability.config_facts
    .filter((fact) => fact.status === "missing")
    .forEach((fact) => tryPush(fact));

  return selected.slice(0, 3);
}

export function resolveSensitiveAccessNotificationChannelCapability(
  channels?: NotificationChannelCapabilityItem[] | null,
  channel?: string | null
): NotificationChannelCapabilityItem | null {
  const normalizedChannel = normalizeText(channel);
  if (!normalizedChannel || !channels?.length) {
    return null;
  }

  return channels.find((item) => item.channel === normalizedChannel) ?? null;
}

export function buildSensitiveAccessNotificationRetryGuidance({
  notification,
  channels
}: {
  notification: RetryGuidanceNotification;
  channels?: NotificationChannelCapabilityItem[] | null;
}): SensitiveAccessNotificationRetryGuidance | null {
  const capability = resolveSensitiveAccessNotificationChannelCapability(
    channels,
    notification.channel
  );
  if (!capability) {
    return null;
  }

  const currentTarget = normalizeText(notification.target);
  const chips = [
    capability.health_status === "ready" ? "ready" : "degraded",
    capability.delivery_mode,
    `target ${TARGET_KIND_LABELS[capability.target_kind]}`,
    capability.configured ? "configured" : "not configured"
  ];

  if (!currentTarget) {
    chips.push("dispatch target missing");
  }
  if (capability.dispatch_summary.failed_count > 0) {
    chips.push(`failed ${capability.dispatch_summary.failed_count}`);
  }
  if (capability.dispatch_summary.pending_count > 0) {
    chips.push(`pending ${capability.dispatch_summary.pending_count}`);
  }

  const warningParts: string[] = [];
  if (!currentTarget) {
    warningParts.push("当前 dispatch 没有可复用 target；不要直接空值重试。");
  }
  if (!capability.configured || capability.health_status !== "ready") {
    warningParts.push(capability.health_reason);
  }

  return {
    headline: currentTarget
      ? capability.health_status === "ready"
        ? `当前 ${capability.channel} 重试会沿用最近一次通知 target；如需改派，可在下方直接覆盖。`
        : `当前 ${capability.channel} channel 处于 degraded；重试会沿用最近 target，但建议先核对 channel 配置与最近错误。`
      : `当前 ${capability.channel} dispatch 没有可复用 target；重试前请先填写符合 contract 的通知目标。`,
    summary: capability.summary,
    targetHint: capability.target_hint,
    targetExample: capability.target_example,
    warning: warningParts.length > 0 ? warningParts.join(" ") : null,
    placeholder: currentTarget
      ? "输入新的通知目标；留空则沿用当前目标"
      : `输入新的通知目标；例如 ${capability.target_example}`,
    chips,
    configFacts: pickImportantConfigFacts(capability)
  };
}
