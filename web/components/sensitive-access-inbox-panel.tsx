"use client";

import { useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  bulkDecideSensitiveAccessApprovalTickets,
  bulkRetrySensitiveAccessNotificationDispatches
} from "@/app/actions/sensitive-access";
import { OperatorRecommendedNextStepCard } from "@/components/operator-recommended-next-step-card";
import {
  SensitiveAccessBulkGovernanceCard,
  getSensitiveAccessBulkActionConfirmationMessage,
  getSensitiveAccessBulkActionLabel
} from "@/components/sensitive-access-bulk-governance-card";
import { SensitiveAccessInboxEntryCard } from "@/components/sensitive-access-inbox-entry-card";
import {
  DEFAULT_OPERATOR_ID,
  type SensitiveAccessMessageTone,
  isPendingWaitingTicket,
  pickRetriableNotification
} from "@/components/sensitive-access-inbox-panel-helpers";
import type { CallbackWaitingAutomationCheck } from "@/lib/get-system-overview";
import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import type {
  NotificationChannelCapabilityItem,
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult,
  SensitiveAccessInboxEntry
} from "@/lib/get-sensitive-access";
import type { OperatorRecommendedNextStep } from "@/lib/operator-follow-up-presenters";
import { resolveSensitiveAccessInboxEntryActionScope } from "@/lib/sensitive-access-inbox-entry-scope";

type SensitiveAccessInboxPanelProps = {
  entries: SensitiveAccessInboxEntry[];
  channels?: NotificationChannelCapabilityItem[];
  callbackWaitingAutomation?: CallbackWaitingAutomationCheck | null;
  recommendedNextStep?: OperatorRecommendedNextStep | null;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function SensitiveAccessInboxPanel({
  entries,
  channels = [],
  callbackWaitingAutomation,
  recommendedNextStep = null,
  sandboxReadiness = null
}: SensitiveAccessInboxPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = (() => {
    const search = searchParams?.toString();
    return search ? `${pathname}?${search}` : pathname;
  })();
  const [bulkOperator, setBulkOperator] = useState(DEFAULT_OPERATOR_ID);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkMessageTone, setBulkMessageTone] = useState<SensitiveAccessMessageTone>("idle");
  const [lastBulkResult, setLastBulkResult] = useState<SensitiveAccessBulkActionResult | null>(
    null
  );
  const [isBulkMutating, startBulkMutatingTransition] = useTransition();

  if (entries.length === 0) {
    return (
      <article className="diagnostic-panel panel-span">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2>Sensitive access approval inbox</h2>
          </div>
          <p className="section-copy">
            当前筛选条件下没有需要处理的审批票据；后续命中敏感访问阻断时，这里会成为
            operator 的统一入口。
          </p>
        </div>
        <p className="empty-state">暂无待显示的审批票据。</p>
      </article>
    );
  }

  const decisionTicketIds = entries
    .filter((entry) => isPendingWaitingTicket(entry))
    .map((entry) => {
      const scope = resolveSensitiveAccessInboxEntryActionScope(entry);
      return {
        ticketId: entry.ticket.id,
        runId: scope.runId,
        nodeRunId: scope.nodeRunId
      };
    });
  const retryDispatchIds = entries.flatMap((entry) => {
    const notification = pickRetriableNotification(entry);
    const scope = resolveSensitiveAccessInboxEntryActionScope(entry);
    return notification
      ? [
          {
            dispatchId: notification.id,
            approvalTicketId: entry.ticket.id,
            runId: scope.runId,
            nodeRunId: scope.nodeRunId
          }
        ]
      : [];
  });

  const handleBulkAction = (action: SensitiveAccessBulkAction) => {
    const candidateIds = action === "retry" ? retryDispatchIds : decisionTicketIds;
    if (candidateIds.length === 0) {
      return;
    }

    if (action !== "retry" && bulkOperator.trim().length === 0) {
      setBulkMessage("请输入 operator 标识后再执行批量审批。");
      setBulkMessageTone("error");
      return;
    }

    if (
      !window.confirm(
        getSensitiveAccessBulkActionConfirmationMessage(action, candidateIds.length, entries.length)
      )
    ) {
      return;
    }

    const actionLabel = getSensitiveAccessBulkActionLabel(action);
    startBulkMutatingTransition(async () => {
      setBulkMessage(`正在${actionLabel}...`);
      setBulkMessageTone("idle");

      const result =
        action === "retry"
          ? await bulkRetrySensitiveAccessNotificationDispatches({
              dispatches: retryDispatchIds
            })
          : await bulkDecideSensitiveAccessApprovalTickets({
              tickets: decisionTicketIds,
              status: action,
              approvedBy: bulkOperator.trim()
            });

      setLastBulkResult(result);
      setBulkMessage(result.message);
      setBulkMessageTone(
        result.status === "error" ? "error" : result.updatedCount > 0 ? "success" : "idle"
      );
    });
  };

  return (
    <article className="diagnostic-panel panel-span">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Inbox</p>
          <h2>Sensitive access approval inbox</h2>
        </div>
        <p className="section-copy">
          这里把 `ApprovalTicket / NotificationDispatch` 事实层接到真实 operator UI；审批完成后，
          可直接回到 run 诊断或 publish 治理继续排障。
        </p>
      </div>

      {recommendedNextStep ? (
        <OperatorRecommendedNextStepCard recommendedNextStep={recommendedNextStep} />
      ) : null}

      <SensitiveAccessBulkGovernanceCard
        inScopeCount={entries.length}
        decisionCandidateCount={decisionTicketIds.length}
        retryCandidateCount={retryDispatchIds.length}
        operatorValue={bulkOperator}
        onOperatorChange={setBulkOperator}
        isMutating={isBulkMutating}
        lastResult={lastBulkResult}
        message={bulkMessage}
        messageTone={bulkMessageTone}
        onAction={handleBulkAction}
      />

      <div className="activity-list">
        {entries.map((entry) => (
          <SensitiveAccessInboxEntryCard
            callbackWaitingAutomation={callbackWaitingAutomation}
            currentHref={currentHref}
            entry={entry}
            key={entry.ticket.id}
            notificationChannels={channels}
            sandboxReadiness={sandboxReadiness}
          />
        ))}
      </div>
    </article>
  );
}
