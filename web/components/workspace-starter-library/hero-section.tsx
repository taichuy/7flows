import { WorkbenchEntryLinks } from "@/components/workbench-entry-links";

import { buildWorkspaceStarterGovernanceHeroSurfaceCopy } from "@/lib/workbench-entry-surfaces";
import { getWorkflowBusinessTrack, WORKFLOW_BUSINESS_TRACKS } from "@/lib/workflow-business-tracks";

import type { TrackFilter } from "./shared";

type WorkspaceStarterHeroSectionProps = {
  activeTemplateCount: number;
  archivedTemplateCount: number;
  filteredTemplateCount: number;
  governedTemplateCount: number;
  missingToolTemplateCount: number;
  selectedTemplateName: string | null;
  strongIsolationTemplateCount: number;
  activeTrack: TrackFilter;
  createWorkflowHref: string;
};

export function WorkspaceStarterHeroSection({
  activeTemplateCount,
  archivedTemplateCount,
  filteredTemplateCount,
  governedTemplateCount,
  missingToolTemplateCount,
  selectedTemplateName,
  strongIsolationTemplateCount,
  activeTrack,
  createWorkflowHref
}: WorkspaceStarterHeroSectionProps) {
  const surfaceCopy = buildWorkspaceStarterGovernanceHeroSurfaceCopy({ createWorkflowHref });

  return (
    <section className="hero creation-hero">
      <div className="hero-copy">
        <p className="eyebrow">Workspace Starter Governance</p>
        <h1>把模板从“能保存”推进到“能治理”</h1>
        <p className="hero-text">{surfaceCopy.heroDescription}</p>
        <div className="pill-row">
          <span className="pill">{activeTemplateCount} active starters</span>
          <span className="pill">{archivedTemplateCount} archived starters</span>
          <span className="pill">{filteredTemplateCount} visible templates</span>
          <span className="pill">{governedTemplateCount} governed tool starters</span>
          <span className="pill">{strongIsolationTemplateCount} strong isolation starters</span>
          <span className="pill">{missingToolTemplateCount} catalog gap starters</span>
        </div>
        <div className="hero-actions">
          <WorkbenchEntryLinks {...surfaceCopy.heroLinks} />
        </div>
      </div>

      <div className="hero-panel">
        <div className="panel-label">Governance state</div>
        <div className="panel-value">{activeTemplateCount + archivedTemplateCount > 0 ? "Ready" : "Empty"}</div>
        <p className="panel-text">
          当前主线：<strong>P0 应用新建编排</strong>
        </p>
        <p className="panel-text">
          视图能力：<strong>列表 / 筛选 / 详情 / 批量治理 / 工具治理可见性</strong>
        </p>
        <p className="panel-text">
          当前选中：<strong>{selectedTemplateName ?? "暂无模板"}</strong>
        </p>
        <dl className="signal-list">
          <div>
            <dt>Templates</dt>
            <dd>{activeTemplateCount + archivedTemplateCount}</dd>
          </div>
          <div>
            <dt>Active</dt>
            <dd>{activeTemplateCount}</dd>
          </div>
          <div>
            <dt>Archived</dt>
            <dd>{archivedTemplateCount}</dd>
          </div>
          <div>
            <dt>Governed</dt>
            <dd>{governedTemplateCount}</dd>
          </div>
          <div>
            <dt>Isolation</dt>
            <dd>{strongIsolationTemplateCount}</dd>
          </div>
          <div>
            <dt>Missing tool</dt>
            <dd>{missingToolTemplateCount}</dd>
          </div>
          <div>
            <dt>Track</dt>
            <dd>{activeTrack === "all" ? `${WORKFLOW_BUSINESS_TRACKS.length} total` : getWorkflowBusinessTrack(activeTrack).priority}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
