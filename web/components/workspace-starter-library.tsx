"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";

import { getApiBaseUrl } from "@/lib/api-base-url";
import {
  getWorkspaceStarterHistory,
  getWorkspaceStarterSourceDiff,
  type WorkspaceStarterHistoryItem,
  type WorkspaceStarterSourceDiff,
  type WorkspaceStarterTemplateItem
} from "@/lib/get-workspace-starters";
import type { WorkflowDetail } from "@/lib/get-workflows";
import {
  WORKFLOW_BUSINESS_TRACKS,
  getWorkflowBusinessTrack,
  type WorkflowBusinessTrack
} from "@/lib/workflow-business-tracks";
import { summarizeWorkspaceStarterSourceStatus } from "@/lib/workspace-starter-source-status";
import { WorkspaceStarterHistoryPanel } from "@/components/workspace-starter-library/history-panel";
import { WorkspaceStarterSourceDiffPanel } from "@/components/workspace-starter-library/source-diff-panel";
import { WorkspaceStarterSourceCard } from "@/components/workspace-starter-library/source-status-card";

type WorkspaceStarterLibraryProps = {
  initialTemplates: WorkspaceStarterTemplateItem[];
};

type TrackFilter = "all" | WorkflowBusinessTrack;
type ArchiveFilter = "active" | "archived" | "all";

type WorkspaceStarterFormState = {
  name: string;
  description: string;
  businessTrack: WorkflowBusinessTrack;
  defaultWorkflowName: string;
  workflowFocus: string;
  recommendedNextStep: string;
  tagsText: string;
};

