"use client";

import Link from "next/link";

import { OperatorFocusEvidenceCard } from "@/components/operator-focus-evidence-card";
import { SkillReferenceLoadList } from "@/components/skill-reference-load-list";
import type {
  SensitiveAccessBulkAction,
  SensitiveAccessBulkActionResult
} from "@/lib/get-sensitive-access";
import {
  buildSensitiveAccessBulkResultNarrative,
  buildSensitiveAccessBulkRunSampleCards
} from "@/lib/sensitive-access-bulk-result-presenters";

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
  const narrativeItems = lastResult ? buildSensitiveAccessBulkResultNarrative(lastResult) : [];
  const sampledRunCards = lastResult ? buildSensitiveAccessBulkRunSampleCards(lastResult) : [];

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
        <span className="event-chip">approve/reject {decisionCandidateCount}</span>
        <span className="event-chip">retry latest {retryCandidateCount}</span>
      </div>

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
                Sampled run focus evidence 直接复用 runtime 返回的 compact snapshot，方便在批量治理结果里继续定位受影响 run 的当前执行焦点。
              </p>
              <div className="publish-cache-list">
                {sampledRunCards.map((sample) => (
                  <div className="payload-card compact-card" key={sample.runId}>
                    <div className="payload-card-header">
                      <span className="status-meta">Run {sample.shortRunId}</span>
                      <Link
                        className="event-chip inbox-filter-link"
                        href={`/runs/${encodeURIComponent(sample.runId)}`}
                      >
                        open run
                      </Link>
                    </div>
                    {sample.summary ? <p className="binding-meta">{sample.summary}</p> : null}
                    {sample.runStatus ||
                    sample.currentNodeId ||
                    sample.focusNodeLabel ||
                    sample.waitingReason ? (
                      <dl className="compact-meta-list">
                        <div>
                          <dt>Run status</dt>
                          <dd>{sample.runStatus ?? "n/a"}</dd>
                        </div>
                        <div>
                          <dt>Current node</dt>
                          <dd>{sample.currentNodeId ?? "n/a"}</dd>
                        </div>
                        <div>
                          <dt>Focus node</dt>
                          <dd>{sample.focusNodeLabel ?? "n/a"}</dd>
                        </div>
                        <div>
                          <dt>Waiting reason</dt>
                          <dd>{sample.waitingReason ?? "n/a"}</dd>
                        </div>
                      </dl>
                    ) : null}
                    {sample.artifactCount > 0 ||
                    sample.artifactRefCount > 0 ||
                    sample.toolCallCount > 0 ||
                    sample.rawRefCount > 0 ||
                    sample.skillReferenceCount > 0 ? (
                      <div className="tool-badge-row">
                        {sample.artifactCount > 0 ? (
                          <span className="event-chip">artifacts {sample.artifactCount}</span>
                        ) : null}
                        {sample.artifactRefCount > 0 ? (
                          <span className="event-chip">
                            artifact refs {sample.artifactRefCount}
                          </span>
                        ) : null}
                        {sample.toolCallCount > 0 ? (
                          <span className="event-chip">tool calls {sample.toolCallCount}</span>
                        ) : null}
                        {sample.rawRefCount > 0 ? (
                          <span className="event-chip">raw refs {sample.rawRefCount}</span>
                        ) : null}
                        {sample.skillReferenceCount > 0 ? (
                          <span className="event-chip">
                            skill refs {sample.skillReferenceCount}
                          </span>
                        ) : null}
                        {sample.skillReferencePhaseSummary ? (
                          <span className="event-chip">
                            phases {sample.skillReferencePhaseSummary}
                          </span>
                        ) : null}
                        {sample.skillReferenceSourceSummary ? (
                          <span className="event-chip">
                            sources {sample.skillReferenceSourceSummary}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <OperatorFocusEvidenceCard
                      artifactCount={sample.artifactCount}
                      artifactRefCount={sample.artifactRefCount}
                      artifactSummary={sample.focusArtifactSummary}
                      artifacts={sample.focusArtifacts}
                      toolCallCount={sample.toolCallCount}
                      toolCallSummaries={sample.focusToolCallSummaries}
                    />
                    <SkillReferenceLoadList
                      skillReferenceLoads={sample.focusSkillReferenceLoads}
                      title="Focused skill trace"
                      description="批量治理结果现在也会复用 compact snapshot 里的 skill trace，方便直接确认受影响 run 的 focus node 注入来源。"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {message ? <p className={`sync-message ${messageTone}`}>{message}</p> : null}

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
  count: number
) {
  return {
    approved: `确认批量批准当前筛选结果中的 ${count} 条票据吗？`,
    rejected: `确认批量拒绝当前筛选结果中的 ${count} 条票据吗？`,
    retry: `确认批量重试当前筛选结果中的 ${count} 条最新通知吗？`
  }[action];
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
