"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { getApiBaseUrl } from "@/lib/api-base-url";
import type { WorkflowListItem } from "@/lib/get-workflows";
import {
  buildWorkflowStarterDefinition,
  WORKFLOW_STARTER_TEMPLATES,
  type WorkflowStarterId
} from "@/lib/workflow-starters";

type WorkflowCreateWizardProps = {
  catalogToolCount: number;
  workflows: WorkflowListItem[];
};

const DEFAULT_STARTER_ID: WorkflowStarterId = "blank";

export function WorkflowCreateWizard({
  catalogToolCount,
  workflows
}: WorkflowCreateWizardProps) {
  const router = useRouter();
  const [selectedStarterId, setSelectedStarterId] =
    useState<WorkflowStarterId>(DEFAULT_STARTER_ID);
  const [workflowName, setWorkflowName] = useState(
    readStarter(DEFAULT_STARTER_ID).defaultWorkflowName
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "success" | "error">("idle");
  const [isCreating, startCreateTransition] = useTransition();

  const selectedStarter = useMemo(
    () => readStarter(selectedStarterId),
    [selectedStarterId]
  );

  const handleStarterSelect = (nextStarterId: WorkflowStarterId) => {
    const currentStarter = readStarter(selectedStarterId);
    const nextStarter = readStarter(nextStarterId);

    if (
      !workflowName.trim() ||
      workflowName.trim() === currentStarter.defaultWorkflowName
    ) {
      setWorkflowName(nextStarter.defaultWorkflowName);
    }

    setSelectedStarterId(nextStarterId);
    setMessage(null);
    setMessageTone("idle");
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
            definition: buildWorkflowStarterDefinition(selectedStarterId)
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
          <h1>从新建应用开始进入编排，而不是先手写 API</h1>
          <p className="hero-text">
            这一页补的是当前最高优先级的主业务入口：先选一个最小 starter，再把草稿直接送进
            编辑器，后续节点、插件兼容和开放 API 都继续沿着同一条 workflow definition 演进。
          </p>
          <div className="pill-row">
            <span className="pill">{WORKFLOW_STARTER_TEMPLATES.length} starter templates</span>
            <span className="pill">{catalogToolCount} catalog tools</span>
            <span className="pill">{workflows.length} existing workflows</span>
          </div>
          <div className="hero-actions">
            <Link className="inline-link" href="/">
              返回系统首页
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
          <div className="panel-value">{selectedStarter.nodeCount} nodes</div>
          <p className="panel-text">
            当前主线：<strong>{selectedStarter.businessTrack}</strong>
          </p>
          <p className="panel-text">
            选中的 starter：<strong>{selectedStarter.name}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>Templates</dt>
              <dd>{WORKFLOW_STARTER_TEMPLATES.length}</dd>
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
              <h2>Starter templates</h2>
            </div>
            <p className="section-copy">
              先用最小骨架进入编排，再继续往节点能力、插件兼容和发布配置推进。
            </p>
          </div>

          <div className="starter-grid">
            {WORKFLOW_STARTER_TEMPLATES.map((starter) => (
              <button
                key={starter.id}
                className={`starter-card ${
                  starter.id === selectedStarterId ? "selected" : ""
                }`}
                type="button"
                onClick={() => handleStarterSelect(starter.id)}
              >
                <span className="starter-track">{starter.businessTrack}</span>
                <strong>{starter.name}</strong>
                <p>{starter.description}</p>
                <div className="starter-meta-row">
                  <span>{starter.nodeCount} nodes</span>
                  <span>{starter.tags[0]}</span>
                </div>
              </button>
            ))}
          </div>
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
              <p className="entry-card-title">{selectedStarter.name}</p>
              <p className="section-copy starter-summary-copy">
                {selectedStarter.description}
              </p>
              <div className="starter-tag-row">
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
                "创建后会直接进入 workflow 编辑器，继续补节点、连线和运行态调试。"}
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

function readStarter(starterId: WorkflowStarterId) {
  return (
    WORKFLOW_STARTER_TEMPLATES.find((starter) => starter.id === starterId) ??
    WORKFLOW_STARTER_TEMPLATES[0]
  );
}
