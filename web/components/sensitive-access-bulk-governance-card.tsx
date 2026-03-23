"use client";

import Link from "next/link";
import React from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { OperatorRunSampleCardList } from "@/components/operator-run-sample-card-list";
import type { CallbackWaitingSummaryProps } from "@/lib/callback-waiting-summary-props";
import type {
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult
} from "@/lib/get-sensitive-access";
import { buildOperatorFollowUpSurfaceCopy } from "@/lib/operator-follow-up-presenters";
import {
  buildSensitiveAccessBulkRecommendedNextStep,
  buildSensitiveAccessBulkResultNarrative,
  buildSensitiveAccessBulkRunSampleCards
} from "@/lib/sensitive-access-bulk-result-presenters";
import {
  buildRunDetailHrefFromWorkspaceStarterViewState,
  readWorkspaceStarterLibraryViewState
} from "@/lib/workspace-starter-governance-query";

type SensitiveAccessBulkGovernanceCardProps = {
  inScopeCount: number;
  decisionCandidateCount: number;
  retryCandidateCount: number;
  operatorValue: string;
  onOperatorChange: (value: string) => void;
  isMutating: boolean;
  lastResult: SensitiveAccessBulkActionResult | null;
  message: string | null;
  messageTone: "idle" | "success" | "error";
  onAction: (action: SensitiveAccessBulkAction) => void;
};

const ACTIONS: SensitiveAccessBulkAction[] = ["approved", "rejected", "retry"];

type SensitiveAccessBulkScopeSummary = Pick<
  SensitiveAccessBulkGovernanceCardProps,
  "inScopeCount" | "decisionCandidateCount" | "retryCandidateCount"
>;

