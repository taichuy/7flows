import Link from "next/link";

import type { SensitiveAccessBlockingPayload } from "@/lib/sensitive-access";

type SensitiveAccessBlockedCardProps = {
  title: string;
  payload: SensitiveAccessBlockingPayload;
  clearHref?: string | null;
  summary?: string;
};

function formatDecisionLabel(payload: SensitiveAccessBlockingPayload) {
  if (payload.access_request.decision === "require_approval") {
    return "approval required";
  }
  if (payload.access_request.decision === "deny") {
    return "denied";
  }
  return payload.access_request.decision;
}

export function SensitiveAccessBlockedCard({
  title,
  payload,
  clearHref = null,
  summary
}: SensitiveAccessBlockedCardProps) {
  const runId = payload.access_request.run_id ?? payload.approval_ticket?.run_id ?? null;

  return (
    <article className="entry-card compact-card">
      <div className="payload-card-header">
        <div>
          <p className="entry-card-title">{title}</p>
          <p className="binding-meta">{payload.detail}</p>
        </div>
        {clearHref ? (
          <Link className="inline-link secondary" href={clearHref}>
            关闭详情
          </Link>
        ) : null}
      </div>

      <p className="section-copy entry-copy">
        {summary ??
          "当前入口已命中统一敏感访问控制；可先查看审批票据、通知投递和关联 run，再决定后续排障动作。"}
      </p>

      <div className="tool-badge-row">
        <span className="event-chip">{formatDecisionLabel(payload)}</span>
        <span className="event-chip">{payload.resource.sensitivity_level}</span>
        <span className="event-chip">{payload.access_request.action_type}</span>
        <span className="event-chip">{payload.resource.source}</span>
      </div>

      <dl className="compact-meta-list">
        <div>
          <dt>Resource</dt>
          <dd>{payload.resource.label}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>
            {payload.access_request.requester_type} · {payload.access_request.requester_id}
          </dd>
        </div>
        <div>
          <dt>Reason code</dt>
          <dd>{payload.access_request.reason_code ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>
            {runId ? (
              <Link className="inline-link" href={`/runs/${encodeURIComponent(runId)}`}>
                {runId}
              </Link>
            ) : (
              "n/a"
            )}
          </dd>
        </div>
        <div>
          <dt>Node run</dt>
          <dd>{payload.access_request.node_run_id ?? payload.approval_ticket?.node_run_id ?? "n/a"}</dd>
        </div>
        <div>
          <dt>Approval ticket</dt>
          <dd>
            {payload.approval_ticket
              ? `${payload.approval_ticket.status}${payload.approval_ticket.waiting_status ? ` · ${payload.approval_ticket.waiting_status}` : ""}`
              : "n/a"}
          </dd>
        </div>
      </dl>

      {payload.resource.description ? (
        <p className="section-copy entry-copy">resource: {payload.resource.description}</p>
      ) : null}
      {payload.access_request.purpose_text ? (
        <p className="section-copy entry-copy">purpose: {payload.access_request.purpose_text}</p>
      ) : null}

      {payload.notifications.length ? (
        <div className="tool-badge-row">
          {payload.notifications.map((item) => (
            <span className="event-chip" key={item.id}>
              {item.channel}:{item.status}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

