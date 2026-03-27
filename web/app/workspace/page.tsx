import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace-shell";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
import { getWorkflowLibrarySnapshot } from "@/lib/get-workflow-library";
import { getWorkflowBusinessTrack, WORKFLOW_BUSINESS_TRACKS } from "@/lib/workflow-business-tracks";
import { inferWorkflowBusinessTrack } from "@/lib/workflow-starters";
import { formatTimestamp } from "@/lib/runtime-presenters";
import { formatWorkspaceRole } from "@/lib/workspace-access";
import { getServerWorkspaceContext } from "@/lib/server-workspace-access";
import { getWorkspaceBadgeLabel } from "@/lib/workspace-ui";

type WorkspacePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type WorkspaceFilterKey = "all" | "draft" | "published" | "follow_up";

type WorkspaceAppCard = {
  id: string;
  name: string;
  href: string;
  status: string;
  healthLabel: string;
  recommendedNextStep: string;
  track: ReturnType<typeof getWorkflowBusinessTrack>;
  nodeCount: number;
  publishCount: number;
  updatedAt: string;
  missingToolCount: number;
  followUpCount: number;
};

function readSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return "";
}

function buildWorkspaceHref(options: {
  filter?: WorkspaceFilterKey;
  track?: string;
  keyword?: string;
}) {
  const searchParams = new URLSearchParams();

  if (options.filter && options.filter !== "all") {
    searchParams.set("filter", options.filter);
  }
  if (options.track && options.track !== "all") {
    searchParams.set("track", options.track);
  }
  if (options.keyword && options.keyword.trim()) {
    searchParams.set("keyword", options.keyword.trim());
  }

  const query = searchParams.toString();
  return query ? `/workspace?${query}` : "/workspace";
}

