import Link from "next/link";

import { WorkflowLibraryLegacyAuthGovernanceExportActions } from "@/components/workflow-library-legacy-auth-governance-export-actions";
import type { WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot } from "@/lib/get-workflow-publish";
import { shouldRenderWorkflowLibraryLegacyAuthGovernance } from "@/lib/workflow-library-legacy-auth-governance";

type WorkflowLibraryLegacyAuthGovernanceCardProps = {
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null;
  workflowDetailHrefsById: Record<string, string>;
  workflowLibraryFilterHref: string;
};

export function WorkflowLibraryLegacyAuthGovernanceCard({
  snapshot,
  workflowDetailHrefsById,
  workflowLibraryFilterHref,
}: WorkflowLibraryLegacyAuthGovernanceCardProps) {
  if (!shouldRenderWorkflowLibraryLegacyAuthGovernance(snapshot) || snapshot === null) {
    return null;
  }

  return (
    <article className="payload-card compact-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Legacy publish auth artifact</p>
          <h3>跨 workflow operator checklist 与 governance export</h3>
        </div>
        <p className="section-copy">
          workflow detail 已能按单个 workflow 清理 legacy auth；workflow library 继续把跨版本 backlog 汇总成统一 checklist 与可下载 artifact，方便 operator、handoff 文档和审计复用同一份事实。
        </p>
      </div>

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Affected workflows</span>
          <strong>{snapshot.workflow_count}</strong>
        </article>
        <article className="summary-card">
          <span>Draft candidates</span>
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

      <div className="publish-key-list">
        <div>
          <p className="entry-card-title">Operator checklist</p>
          <p className="section-copy entry-copy">
            先处理 draft cleanup，再推进 published replacement，最后把仅剩 offline inventory 的条目保留给交接和审计，不再让跨版本 backlog 只停在某个 detail 页里。
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

      <div className="publish-key-list">
        <div>
          <p className="entry-card-title">Workflow handoff</p>
          <p className="section-copy entry-copy">
            下面保留每个 workflow 的 backlog 计数，进入 detail 后可继续沿同一条 publish auth 治理链路收口历史 binding。
          </p>
        </div>

        {snapshot.workflows.map((workflow) => {
          const workflowHref = workflowDetailHrefsById[workflow.workflow_id] ?? null;

          return (
            <article className="payload-card compact-card" key={workflow.workflow_id}>
              <div className="payload-card-header">
                <span className="status-meta">{workflow.binding_count} legacy bindings</span>
                {workflowHref ? (
                  <Link className="event-chip inbox-filter-link" href={workflowHref}>
                    打开 workflow detail
                  </Link>
                ) : null}
              </div>
              <p className="binding-meta">{workflow.workflow_name}</p>
              <p className="section-copy entry-copy">
                draft cleanup {workflow.draft_candidate_count} 条，published blocker {workflow.published_blocker_count} 条，offline inventory {workflow.offline_inventory_count} 条。
              </p>
            </article>
          );
        })}
      </div>

      <div className="binding-actions">
        <div>
          <p className="entry-card-title">Governance export</p>
          <p className="section-copy entry-copy">
            导出当前 workflow library 的 legacy publish auth 治理清单，供浏览器外的 operator handoff、审计或后续自动化继续复用。
          </p>
        </div>
        <Link className="activity-link" href={workflowLibraryFilterHref}>
          只看 blocker workflow
        </Link>
        <WorkflowLibraryLegacyAuthGovernanceExportActions snapshot={snapshot} />
      </div>
    </article>
  );
}
