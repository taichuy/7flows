import Link from "next/link";

import type { WorkflowListItem } from "@/lib/get-workflows";

type WorkflowLibraryMissingToolGovernanceCardProps = {
  workflows: WorkflowListItem[];
  workflowDetailHrefsById: Record<string, string>;
  workflowLibraryFilterHref: string;
};

type MissingToolWorkflowEntry = {
  workflow: WorkflowListItem;
  missingToolIds: string[];
};

export function WorkflowLibraryMissingToolGovernanceCard({
  workflows,
  workflowDetailHrefsById,
  workflowLibraryFilterHref,
}: WorkflowLibraryMissingToolGovernanceCardProps) {
  const entries = workflows
    .map<MissingToolWorkflowEntry>((workflow) => ({
      workflow,
      missingToolIds: workflow.tool_governance?.missing_tool_ids ?? [],
    }))
    .filter((entry) => entry.missingToolIds.length > 0);

  if (entries.length === 0) {
    return null;
  }

  const totalMissingBindingCount = entries.reduce(
    (count, entry) => count + entry.missingToolIds.length,
    0,
  );
  const uniqueMissingToolIds = Array.from(
    new Set(entries.flatMap((entry) => entry.missingToolIds)),
  );
  const primaryEntry = entries[0];
  const remainingWorkflowCount = Math.max(entries.length - 1, 0);

  return (
    <article className="payload-card compact-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Missing tool governance</p>
          <h3>跨 workflow catalog gap handoff</h3>
        </div>
        <p className="section-copy">
          workflow detail 已能按单个 workflow fail-close 缺失 tool binding；workflow
          library 继续把当前范围里的 catalog gap 汇成共享 handoff，避免作者和 AI 只看到
          missing-tool 计数，却还得逐个打开 detail 才知道先处理谁。
        </p>
      </div>

      <div className="summary-strip compact-strip">
        <article className="summary-card">
          <span>Affected workflows</span>
          <strong>{entries.length}</strong>
        </article>
        <article className="summary-card">
          <span>Missing bindings</span>
          <strong>{totalMissingBindingCount}</strong>
        </article>
        <article className="summary-card">
          <span>Catalog gaps</span>
          <strong>{uniqueMissingToolIds.length}</strong>
        </article>
      </div>

      <div className="publish-key-list">
        <div>
          <p className="entry-card-title">Primary follow-up</p>
          <p className="section-copy entry-copy">
            先处理当前范围里最先暴露出来的 catalog gap，再沿同一份 workflow handoff
            继续收口其余 missing-tool workflow。
          </p>
        </div>

        <article className="payload-card compact-card">
          <div className="payload-card-header">
            <span className="status-meta">
              {primaryEntry.missingToolIds.length} missing binding
              {primaryEntry.missingToolIds.length === 1 ? "" : "s"}
            </span>
            {workflowDetailHrefsById[primaryEntry.workflow.id] ? (
              <Link
                className="event-chip inbox-filter-link"
                href={workflowDetailHrefsById[primaryEntry.workflow.id]}
              >
                回到 workflow 编辑器
              </Link>
            ) : null}
          </div>
          <p className="binding-meta">{primaryEntry.workflow.name}</p>
          <p className="section-copy entry-copy">
            {buildPrimaryFollowUpDetail(primaryEntry, remainingWorkflowCount)}
          </p>
          <div className="event-type-strip">
            {renderMissingToolChips(primaryEntry.missingToolIds)}
          </div>
        </article>
      </div>

      <div className="publish-key-list">
        <div>
          <p className="entry-card-title">Workflow handoff</p>
          <p className="section-copy entry-copy">
            每个条目都保留 workflow 级 missing-tool 事实与 scoped entry，方便作者、AI
            和 operator 在同一页直接继续 follow-up。
          </p>
        </div>

        {entries.map((entry) => {
          const workflowHref = workflowDetailHrefsById[entry.workflow.id] ?? null;

          return (
            <article className="payload-card compact-card" key={entry.workflow.id}>
              <div className="payload-card-header">
                <span className="status-meta">
                  {entry.missingToolIds.length} missing binding
                  {entry.missingToolIds.length === 1 ? "" : "s"}
                </span>
                {workflowHref ? (
                  <Link className="event-chip inbox-filter-link" href={workflowHref}>
                    回到 workflow 编辑器
                  </Link>
                ) : null}
              </div>
              <p className="binding-meta">{entry.workflow.name}</p>
              <p className="section-copy entry-copy">
                {buildWorkflowHandoffDetail(entry)}
              </p>
              <div className="event-type-strip">
                {renderMissingToolChips(entry.missingToolIds)}
              </div>
            </article>
          );
        })}
      </div>

      <div className="binding-actions">
        <div>
          <p className="entry-card-title">Scope to blockers</p>
          <p className="section-copy entry-copy">
            回到只含 missing-tool workflow 的列表范围，继续按 catalog gap 逐个补齐 binding。
          </p>
        </div>
        <Link className="activity-link" href={workflowLibraryFilterHref}>
          只看 missing-tool workflow
        </Link>
      </div>
    </article>
  );
}

function buildPrimaryFollowUpDetail(
  entry: MissingToolWorkflowEntry,
  remainingWorkflowCount: number,
) {
  const missingToolCopy = formatMissingToolIds(entry.missingToolIds);

  if (remainingWorkflowCount > 0) {
    return (
      `当前 workflow 仍引用目录里不存在的 tool：${missingToolCopy}；` +
      `先回 editor 补齐 binding，再继续排查剩余 ${remainingWorkflowCount} 个 workflow。`
    );
  }

  return (
    `当前 workflow 仍引用目录里不存在的 tool：${missingToolCopy}；` +
    "补齐 binding 后即可清空当前范围里的 missing-tool backlog。"
  );
}

function buildWorkflowHandoffDetail(entry: MissingToolWorkflowEntry) {
  const governedToolCount = entry.workflow.tool_governance?.governed_tool_count ?? 0;

  return (
    `${entry.workflow.version} · ${entry.workflow.status} · ${entry.workflow.node_count} nodes · ` +
    `${governedToolCount} governed tools。 当前仍缺少 ${entry.missingToolIds.length} 个 catalog tool binding：` +
    `${formatMissingToolIds(entry.missingToolIds)}。`
  );
}

function formatMissingToolIds(missingToolIds: string[]) {
  const uniqueMissingToolIds = Array.from(new Set(missingToolIds));
  if (uniqueMissingToolIds.length <= 3) {
    return uniqueMissingToolIds.join("、");
  }

  return `${uniqueMissingToolIds.slice(0, 3).join("、")} 等 ${uniqueMissingToolIds.length} 个`;
}

function renderMissingToolChips(missingToolIds: string[]) {
  return Array.from(new Set(missingToolIds)).slice(0, 4).map((toolId) => (
    <span className="event-chip" key={toolId}>
      {toolId}
    </span>
  ));
}