export function WorkspaceStarterLibrary({
  initialTemplates
}: WorkspaceStarterLibraryProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [activeTrack, setActiveTrack] = useState<TrackFilter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplates[0]?.id ?? null
  );
  const [formState, setFormState] = useState<WorkspaceStarterFormState | null>(
    initialTemplates[0] ? buildFormState(initialTemplates[0]) : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"idle" | "success" | "error">("idle");
  const [isSaving, startSavingTransition] = useTransition();
  const [isMutating, startMutatingTransition] = useTransition();
  const [isRefreshing, startRefreshingTransition] = useTransition();
  const [sourceWorkflow, setSourceWorkflow] = useState<WorkflowDetail | null>(null);
  const [sourceStatusMessage, setSourceStatusMessage] = useState<string | null>(null);
  const [isLoadingSourceWorkflow, setIsLoadingSourceWorkflow] = useState(false);
  const [historyItems, setHistoryItems] = useState<WorkspaceStarterHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [sourceDiff, setSourceDiff] = useState<WorkspaceStarterSourceDiff | null>(null);
  const [isLoadingSourceDiff, setIsLoadingSourceDiff] = useState(false);
  const [isRebasing, startRebasingTransition] = useTransition();

  const filteredTemplates = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      if (archiveFilter === "active" && template.archived) {
        return false;
      }
      if (archiveFilter === "archived" && !template.archived) {
        return false;
      }
      if (activeTrack !== "all" && template.business_track !== activeTrack) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        template.name,
        template.description,
        template.default_workflow_name,
        template.workflow_focus,
        template.recommended_next_step,
        template.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [activeTrack, archiveFilter, searchQuery, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const selectedTrackMeta = selectedTemplate
    ? getWorkflowBusinessTrack(selectedTemplate.business_track)
    : null;
  const activeTemplateCount = useMemo(
    () => templates.filter((template) => !template.archived).length,
    [templates]
  );
  const archivedTemplateCount = useMemo(
    () => templates.filter((template) => template.archived).length,
    [templates]
  );
  const hasPendingChanges =
    selectedTemplate !== null &&
    formState !== null &&
    JSON.stringify(buildUpdatePayload(formState)) ===
      JSON.stringify(buildUpdatePayload(buildFormState(selectedTemplate)))
      ? false
      : Boolean(selectedTemplate && formState);
  const sourceStatus = useMemo(
    () =>
      selectedTemplate
        ? summarizeWorkspaceStarterSourceStatus(selectedTemplate, sourceWorkflow)
        : null,
    [selectedTemplate, sourceWorkflow]
  );

  useEffect(() => {
    if (selectedTemplateId && templates.some((template) => template.id === selectedTemplateId)) {
      return;
    }

    setSelectedTemplateId(templates[0]?.id ?? null);
  }, [selectedTemplateId, templates]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      return;
    }

    if (
      selectedTemplateId &&
      filteredTemplates.some((template) => template.id === selectedTemplateId)
    ) {
      return;
    }

    setSelectedTemplateId(filteredTemplates[0].id);
  }, [filteredTemplates, selectedTemplateId]);

  useEffect(() => {
    setFormState(selectedTemplate ? buildFormState(selectedTemplate) : null);
  }, [selectedTemplate]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTemplate?.created_from_workflow_id) {
      setSourceWorkflow(null);
      setSourceStatusMessage(null);
      setIsLoadingSourceWorkflow(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingSourceWorkflow(true);
    setSourceStatusMessage(null);

    void fetch(
      `${getApiBaseUrl()}/api/workflows/${encodeURIComponent(
        selectedTemplate.created_from_workflow_id
      )}`,
      {
        cache: "no-store"
      }
    )
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setSourceWorkflow(null);
          setSourceStatusMessage(
            response.status === 404
              ? "源 workflow 已不存在。"
              : `读取源 workflow 失败，API 返回 ${response.status}。`
          );
          setIsLoadingSourceWorkflow(false);
          return;
        }

        setSourceWorkflow((await response.json()) as WorkflowDetail);
        setIsLoadingSourceWorkflow(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSourceWorkflow(null);
        setSourceStatusMessage("无法连接后端读取源 workflow，请确认 API 已启动。");
        setIsLoadingSourceWorkflow(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate?.created_from_workflow_id]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTemplate) {
      setHistoryItems([]);
      setIsLoadingHistory(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingHistory(true);
    void getWorkspaceStarterHistory(selectedTemplate.id)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setHistoryItems(items);
        setIsLoadingHistory(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setHistoryItems([]);
        setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedTemplate?.created_from_workflow_id) {
      setSourceDiff(null);
      setIsLoadingSourceDiff(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingSourceDiff(true);
    void getWorkspaceStarterSourceDiff(selectedTemplate.id)
      .then((item) => {
        if (cancelled) {
          return;
        }
        setSourceDiff(item);
        setIsLoadingSourceDiff(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setSourceDiff(null);
        setIsLoadingSourceDiff(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  const handleSave = () => {
    if (!selectedTemplate || !formState) {
      return;
    }

    startSavingTransition(async () => {
      setMessage("正在更新 workspace starter...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(buildUpdatePayload(formState))
          }
        );
        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;

        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? "更新失败。" : "更新失败。");
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        setMessage(`已更新 workspace starter：${body.name}。`);
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端更新 workspace starter，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  const handleTemplateMutation = (action: "archive" | "restore" | "delete") => {
    if (!selectedTemplate) {
      return;
    }

    const actionLabel = {
      archive: "归档",
      restore: "恢复",
      delete: "永久删除"
    }[action];
    const shouldContinue =
      action !== "delete" ||
      window.confirm(`确认永久删除模板「${selectedTemplate.name}」吗？此操作不可撤销。`);
    if (!shouldContinue) {
      return;
    }

    startMutatingTransition(async () => {
      setMessage(`正在${actionLabel} workspace starter...`);
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}${
            action === "delete" ? "" : `/${action}`
          }`,
          {
            method: action === "delete" ? "DELETE" : "POST"
          }
        );
        if (action === "delete") {
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as
              | { detail?: string }
              | null;
            setMessage(body?.detail ?? "删除失败。");
            setMessageTone("error");
            return;
          }

          setTemplates((current) =>
            current.filter((template) => template.id !== selectedTemplate.id)
          );
          setMessage(`已永久删除 workspace starter：${selectedTemplate.name}。`);
          setMessageTone("success");
          return;
        }

        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;
        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? `${actionLabel}失败。` : `${actionLabel}失败。`);
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        setMessage(`已${actionLabel} workspace starter：${body.name}。`);
        setMessageTone("success");
      } catch {
        setMessage(`无法连接后端${actionLabel} workspace starter，请确认 API 已启动。`);
        setMessageTone("error");
      }
    });
  };

  const reloadHistory = async (templateId: string) => {
    setIsLoadingHistory(true);
    setHistoryItems(await getWorkspaceStarterHistory(templateId));
    setIsLoadingHistory(false);
  };

  const reloadSourceDiff = async (templateId: string) => {
    setIsLoadingSourceDiff(true);
    setSourceDiff(await getWorkspaceStarterSourceDiff(templateId));
    setIsLoadingSourceDiff(false);
  };

  const handleRefreshFromSource = () => {
    if (!selectedTemplate?.created_from_workflow_id) {
      return;
    }

    startRefreshingTransition(async () => {
      setMessage("正在从源 workflow 刷新 starter 快照...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}/refresh`,
          {
            method: "POST"
          }
        );
        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;

        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? "刷新失败。" : "刷新失败。");
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        await reloadHistory(body.id);
        await reloadSourceDiff(body.id);
        setMessage(`已刷新 workspace starter：${body.name}。`);
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端刷新 starter，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  const handleRebaseFromSource = () => {
    if (!selectedTemplate?.created_from_workflow_id) {
      return;
    }

    startRebasingTransition(async () => {
      setMessage("正在基于 source workflow 执行 rebase...");
      setMessageTone("idle");

      try {
        const response = await fetch(
          `${getApiBaseUrl()}/api/workspace-starters/${encodeURIComponent(selectedTemplate.id)}/rebase`,
          {
            method: "POST"
          }
        );
        const body = (await response.json().catch(() => null)) as
          | WorkspaceStarterTemplateItem
          | { detail?: string }
          | null;

        if (!response.ok || !body || !("id" in body)) {
          setMessage(body && "detail" in body ? body.detail ?? "rebase 失败。" : "rebase 失败。");
          setMessageTone("error");
          return;
        }

        setTemplates((current) =>
          current.map((template) => (template.id === body.id ? body : template))
        );
        setSelectedTemplateId(body.id);
        await reloadHistory(body.id);
        await reloadSourceDiff(body.id);
        setMessage(`已完成 workspace starter rebase：${body.name}。`);
        setMessageTone("success");
      } catch {
        setMessage("无法连接后端执行 starter rebase，请确认 API 已启动。");
        setMessageTone("error");
      }
    });
  };

  return (
    <main className="editor-shell">
      <section className="hero creation-hero">
        <div className="hero-copy">
          <p className="eyebrow">Workspace Starter Governance</p>
          <h1>把模板从“能保存”推进到“能治理”</h1>
          <p className="hero-text">
            这条链路专门承接 editor 保存出来的 workspace starter，让团队能按业务主线查看、
            筛选、校对和更新模板元数据，而不是继续把模板治理留在编辑器里的单个按钮。
          </p>
          <div className="pill-row">
            <span className="pill">{activeTemplateCount} active starters</span>
            <span className="pill">{archivedTemplateCount} archived starters</span>
            <span className="pill">{filteredTemplates.length} visible templates</span>
            <span className="pill">{WORKFLOW_BUSINESS_TRACKS.length} business tracks</span>
          </div>
          <div className="hero-actions">
            <Link className="inline-link" href="/workflows/new">
              返回创建页
            </Link>
            <Link className="inline-link secondary" href="/">
              返回系统首页
            </Link>
          </div>
        </div>

        <div className="hero-panel">
          <div className="panel-label">Governance state</div>
          <div className="panel-value">{templates.length > 0 ? "Ready" : "Empty"}</div>
          <p className="panel-text">
            当前主线：<strong>P0 应用新建编排</strong>
          </p>
          <p className="panel-text">
            视图能力：<strong>列表 / 筛选 / 详情 / 更新 / 归档</strong>
          </p>
          <p className="panel-text">
            当前选中：<strong>{selectedTemplate?.name ?? "暂无模板"}</strong>
          </p>
          <dl className="signal-list">
            <div>
              <dt>Templates</dt>
              <dd>{templates.length}</dd>
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
              <dt>Track</dt>
              <dd>{activeTrack === "all" ? "All" : getWorkflowBusinessTrack(activeTrack).priority}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="governance-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Library</p>
              <h2>Template list</h2>
            </div>
            <p className="section-copy">
              先按主业务线和关键字收敛范围，再进入具体模板详情，避免 workspace starter
              library 只停留在“知道它存在”。
            </p>
          </div>

          <div className="starter-track-bar" role="tablist" aria-label="Workspace starter tracks">
            <button
              className={`starter-track-chip ${activeTrack === "all" ? "selected" : ""}`}
              type="button"
              onClick={() => setActiveTrack("all")}
            >
              <span>All</span>
              <strong>全部主线</strong>
              <small>{templates.length} starters</small>
            </button>
            {WORKFLOW_BUSINESS_TRACKS.map((track) => (
              <button
                key={track.id}
                className={`starter-track-chip ${activeTrack === track.id ? "selected" : ""}`}
                type="button"
                onClick={() => setActiveTrack(track.id)}
              >
                <span>{track.priority}</span>
                <strong>{track.id}</strong>
                <small>
                  {
                    templates.filter((template) => template.business_track === track.id).length
                  }{" "}
                  starters
                </small>
              </button>
            ))}
          </div>

          <div className="binding-form governance-filter-form">
            <div className="starter-track-bar" role="tablist" aria-label="Workspace starter status">
              {[
                {
                  id: "active" as const,
                  title: "Active",
                  subtitle: "可复用模板",
                  count: activeTemplateCount
                },
                {
                  id: "archived" as const,
                  title: "Archived",
                  subtitle: "已归档模板",
                  count: archivedTemplateCount
                },
                {
                  id: "all" as const,
                  title: "All",
                  subtitle: "全部状态",
                  count: templates.length
                }
              ].map((item) => (
                <button
                  key={item.id}
                  className={`starter-track-chip ${archiveFilter === item.id ? "selected" : ""}`}
                  type="button"
                  onClick={() => setArchiveFilter(item.id)}
                >
                  <span>{item.title}</span>
                  <strong>{item.subtitle}</strong>
                  <small>{item.count} starters</small>
                </button>
              ))}
            </div>

            <label className="binding-field">
              <span className="binding-label">Search templates</span>
              <input
                className="trace-text-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="按名称、描述、焦点或标签筛选"
              />
            </label>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="empty-state-block">
              <p className="empty-state">
                当前筛选条件下还没有 workspace starter。可以先回到创建页新建 workflow，
                再从 editor 保存一个模板进入治理库。
              </p>
              <Link className="inline-link" href="/workflows/new">
                去创建第一个 starter
              </Link>
            </div>
          ) : (
            <div className="starter-grid">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  className={`starter-card ${template.id === selectedTemplateId ? "selected" : ""}`}
                  type="button"
                  onClick={() => setSelectedTemplateId(template.id)}
                >
                  <div className="starter-card-header">
                    <span className="starter-track">{template.business_track}</span>
                    <div className="starter-tag-row">
                      <span className="health-pill">
                        {getWorkflowBusinessTrack(template.business_track).priority}
                      </span>
                      {template.archived ? <span className="event-chip">archived</span> : null}
                    </div>
                  </div>
                  <strong>{template.name}</strong>
                  <p>{template.description || "暂未填写描述。"}</p>
                  <p className="starter-focus-copy">
                    {template.workflow_focus || "暂未填写 workflow focus。"}
                  </p>
                  <div className="starter-meta-row">
                    <span>{template.definition.nodes?.length ?? 0} nodes</span>
                    <span>{template.tags.length} tags</span>
                    <span>{formatTimestamp(template.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </article>

        <div className="governance-sidebar">
          <article className="diagnostic-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Detail</p>
                <h2>Starter metadata</h2>
              </div>
            </div>

            {!selectedTemplate || !formState ? (
              <p className="empty-state">选中一个模板后，这里会显示可更新的元数据与来源信息。</p>
            ) : (
              <>
                <div className="summary-strip compact-strip">
                  <div className="summary-card">
                    <span>Priority</span>
                    <strong>{selectedTrackMeta?.priority ?? "-"}</strong>
                  </div>
                  <div className="summary-card">
                    <span>Status</span>
                    <strong>{selectedTemplate.archived ? "Archived" : "Active"}</strong>
                  </div>
                  <div className="summary-card">
                    <span>Nodes</span>
                    <strong>{selectedTemplate.definition.nodes?.length ?? 0}</strong>
                  </div>
                  <div className="summary-card">
                    <span>Edges</span>
                    <strong>{selectedTemplate.definition.edges?.length ?? 0}</strong>
                  </div>
                </div>

                <div className="binding-form">
                  <label className="binding-field">
                    <span className="binding-label">Template name</span>
                    <input
                      className="trace-text-input"
                      value={formState.name}
                      onChange={(event) =>
                        setFormState((current) =>
                          current ? { ...current, name: event.target.value } : current
                        )
                      }
                    />
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Business track</span>
                    <select
                      className="binding-select"
                      value={formState.businessTrack}
                      onChange={(event) =>
                        setFormState((current) =>
                          current
                            ? {
                                ...current,
                                businessTrack: event.target.value as WorkflowBusinessTrack
                              }
                            : current
                        )
                      }
                    >
                      {WORKFLOW_BUSINESS_TRACKS.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.priority} · {track.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Default workflow name</span>
                    <input
                      className="trace-text-input"
                      value={formState.defaultWorkflowName}
                      onChange={(event) =>
                        setFormState((current) =>
                          current
                            ? { ...current, defaultWorkflowName: event.target.value }
                            : current
                        )
                      }
                    />
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Description</span>
                    <textarea
                      className="governance-textarea"
                      value={formState.description}
                      onChange={(event) =>
                        setFormState((current) =>
                          current ? { ...current, description: event.target.value } : current
                        )
                      }
                    />
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Workflow focus</span>
                    <textarea
                      className="governance-textarea"
                      value={formState.workflowFocus}
                      onChange={(event) =>
                        setFormState((current) =>
                          current ? { ...current, workflowFocus: event.target.value } : current
                        )
                      }
                    />
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Recommended next step</span>
                    <textarea
                      className="governance-textarea"
                      value={formState.recommendedNextStep}
                      onChange={(event) =>
                        setFormState((current) =>
                          current
                            ? { ...current, recommendedNextStep: event.target.value }
                            : current
                        )
                      }
                    />
                  </label>

                  <label className="binding-field">
                    <span className="binding-label">Tags</span>
                    <input
                      className="trace-text-input"
                      value={formState.tagsText}
                      onChange={(event) =>
                        setFormState((current) =>
                          current ? { ...current, tagsText: event.target.value } : current
                        )
                      }
                      placeholder="使用逗号分隔标签"
                    />
                  </label>

                  <div className="binding-actions">
                    <button
                      className="sync-button"
                      type="button"
                      onClick={handleSave}
                      disabled={!hasPendingChanges || isSaving}
                    >
                      {isSaving ? "保存中..." : "保存元数据"}
                    </button>
                    {selectedTemplate.archived ? (
                      <button
                        className="sync-button secondary"
                        type="button"
                        onClick={() => handleTemplateMutation("restore")}
                        disabled={isMutating}
                      >
                        {isMutating ? "处理中..." : "恢复模板"}
                      </button>
                    ) : (
                      <>
                        <button
                          className="sync-button secondary"
                          type="button"
                          onClick={() => handleTemplateMutation("archive")}
                          disabled={isMutating}
                        >
                          {isMutating ? "处理中..." : "归档模板"}
                        </button>
                        <Link
                          className="inline-link secondary"
                          href={`/workflows/new?starter=${encodeURIComponent(selectedTemplate.id)}`}
                        >
                          带此 starter 回到创建页
                        </Link>
                      </>
                    )}
                    {selectedTemplate.created_from_workflow_id ? (
                      <Link
                        className="inline-link secondary"
                        href={`/workflows/${encodeURIComponent(selectedTemplate.created_from_workflow_id)}`}
                      >
                        打开源 workflow
                      </Link>
                    ) : null}
                    <button
                      className="inline-link secondary"
                      type="button"
                      onClick={() => handleTemplateMutation("delete")}
                      disabled={isMutating}
                    >
                      永久删除
                    </button>
                  </div>

                  <p className={`sync-message ${messageTone}`}>
                    {message ??
                      "更新后会直接写回 workspace starter library，创建页会立刻复用最新元数据。"}
                  </p>
                </div>
              </>
            )}
          </article>

          <article className="diagnostic-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Preview</p>
                <h2>Definition snapshot</h2>
              </div>
            </div>

            {!selectedTemplate ? (
              <p className="empty-state">当前没有可预览的模板定义。</p>
            ) : (
              <>
                <div className="meta-grid">
                  <div className="summary-card">
                    <span>Updated</span>
                    <strong>{formatTimestamp(selectedTemplate.updated_at)}</strong>
                  </div>
                  <div className="summary-card">
                    <span>Workflow version</span>
                    <strong>{selectedTemplate.created_from_workflow_version ?? "n/a"}</strong>
                  </div>
                  <div className="summary-card">
                    <span>Source status</span>
                    <strong>{sourceStatus?.label ?? "-"}</strong>
                  </div>
                </div>

                <div className="starter-tag-row">
                  {selectedTemplate.tags.map((tag) => (
                    <span className="event-chip" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>

                <WorkspaceStarterSourceCard
                  template={selectedTemplate}
                  sourceStatus={sourceStatus}
                  sourceStatusMessage={sourceStatusMessage}
                  isLoadingSourceWorkflow={isLoadingSourceWorkflow}
                  isRefreshing={isRefreshing}
                  onRefresh={handleRefreshFromSource}
                />

                <div className="governance-node-list">
                  {(selectedTemplate.definition.nodes ?? []).map((node) => (
                    <div className="binding-card compact-card" key={node.id}>
                      <div className="binding-card-header">
                        <div>
                          <p className="entry-card-title">{node.name ?? node.id}</p>
                          <p className="binding-meta">
                            {node.type} · {node.id}
                          </p>
                        </div>
                        <span className="health-pill">{node.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>

          <WorkspaceStarterHistoryPanel
            historyItems={historyItems}
            isLoading={isLoadingHistory}
          />
          <WorkspaceStarterSourceDiffPanel
            sourceDiff={sourceDiff}
            isLoading={isLoadingSourceDiff}
            isRebasing={isRebasing}
            onRebase={handleRebaseFromSource}
          />
        </div>
      </section>
    </main>
  );
}

function buildFormState(template: WorkspaceStarterTemplateItem): WorkspaceStarterFormState {
  return {
    name: template.name,
    description: template.description,
    businessTrack: template.business_track,
    defaultWorkflowName: template.default_workflow_name,
    workflowFocus: template.workflow_focus,
    recommendedNextStep: template.recommended_next_step,
    tagsText: template.tags.join(", ")
  };
}

function buildUpdatePayload(formState: WorkspaceStarterFormState) {
  return {
    name: formState.name.trim(),
    description: formState.description.trim(),
    business_track: formState.businessTrack,
    default_workflow_name: formState.defaultWorkflowName.trim(),
    workflow_focus: formState.workflowFocus.trim(),
    recommended_next_step: formState.recommendedNextStep.trim(),
    tags: formState.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  };
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