export function SensitiveAccessBulkGovernanceCard({
  inScopeCount,
  decisionCandidateCount,
  retryCandidateCount,
  operatorValue,
  onOperatorChange,
  isMutating,
  lastResult,
  message,
  messageTone,
  onAction
}: SensitiveAccessBulkGovernanceCardProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = React.useMemo(() => {
    const search = searchParams?.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);
  const workspaceStarterViewState = React.useMemo(
    () => readWorkspaceStarterLibraryViewState(new URLSearchParams(searchParams?.toString())),
    [searchParams]
  );
  const resolveRunDetailHref = React.useCallback(
    (candidateRunId: string) =>
      buildRunDetailHrefFromWorkspaceStarterViewState(
        candidateRunId,
        workspaceStarterViewState
      ),
    [workspaceStarterViewState]
  );
  const operatorSurfaceCopy = buildOperatorFollowUpSurfaceCopy();
  const recommendedNextStep = lastResult
    ? buildSensitiveAccessBulkRecommendedNextStep(lastResult, { currentHref })
    : null;
  const narrativeItems = lastResult ? buildSensitiveAccessBulkResultNarrative(lastResult) : [];
  const sampledRunCards = lastResult ? buildSensitiveAccessBulkRunSampleCards(lastResult) : [];
  const callbackWaitingSummaryProps: CallbackWaitingSummaryProps = React.useMemo(
    () => ({ currentHref }),
    [currentHref]
  );
  const hasStructuredResultSections =
    Boolean(recommendedNextStep) || narrativeItems.length > 0 || sampledRunCards.length > 0;
  const shouldShowMessage =
    Boolean(message) &&
    (isMutating || !lastResult || lastResult.status === "error" || !hasStructuredResultSections);

  return (
    <div className="binding-card compact-card">
      <div className="binding-card-header">
        <div>
          <p className="entry-card-title">Bulk governance</p>
          <p className="binding-meta">
            当前批量动作默认作用于当前筛选结果；审批仅覆盖 `pending + waiting` 票据，通知重试只处理每条票据最新且未投递成功的 dispatch。
          </p>
        </div>
        <span className="health-pill">{inScopeCount} in scope</span>
      </div>

      <div className="starter-tag-row">
        <span className="event-chip">
          {getSensitiveAccessBulkCandidateCountLabel(
            "decision",
            decisionCandidateCount,
            inScopeCount
          )}
        </span>
        <span className="event-chip">
          {getSensitiveAccessBulkCandidateCountLabel("retry", retryCandidateCount, inScopeCount)}
        </span>
      </div>
      <p className="section-copy entry-copy">
        {getSensitiveAccessBulkScopeSummary({
          inScopeCount,
          decisionCandidateCount,
          retryCandidateCount
        })}
      </p>

      <label className="status-meta" htmlFor="bulk-sensitive-access-operator">
        Operator
      </label>
      <input
        className="inbox-operator-input"
        id="bulk-sensitive-access-operator"
        type="text"
        value={operatorValue}
        onChange={(event) => onOperatorChange(event.target.value)}
        placeholder="输入批量审批使用的 operator 标识"
      />

      {lastResult ? (
        <>
          <div className="starter-tag-row">
            <span className="health-pill">last run: {getSensitiveAccessBulkActionLabel(lastResult.action)}</span>
            <span className="event-chip">updated {lastResult.updatedCount}</span>
            <span className="event-chip">skipped {lastResult.skippedCount}</span>
            {lastResult.skippedReasonSummary.length > 0
              ? lastResult.skippedReasonSummary.map((item) => (
                  <span className="event-chip" key={`${item.reason}-${item.count}`}>
                    {getSensitiveAccessBulkSkipReasonLabel(item.reason)} {item.count}
                  </span>
                ))
              : null}
          </div>

          {lastResult.affectedRunCount > 0 ? (
            <div className="starter-tag-row">
              <span className="event-chip">affected runs {lastResult.affectedRunCount}</span>
              <span className="event-chip">sampled {lastResult.sampledRunCount}</span>
              {lastResult.waitingRunCount > 0 ? (
                <span className="event-chip">still waiting {lastResult.waitingRunCount}</span>
              ) : null}
              {lastResult.runningRunCount > 0 ? (
                <span className="event-chip">running {lastResult.runningRunCount}</span>
              ) : null}
              {lastResult.succeededRunCount > 0 ? (
                <span className="event-chip">succeeded {lastResult.succeededRunCount}</span>
              ) : null}
              {lastResult.failedRunCount > 0 ? (
                <span className="event-chip">failed {lastResult.failedRunCount}</span>
              ) : null}
              {lastResult.unknownRunCount > 0 ? (
                <span className="event-chip">unknown {lastResult.unknownRunCount}</span>
              ) : null}
            </div>
          ) : null}

          {lastResult.blockerSampleCount > 0 ? (
            <div className="starter-tag-row">
              <span className="event-chip">
                blocker samples {lastResult.blockerSampleCount}
              </span>
              {lastResult.blockerChangedCount > 0 ? (
                <span className="event-chip">changed {lastResult.blockerChangedCount}</span>
              ) : null}
              {lastResult.blockerClearedCount > 0 ? (
                <span className="event-chip">cleared {lastResult.blockerClearedCount}</span>
              ) : null}
              {lastResult.blockerFullyClearedCount > 0 ? (
                <span className="event-chip">
                  fully cleared {lastResult.blockerFullyClearedCount}
                </span>
              ) : null}
              {lastResult.blockerStillBlockedCount > 0 ? (
                <span className="event-chip">
                  still blocked {lastResult.blockerStillBlockedCount}
                </span>
              ) : null}
            </div>
          ) : null}

          {recommendedNextStep ? (
            <div className="binding-section">
              <div className="starter-tag-row">
                <span className="status-meta">{operatorSurfaceCopy.recommendedNextStepTitle}</span>
                <span className="event-chip">{recommendedNextStep.label}</span>
                {recommendedNextStep.href && recommendedNextStep.href_label ? (
                  <Link className="event-chip inbox-filter-link" href={recommendedNextStep.href}>
                    {recommendedNextStep.href_label}
                  </Link>
                ) : null}
              </div>
              <p className="section-copy entry-copy">{recommendedNextStep.detail}</p>
            </div>
          ) : null}

          {narrativeItems.length > 0 ? (
            <div className="binding-section">
              {narrativeItems.map((item) => (
                <p className="binding-meta" key={`${item.label}-${item.text}`}>
                  <strong>{item.label}：</strong>
                  {item.text}
                </p>
              ))}
            </div>
          ) : null}

          {sampledRunCards.length > 0 ? (
            <div className="binding-section">
              <p className="section-copy entry-copy">
                Sampled run 卡片现在会一起复用 runtime 返回的 compact snapshot，既保留 execution focus evidence，也保留 callback waiting / scheduled resume 的 follow-up 事实，避免批量治理后还要回到 run detail 二次排障。
              </p>
              <OperatorRunSampleCardList
                cards={sampledRunCards}
                callbackWaitingSummaryProps={callbackWaitingSummaryProps}
                currentHref={currentHref}
                resolveRunDetailHref={resolveRunDetailHref}
                skillTraceDescription="批量治理结果现在也会复用 compact snapshot 里的 skill trace，方便直接确认受影响 run 的 focus node 注入来源。"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {shouldShowMessage ? <p className={`sync-message ${messageTone}`}>{message}</p> : null}

      <div className="binding-actions">
        {ACTIONS.map((action) => {
          const candidateCount = action === "retry" ? retryCandidateCount : decisionCandidateCount;
          const requiresOperator = action === "approved" || action === "rejected";
          return (
            <button
              key={action}
              className={action === "approved" ? "sync-button" : "sync-button secondary"}
              type="button"
              onClick={() => onAction(action)}
              disabled={
                candidateCount === 0 ||
                isMutating ||
                (requiresOperator && operatorValue.trim().length === 0)
              }
            >
              {isMutating ? "处理中..." : getSensitiveAccessBulkActionButtonLabel(action)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function getSensitiveAccessBulkActionLabel(action: SensitiveAccessBulkAction) {
  return {
    approved: "批量批准",
    rejected: "批量拒绝",
    retry: "批量重试通知"
  }[action];
}

export function getSensitiveAccessBulkActionButtonLabel(action: SensitiveAccessBulkAction) {
  return {
    approved: "批量批准当前结果",
    rejected: "批量拒绝当前结果",
    retry: "批量重试最新通知"
  }[action];
}

export function getSensitiveAccessBulkActionConfirmationMessage(
  action: SensitiveAccessBulkAction,
  count: number,
  inScopeCount: number
) {
  return {
    approved: `确认批量批准当前筛选范围内可执行的 ${count} / ${inScopeCount} 条 pending + waiting 票据吗？`,
    rejected: `确认批量拒绝当前筛选范围内可执行的 ${count} / ${inScopeCount} 条 pending + waiting 票据吗？`,
    retry:
      `确认批量重试当前筛选范围内可执行的 ${count} / ${inScopeCount} 条最新且仍未投递成功的通知吗？`
  }[action];
}

export function getSensitiveAccessBulkCandidateCountLabel(
  kind: "decision" | "retry",
  candidateCount: number,
  inScopeCount: number
) {
  if (kind === "decision") {
    return `approve/reject pending+waiting ${candidateCount} / ${inScopeCount}`;
  }

  return `retry latest pending/failed ${candidateCount} / ${inScopeCount}`;
}

export function getSensitiveAccessBulkScopeSummary({
  inScopeCount,
  decisionCandidateCount,
  retryCandidateCount
}: SensitiveAccessBulkScopeSummary) {
  return `当前筛选范围命中 ${inScopeCount} 条票据；其中 ${decisionCandidateCount} 条 pending + waiting 票据可执行 approve / reject，${retryCandidateCount} 条最新且仍未投递成功的通知可执行 retry。`;
}

export function getSensitiveAccessBulkSkipReasonLabel(reason: string) {
  return {
    not_found: "not found",
    not_pending: "not pending",
    not_waiting: "not waiting",
    not_latest: "not latest",
    already_delivered: "already delivered",
    invalid_state: "invalid state"
  }[reason] ?? reason;
}
