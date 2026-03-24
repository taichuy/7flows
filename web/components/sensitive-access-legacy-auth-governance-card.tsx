import Link from "next/link";

import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/workflow-publish-types";
import { buildAuthorFacingWorkflowDetailLinkSurface } from "@/lib/workbench-entry-surfaces";

type SensitiveAccessLegacyAuthGovernanceCardProps = {
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
};

export function SensitiveAccessLegacyAuthGovernanceCard({
  snapshot
}: SensitiveAccessLegacyAuthGovernanceCardProps) {
  if (!snapshot || snapshot.binding_count <= 0) {
    return null;
  }

  return (
    <article className="diagnostic-panel panel-span">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workflow handoff</p>
          <h2>Legacy publish auth checklist 直接跟到 operator backlog</h2>
        </div>
        <p className="section-copy">
          sensitive-access inbox 不再只保留 approval / callback 事实；当前 slice 命中的
          workflow 级 legacy publish auth artifact 也在这里复用，避免 operator 再回 publish
          activity 或 workflow detail 重新拼 draft cleanup / published blocker 上下文。
        </p>
      </div>

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Affected workflows</span>
          <strong>{snapshot.workflow_count}</strong>
        </article>
        <article className="summary-card">
          <span>Draft cleanup</span>
          <strong>{snapshot.summary.draft_candidate_count}</strong>
        </article>
        <article className="summary-card">
          <span>Published blockers</span>
          <strong>{snapshot.summary.published_blocker_count}</strong>
        </article>
        <article className="summary-card">
          <span>Offline inventory</span>
          <strong>{snapshot.summary.offline_inventory_count}</strong>
        </article>
      </div>

      {snapshot.checklist.length > 0 ? (
        <div className="publish-key-list">
          <div>
            <p className="entry-card-title">Operator checklist</p>
            <p className="section-copy entry-copy">
              先处理 draft cleanup，再推进 published replacement，最后把只剩 offline inventory
              的历史条目保留给交接与审计；当前 inbox slice、publish activity export 和 run
              diagnostics 继续共享同一份 workflow handoff。
            </p>
          </div>

          {snapshot.checklist.map((item) => (
            <article className="payload-card compact-card" key={item.key}>
              <div className="payload-card-header">
                <span className="status-meta">{item.tone_label}</span>
                <span className="event-chip">{item.count} items</span>
              </div>
              <p className="binding-meta">{item.title}</p>
              <p className="section-copy entry-copy">{item.detail}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="publish-key-list">
        <div>
          <p className="entry-card-title">Workflow follow-up</p>
          <p className="section-copy entry-copy">
            当前筛选切片命中的 workflow 会保留各自 backlog 计数；处理完 inbox 当前票据后，可继续沿同一份 handoff
            回到 workflow detail 收口 legacy binding。
          </p>
        </div>

        {snapshot.workflows.map((workflow) => {
          const workflowDetailLink = buildAuthorFacingWorkflowDetailLinkSurface({
            workflowId: workflow.workflow_id,
            variant: "editor"
          });

          return (
            <article className="payload-card compact-card" key={workflow.workflow_id}>
              <div className="payload-card-header">
                <span className="status-meta">{workflow.binding_count} legacy bindings</span>
                <Link className="event-chip inbox-filter-link" href={workflowDetailLink.href}>
                  {workflowDetailLink.label}
                </Link>
              </div>
              <p className="binding-meta">{workflow.workflow_name}</p>
              <p className="section-copy entry-copy">
                draft cleanup {workflow.draft_candidate_count} 条，published blocker{" "}
                {workflow.published_blocker_count} 条，offline inventory{" "}
                {workflow.offline_inventory_count} 条。
              </p>
            </article>
          );
        })}
      </div>
    </article>
  );
}