function buildWorkflowStarterCreateHref(starterId: string) {
  return `/workflows/new?starter=${encodeURIComponent(starterId)}`;
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const workspaceContext = await getServerWorkspaceContext();
  if (!workspaceContext) {
    redirect("/login?next=/workspace");
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedFilter = readSearchParam(resolvedSearchParams, "filter");
  const requestedTrack = readSearchParam(resolvedSearchParams, "track");
  const requestedKeyword = readSearchParam(resolvedSearchParams, "keyword").trim();
  const activeFilter: WorkspaceFilterKey =
    requestedFilter === "draft" ||
    requestedFilter === "published" ||
    requestedFilter === "follow_up"
      ? requestedFilter
      : "all";
  const activeTrack =
    requestedTrack && WORKFLOW_BUSINESS_TRACKS.some((track) => track.id === requestedTrack)
      ? requestedTrack
      : "all";
  const normalizedKeyword = requestedKeyword.toLowerCase();

  const [workflowSummaries, workflowLibrary, systemOverview] = await Promise.all([
    getWorkflows(),
    getWorkflowLibrarySnapshot(),
    getSystemOverview()
  ]);
  const workflowDetails = (
    await Promise.all(workflowSummaries.map((workflow) => getWorkflowDetail(workflow.id)))
  ).filter((workflow): workflow is NonNullable<typeof workflow> => Boolean(workflow));

  const appCards: WorkspaceAppCard[] = workflowDetails.map((workflow) => {
    const track = getWorkflowBusinessTrack(inferWorkflowBusinessTrack(workflow.definition));
    const publishCount = Array.isArray(workflow.definition.publish)
      ? workflow.definition.publish.length
      : 0;
    const missingToolCount = workflow.tool_governance.missing_tool_ids.length;
    const followUpCount = missingToolCount + (workflow.definition_issues?.length ?? 0);
    const healthLabel =
      followUpCount > 0
        ? `${followUpCount} 个治理待办`
        : workflow.status === "published"
          ? "可调用"
          : "草稿可继续编排";

    return {
      id: workflow.id,
      name: workflow.name,
      href: `/workflows/${encodeURIComponent(workflow.id)}`,
      status: workflow.status,
      healthLabel,
      recommendedNextStep:
        missingToolCount > 0
          ? `先补齐 ${missingToolCount} 个工具缺口，再进入 xyflow 继续编排。`
          : workflow.status === "published"
            ? "继续在 xyflow 维护版本，必要时从运行诊断核对线上调用。"
            : "继续在 xyflow 完成节点配置、上下文授权和发布准备。",
      track,
      nodeCount: workflow.node_count,
      publishCount,
      updatedAt: workflow.updated_at,
      missingToolCount,
      followUpCount
    };
  });

  const filteredApps = appCards.filter((card) => {
    const matchesStatus =
      activeFilter === "draft"
        ? card.status !== "published"
        : activeFilter === "published"
          ? card.status === "published"
          : activeFilter === "follow_up"
            ? card.followUpCount > 0
            : true;

    const matchesTrack = activeTrack === "all" || card.track.id === activeTrack;
    const matchesKeyword =
      !normalizedKeyword ||
      [card.name, card.track.id, card.track.summary, card.track.focus].some((value) =>
        value.toLowerCase().includes(normalizedKeyword)
      );

    return matchesStatus && matchesTrack && matchesKeyword;
  });

  const filterItems = [
    { key: "all", label: `全部 ${appCards.length}` },
    {
      key: "draft",
      label: `草稿 ${appCards.filter((card) => card.status !== "published").length}`
    },
    {
      key: "published",
      label: `已发布 ${appCards.filter((card) => card.status === "published").length}`
    },
    {
      key: "follow_up",
      label: `待治理 ${appCards.filter((card) => card.followUpCount > 0).length}`
    }
  ];
  const trackItems = [
    { key: "all", label: "全部类型", count: appCards.length },
    ...WORKFLOW_BUSINESS_TRACKS.map((track) => ({
      key: track.id,
      label: `${track.priority} ${track.id}`,
      count: appCards.filter((card) => card.track.id === track.id).length
    }))
  ];
  const workspaceSignals = [
    { label: "应用", value: String(appCards.length) },
    {
      label: "草稿",
      value: String(appCards.filter((card) => card.status !== "published").length)
    },
    {
      label: "已发布",
      value: String(appCards.filter((card) => card.status === "published").length)
    },
    {
      label: "待治理",
      value: String(appCards.filter((card) => card.followUpCount > 0).length)
    },
    {
      label: "Sandbox",
      value: systemOverview.sandbox_readiness.primary_blocker_kind ? "需处理" : "正常"
    }
  ];
  const starterHighlights = workflowLibrary.starters.slice(0, 3).map((starter) => ({
    id: starter.id,
    name: starter.name,
    description: starter.description,
    href: buildWorkflowStarterCreateHref(starter.id),
    track: starter.businessTrack,
    priority: getWorkflowBusinessTrack(starter.businessTrack).priority
  }));
  const visibleAppSummary =
    filteredApps.length === appCards.length
      ? `全部 ${filteredApps.length} 个应用`
      : `筛选结果 ${filteredApps.length} / ${appCards.length}`;

  return (
    <WorkspaceShell
      activeNav="workspace"
      userName={workspaceContext.current_user.display_name}
      userRole={workspaceContext.current_member.role}
      workspaceName={workspaceContext.workspace.name}
    >
      <main className="workspace-main workspace-home-main">
        <section className="workspace-home-header workspace-panel">
          <div className="workspace-home-copy">
            <p className="workspace-eyebrow">Workspace / Apps</p>
            <h1>{workspaceContext.workspace.name} 应用工作台</h1>
            <p className="workspace-muted workspace-copy-wide">
              借鉴 Dify 的应用工作台交互，把应用入口、Starter 模板和团队协作压到同一层；
              真正的 ChatFlow 编排仍然进入 7Flows 的 xyflow 编辑器与 workflow detail 主链。
            </p>
            <div className="workspace-home-pills">
              <span className="workspace-tag accent">
                当前身份：{formatWorkspaceRole(workspaceContext.current_member.role)}
              </span>
              <span className="workspace-tag">默认管理员已可用</span>
              <span className="workspace-tag">新建应用直达 xyflow</span>
            </div>
          </div>
          <div className="workspace-home-signal-grid" aria-label="Workspace overview">
            {workspaceSignals.map((signal) => (
              <article className="workspace-home-signal" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </article>
            ))}
            <article className="workspace-home-signal workspace-home-signal-wide">
              <span>编排基座</span>
              <strong>xyflow 仍是画布事实源</strong>
              <p className="workspace-muted workspace-stat-copy">
                工作台负责创建、筛选和协作；节点工具、上下文授权、调试与发布继续沿既有 workflow 主链推进。
              </p>
            </article>
          </div>
        </section>

        <section className="workspace-category-row workspace-category-row-compact" aria-label="App categories">
          {trackItems.map((trackItem) => (
            <Link
              className={`workspace-category-tab ${trackItem.key === activeTrack ? "active" : ""}`}
              href={buildWorkspaceHref({
                filter: activeFilter,
                track: trackItem.key,
                keyword: requestedKeyword
              })}
              key={trackItem.key}
            >
              <span>{trackItem.label}</span>
              <strong>{trackItem.count}</strong>
            </Link>
          ))}
        </section>

        <section className="workspace-toolbar workspace-toolbar-compact" aria-label="App filters">
          <div className="workspace-filter-row">
            <span className="workspace-toolbar-meta">应用筛选</span>
            {filterItems.map((filterItem) => (
              <Link
                className={`workspace-filter-chip ${filterItem.key === activeFilter ? "active" : ""}`}
                href={buildWorkspaceHref({
                  filter: filterItem.key as WorkspaceFilterKey,
                  track: activeTrack,
                  keyword: requestedKeyword
                })}
                key={filterItem.key}
              >
                {filterItem.label}
              </Link>
            ))}
          </div>

          <form action="/workspace" className="workspace-search-form">
            {activeFilter !== "all" ? <input name="filter" type="hidden" value={activeFilter} /> : null}
            {activeTrack !== "all" ? <input name="track" type="hidden" value={activeTrack} /> : null}
            <input
              className="workspace-search-input"
              defaultValue={requestedKeyword}
              name="keyword"
              placeholder="搜索应用、业务轨道或治理焦点"
              type="search"
            />
            <button className="workspace-primary-button compact" type="submit">
              搜索
            </button>
            {requestedKeyword ? (
              <Link
                className="workspace-ghost-button compact"
                href={buildWorkspaceHref({ filter: activeFilter, track: activeTrack })}
              >
                清除
              </Link>
            ) : null}
          </form>
        </section>

        <section className="workspace-app-section">
          <div className="workspace-app-section-header">
            <div>
              <p className="workspace-eyebrow">Applications</p>
              <h2>{visibleAppSummary}</h2>
              <p className="workspace-muted workspace-copy-wide">
                先在工作台完成创建、筛选和成员协作，再进入 xyflow 继续节点编排、运行调试与发布治理。
              </p>
            </div>
            <div className="workspace-action-row">
              <Link className="workspace-ghost-button compact" href="/workspace-starters">
                查看 Starter
              </Link>
              <Link className="workspace-ghost-button compact" href="/admin/members">
                团队设置
              </Link>
            </div>
          </div>

          <div className="workspace-app-grid">
            <article className="workspace-app-card workspace-create-tile">
              <div>
                <p className="workspace-eyebrow">创建应用</p>
                <h3>从空白 ChatFlow、Starter 或团队协作开始</h3>
                <p className="workspace-muted workspace-copy-wide">
                  保留 Dify 式应用入口心智，但只展示当前已经真实落地的动作，不在 workspace 壳层伪造第二套执行事实。
                </p>
              </div>

              <div className="workspace-create-list">
                <Link className="workspace-create-link" href="/workflows/new">
                  <span>新建空白 ChatFlow</span>
                  <small>直接生成最小 workflow 草稿，创建后继续进入 xyflow。</small>
                </Link>
                <Link className="workspace-create-link" href="/workspace-starters">
                  <span>从应用模板创建</span>
                  <small>先按 starter 业务轨道挑入口，再把草稿送进画布。</small>
                </Link>
                <Link className="workspace-create-link" href="/admin/members">
                  <span>管理成员与权限</span>
                  <small>管理员可直接开通成员账号，并在工作空间里完成角色配置。</small>
                </Link>
              </div>

              {starterHighlights.length > 0 ? (
                <div className="workspace-starter-highlight-list">
                  {starterHighlights.map((starter) => (
                    <Link className="workspace-starter-highlight" href={starter.href} key={starter.id}>
                      <strong>{starter.name}</strong>
                      <span>
                        {starter.priority} · {starter.track}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}

              <p className="workspace-create-footnote">
                编排事实源：xyflow · Starter 模板：{workflowLibrary.starters.length} 个。
              </p>
            </article>

            {filteredApps.length === 0 ? (
              <article className="workspace-app-card workspace-app-card-empty">
                <p className="workspace-eyebrow">应用列表</p>
                <h3>当前筛选范围内还没有应用</h3>
                <p className="workspace-muted workspace-copy-wide">
                  现在可以直接从空白 ChatFlow 或 Starter 创建新应用；创建后继续进入 xyflow 编辑器补节点、调试和发布语义。
                </p>
                <div className="workspace-action-row">
                  <Link className="workspace-primary-button compact" href="/workflows/new">
                    立即创建
                  </Link>
                  <Link className="workspace-ghost-button compact" href="/workspace-starters">
                    查看 Starter
                  </Link>
                </div>
              </article>
            ) : null}

            {filteredApps.map((card) => (
              <article className="workspace-app-card workspace-app-card-product" key={card.id}>
                <div className="workspace-app-card-header">
                  <div className="workspace-app-card-identity">
                    <div className="workspace-app-icon" aria-hidden="true">
                      {getWorkspaceBadgeLabel(card.name, "A")}
                    </div>
                    <div>
                      <h3>{card.name}</h3>
                      <p className="workspace-app-subtitle">
                        {workspaceContext.current_user.display_name} · 最近更新 {formatTimestamp(card.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <span className={`workspace-status-pill ${card.status === "published" ? "healthy" : "draft"}`}>
                    {card.status === "published" ? "已发布" : "草稿"}
                  </span>
                </div>
                <p className="workspace-app-type">{card.track.id}</p>
                <p className="workspace-app-focus">{card.track.focus}</p>
                <p className="workspace-muted workspace-app-summary">{card.track.summary}</p>
                <div className="workspace-tag-row app-card-tags">
                  <span className="workspace-tag">{card.nodeCount} 个节点</span>
                  <span className="workspace-tag">{card.publishCount} 个发布端点</span>
                  {card.missingToolCount > 0 ? (
                    <span className="workspace-tag warning">{card.missingToolCount} 个工具缺口</span>
                  ) : null}
                </div>
                <div className="workspace-app-footer">
                  <div>
                    <p className="workspace-app-meta">{card.healthLabel}</p>
                    <p className="workspace-app-meta">推荐下一步：{card.recommendedNextStep}</p>
                  </div>
                  <div className="workspace-action-row">
                    <Link className="workspace-primary-button compact" href={card.href}>
                      继续进入 xyflow
                    </Link>
                    <Link className="workspace-ghost-button compact" href="/runs">
                      查看运行
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </WorkspaceShell>
  );
}
