"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { WorkflowStarterBrowser } from "@/components/workflow-starter-browser";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { getWorkflowBusinessTrack } from "@/lib/workflow-business-tracks";
import type { WorkspaceStarterTemplateItem } from "@/lib/get-workspace-starters";
import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  BUILTIN_WORKFLOW_STARTER_TEMPLATES,
  buildWorkflowStarterSourceLanes,
  buildWorkflowStarterTracks,
  combineWorkflowStarterTemplates,
  type WorkflowStarterTemplateId
} from "@/lib/workflow-starters";

type WorkflowCreateWizardProps = {
  catalogToolCount: number;
  preferredStarterId?: string;
  workflows: WorkflowListItem[];
  workspaceTemplates: WorkspaceStarterTemplateItem[];
};

const DEFAULT_STARTER_ID: WorkflowStarterTemplateId = "blank";

export function WorkflowCreateWizard({
  catalogToolCount,
  preferredStarterId,
  workflows,
  workspaceTemplates
}: WorkflowCreateWizardProps) {
  const router = useRouter();
  const starterTemplates = useMemo(
    () => combineWorkflowStarterTemplates(workspaceTemplates),
    [workspaceTemplates]
  );
  const sourceLanes = useMemo(
    () => buildWorkflowStarterSourceLanes(starterTemplates),
    [starterTemplates]
  );
  const starterTracks = useMemo(
    () => buildWorkflowStarterTracks(starterTemplates),
    [starterTemplates]
  );
  const defaultStarter =
    starterTemplates.find((starter) => starter.id === preferredStarterId) ??
    starterTemplates.find((starter) => starter.id === DEFAULT_STARTER_ID) ??
    starterTemplates[0] ??
    BUILTIN_WORKFLOW_STARTER_TEMPLATES[0];
  const [activeTrack, setActiveTrack] = useState(defaultStarter.businessTrack);
  const [selectedStarterId, setSelectedStarterId] =
    useState<WorkflowStarterTemplateId>(defaultStarter.id);
  const [workflowName, setWorkflowName] = useState(defaultStarter.defaultWorkflowName);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "success" | "error">("idle");
  const [isCreating, startCreateTransition] = useTransition();

  const selectedStarter = useMemo(
    () =>
      starterTemplates.find((starter) => starter.id === selectedStarterId) ??
      defaultStarter,
    [defaultStarter, selectedStarterId, starterTemplates]
  );
  const activeTrackMeta = useMemo(
    () => getWorkflowBusinessTrack(activeTrack),
    [activeTrack]
  );
  const visibleStarters = useMemo(
    () =>
      starterTemplates.filter((starter) =>
        activeTrack ? starter.businessTrack === activeTrack : true
      ),
    [activeTrack, starterTemplates]
  );

  const applyStarterSelection = (
    nextStarterId: WorkflowStarterTemplateId,
    currentStarterId: WorkflowStarterTemplateId = selectedStarterId
  ) => {
    const currentStarter =
      starterTemplates.find((starter) => starter.id === currentStarterId) ??
      defaultStarter;
    const nextStarter =
      starterTemplates.find((starter) => starter.id === nextStarterId) ?? defaultStarter;

    if (
      !workflowName.trim() ||
      workflowName.trim() === currentStarter.defaultWorkflowName
    ) {
      setWorkflowName(nextStarter.defaultWorkflowName);
    }

    setSelectedStarterId(nextStarterId);
    setActiveTrack(nextStarter.businessTrack);
    setMessage(null);
    setMessageTone("idle");
  };

  const handleTrackSelect = (trackId: (typeof starterTracks)[number]["id"]) => {
    setActiveTrack(trackId);

    const nextVisibleStarters = starterTemplates.filter(
      (starter) => starter.businessTrack === trackId
    );
    if (nextVisibleStarters.some((starter) => starter.id === selectedStarterId)) {
      return;
    }

    if (nextVisibleStarters[0]) {
      applyStarterSelection(nextVisibleStarters[0].id);
    }
  };

  const handleCreateWorkflow = () => {
    startCreateTransition(async () => {
      const normalizedName = workflowName.trim() || selectedStarter.defaultWorkflowName;
      setMessage("正在创建 workflow 草稿...");
      setMessageTone("idle");

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/workflows`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: normalizedName,
            definition: structuredClone(selectedStarter.definition)
          })
        });
        const body = (await response.json().catch(() => null)) as
          | { id?: string; detail?: string }
          | null;

        if (!response.ok || !body?.id) {
          setMessage(body?.detail ?? `创建失败，API 返回 ${response.status}。`);
          setMessageTone("error");
          return;
        }

        setMessage(`已创建 ${normalizedName}，正在进入编辑器...`);
        setMessageTone("success");
        router.push(`/workflows/${encodeURIComponent(body.id)}`);
        router.refresh();
      } catch {
        setMessage("无法连接后端创建 workflow，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  return (
    <main className="editor-shell">
      <section className="hero creation-hero">
        <div className="hero-copy">
          <p className="eyebrow">Workflow Creation</p>
          <h1>按业务主线挑 starter，再把草稿送进画布</h1>
          <p className="hero-text">
            这一页继续沿着当前优先级推进，不再只展示一排静态 starter 卡片，而是把
            “应用新建编排 / 节点能力 / 插件兼容 / API 调用开放” 收成一组可筛选的主业务入口。
            这样 starter 不只是创建页素材，而是后续模板治理和节点入口分层的稳定落点。
          </p>
          <div className="pill-row">
            <span className="pill">{starterTracks.length} business tracks</span>
            <span className="pill">{starterTemplates.length} starter templates</span>
            <span className="pill">{catalogToolCount} catalog tools</span>
            <span className="pill">{workflows.length} existing workflows</span>
          </div>
          <div className="hero-actions">
            <Link className="inline-link" href="/">
              返回系统首页
            </Link>
            <Link className="inline-link secondary" href="/workspace-starters">
              管理 workspace starters
            </Link>
            {workflows[0] ? (
              <Link
                className="inline-link secondary"
                href={`/workflows/${encodeURIComponent(workflows[0].id)}`}
              >
                打开最近 workflow
              </Link>
            ) : null}
          </div>
        </div>

        <div className="hero-panel">
          <div className="panel-label">Starter focus</div>
          <div className="panel-value">{activeTrackMeta.priority}</div>
          <p className="panel-text">
            当前主线：<strong>{activeTrackMeta.id}</strong>
          </p>
          <p className="panel-text">
            选中的 starter：<strong>{selectedStarter.name}</strong>
          </p>
          <p className="panel-text">
            当前焦点：<strong>{selectedStarter.workflowFocus}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>Visible starters</dt>
              <dd>{visibleStarters.length}</dd>
            </div>
            <div>
              <dt>Catalog tools</dt>
              <dd>{catalogToolCount}</dd>
            </div>
            <div>
              <dt>Drafts</dt>
              <dd>{workflows.length}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="creation-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Templates</p>
              <h2>Starter library</h2>
            </div>
            <p className="section-copy">
              先按主业务线选入口，再用最小骨架进入编排。后续 workspace 级模板治理，也继续沿着
              这套 starter library 演进。
            </p>
          </div>

          <WorkflowStarterBrowser
            activeTrack={activeTrack}
            selectedStarterId={selectedStarterId}
            starters={visibleStarters}
            tracks={starterTracks}
            sourceLanes={sourceLanes}
            onSelectTrack={handleTrackSelect}
            onSelectStarter={applyStarterSelection}
          />
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Create</p>
              <h2>Draft setup</h2>
            </div>
          </div>

          <div className="binding-form">
            <label className="binding-field">
              <span className="binding-label">Workflow name</span>
              <input
                className="trace-text-input"
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
                placeholder={selectedStarter.defaultWorkflowName}
              />
            </label>

            <div className="starter-summary-card">
              <div className="starter-card-header">
                <p className="entry-card-title">{selectedStarter.name}</p>
                <span className="health-pill">{selectedStarter.priority}</span>
              </div>
              <p className="section-copy starter-summary-copy">
                {selectedStarter.description}
              </p>
              <div className="summary-strip compact-strip">
                <div className="summary-card">
                  <span>Track</span>
                  <strong>{selectedStarter.businessTrack}</strong>
                </div>
                <div className="summary-card">
                  <span>Source</span>
                  <strong>{selectedStarter.source.shortLabel}</strong>
                </div>
                <div className="summary-card">
                  <span>Nodes</span>
                  <strong>{selectedStarter.nodeCount}</strong>
                </div>
              </div>
              <p className="starter-focus-copy">{selectedStarter.trackSummary}</p>
              <p className="starter-focus-copy">{selectedStarter.source.summary}</p>
              <p className="starter-focus-copy">
                下一步：{selectedStarter.recommendedNextStep}
              </p>
              <div className="starter-tag-row">
                {selectedStarter.nodeLabels.map((nodeLabel) => (
                  <span className="event-chip" key={`summary-${nodeLabel}`}>
                    {nodeLabel}
                  </span>
                ))}
                {selectedStarter.tags.map((tag) => (
                  <span className="event-chip" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="binding-actions">
              <button
                className="sync-button"
                type="button"
                onClick={handleCreateWorkflow}
                disabled={isCreating}
              >
                {isCreating ? "创建中..." : "创建并进入画布"}
              </button>
            </div>

            <p className={`sync-message ${messageTone}`}>
              {message ??
                "创建后会直接进入 workflow 编辑器，继续补节点、连线、运行态调试和后续发布链路。"}
            </p>
          </div>
        </article>

        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Existing drafts</p>
              <h2>Continue an existing workflow</h2>
            </div>
            <p className="section-copy">
              已有草稿会继续保留版本链路。需要接着修改时，也可以直接回到现有 workflow。
            </p>
          </div>

          {workflows.length === 0 ? (
            <p className="empty-state">
              当前还没有历史 workflow。创建第一个 starter 后，就可以从这里继续返回编辑。
            </p>
          ) : (
            <div className="workflow-chip-row">
              {workflows.map((workflow) => (
                <Link
                  key={workflow.id}
                  className="workflow-chip"
                  href={`/workflows/${encodeURIComponent(workflow.id)}`}
                >
                  <span>{workflow.name}</span>
                  <small>
                    {workflow.version} · {workflow.status}
                  </small>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
