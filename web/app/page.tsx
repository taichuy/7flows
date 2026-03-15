import Link from "next/link";

import { CredentialStorePanel } from "@/components/credential-store-panel";
import { PluginRegistryPanel } from "@/components/plugin-registry-panel";
import { StatusCard } from "@/components/status-card";
import { WorkflowToolBindingPanel } from "@/components/workflow-tool-binding-panel";
import { getCredentials } from "@/lib/get-credentials";
import { getPluginRegistrySnapshot } from "@/lib/get-plugin-registry";
import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";
import { getWorkflowDetail, getWorkflows } from "@/lib/get-workflows";
import {
  formatCountMap,
  formatTimestamp
} from "@/lib/runtime-presenters";

const highlights = [
  "Dify 风格的本地源码开发路径",
  "FastAPI + Celery 运行时骨架",
  "Docker 中间件环境与全容器模式并存"
];

type HomePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const requestedWorkflowId = readFirstSearchParam(resolvedSearchParams.workflow);

  const [overview, pluginRegistry, workflows, credentials, sensitiveAccessInbox] = await Promise.all([
    getSystemOverview(),
    getPluginRegistrySnapshot(),
    getWorkflows(),
    getCredentials(true),
    getSensitiveAccessInboxSnapshot()
  ]);
  const recentRuns = overview.runtime_activity.recent_runs;
  const activitySummary = overview.runtime_activity.summary;
  const latestRun = recentRuns[0];
  const pendingSensitiveEntries = sensitiveAccessInbox.entries
    .filter((entry) => entry.ticket.status === "pending")
    .slice(0, 3);
  const selectedWorkflowId = requestedWorkflowId || workflows[0]?.id || "";
  const selectedWorkflow = await getWorkflowDetail(selectedWorkflowId);

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">7Flows Studio</p>
          <h1>为多 Agent 工作流准备的丝滑起步架构</h1>
          <p className="hero-text">
            当前首页已经接上后端概览接口，用来直观看到中间件、运行时与对象存储是否就绪。
            现在也会把 compat adapter、工具目录同步结果和运行摘要一起展示出来，详细日志则进入独立的
            run 诊断面板查看。
          </p>
          <div className="pill-row">
            {highlights.map((item) => (
              <span className="pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-label">Environment</div>
          <div className="panel-value">{overview.environment}</div>
          <p className="panel-text">
            API 状态：<strong>{overview.status}</strong>
          </p>
          <p className="panel-text">已声明能力：{overview.capabilities.join(" / ")}</p>
          <dl className="signal-list">
            <div>
              <dt>Adapters</dt>
              <dd>{pluginRegistry.adapters.length}</dd>
            </div>
            <div>
              <dt>Tools</dt>
              <dd>{pluginRegistry.tools.length}</dd>
            </div>
            <div>
              <dt>Recent events</dt>
              <dd>{activitySummary.recent_event_count}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid">
        {overview.services.map((service) => (
          <StatusCard key={service.name} service={service} />
        ))}
      </section>

      <section className="diagnostics-layout">
        <PluginRegistryPanel
          adapters={pluginRegistry.adapters}
          tools={pluginRegistry.tools}
        />
      </section>

      <section className="diagnostics-layout">
        <WorkflowToolBindingPanel
          workflows={workflows}
          selectedWorkflow={selectedWorkflow}
          tools={pluginRegistry.tools}
        />
      </section>

      <section className="diagnostics-layout">
        <CredentialStorePanel credentials={credentials} />
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sensitive Access</p>
              <h2>Approval inbox signal</h2>
            </div>
            <p className="section-copy">
              统一敏感访问事实层已经接到真实 operator 页面；首页只保留摘要和入口，详细审批与通知处理进入独立 inbox 页面。
            </p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Pending tickets</span>
              <strong>{sensitiveAccessInbox.summary.pending_ticket_count}</strong>
            </article>
            <article className="summary-card">
              <span>Waiting resumes</span>
              <strong>{sensitiveAccessInbox.summary.waiting_ticket_count}</strong>
            </article>
            <article className="summary-card">
              <span>Delivered notices</span>
              <strong>{sensitiveAccessInbox.summary.delivered_notification_count}</strong>
            </article>
            <article className="summary-card">
              <span>Failed notices</span>
              <strong>{sensitiveAccessInbox.summary.failed_notification_count}</strong>
            </article>
          </div>

          {pendingSensitiveEntries.length === 0 ? (
            <p className="empty-state">当前没有待处理的敏感访问审批票据。</p>
          ) : (
            <div className="activity-list">
              {pendingSensitiveEntries.map((entry) => (
                <article className="activity-row" key={entry.ticket.id}>
                  <div className="activity-header">
                    <div>
                      <h3>{entry.resource?.label ?? entry.request?.resource_id ?? entry.ticket.id}</h3>
                      <p>
                        {entry.request?.requester_id ?? "unknown requester"} · {entry.request?.action_type ?? "access"}
                      </p>
                    </div>
                    <span className={`health-pill ${entry.ticket.waiting_status}`}>
                      {entry.ticket.waiting_status}
                    </span>
                  </div>
                  <p className="activity-copy">
                    run {entry.ticket.run_id ?? "—"} · notifications {entry.notifications.length}
                  </p>
                </article>
              ))}
            </div>
          )}

          <div className="entry-card compact-card">
            <p className="entry-card-title">Operator entry</p>
            <p className="section-copy entry-copy">
              审批、拒绝和通知状态复盘现在有了统一收件箱，不必再只靠 blocked-card 或后端接口列表排查。
            </p>
            <Link className="inline-link" href="/sensitive-access?status=pending">
              打开敏感访问收件箱
            </Link>
          </div>
        </article>
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel panel-span">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Editor</p>
              <h2>Workflow canvas entry</h2>
            </div>
            <div className="section-actions">
              <p className="section-copy">
                最小 `xyflow` 编辑器已经接上 workflow definition，可直接进入画布编辑节点、
                连线和基础 metadata，再保存回后端版本链路。
              </p>
              <Link className="inline-link" href="/workflows/new">
                新建 workflow
              </Link>
              <Link className="inline-link secondary" href="/workspace-starters">
                管理 workspace starters
              </Link>
            </div>
          </div>

          {workflows.length === 0 ? (
            <div className="empty-state-block">
              <p className="empty-state">
                当前还没有可编辑的 workflow。现在可以直接从新建向导创建 starter，而不用再先手动调用 API。
              </p>
              <Link className="inline-link" href="/workflows/new">
                进入新建向导
              </Link>
            </div>
          ) : (
            <div className="workflow-chip-row">
              {workflows.map((workflow) => (
                <Link
                  className="workflow-chip"
                  href={`/workflows/${encodeURIComponent(workflow.id)}`}
                  key={`editor-${workflow.id}`}
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

      <section className="diagnostics-layout runtime-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>Recent runs</h2>
            </div>
            <p className="section-copy">
              使用运行态记录快速确认最近有没有真实执行，以及每个 run 留下了多少事件。
            </p>
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Recent runs</span>
              <strong>{activitySummary.recent_run_count}</strong>
            </article>
            <article className="summary-card">
              <span>Recent events</span>
              <strong>{activitySummary.recent_event_count}</strong>
            </article>
            <article className="summary-card">
              <span>Run statuses</span>
              <strong>{formatCountMap(activitySummary.run_statuses)}</strong>
            </article>
          </div>

          <div className="activity-list">
            {recentRuns.length === 0 ? (
              <p className="empty-state">还没有历史 run，可先通过运行接口触发一次工作流执行。</p>
            ) : (
              recentRuns.map((run) => (
                <article className="activity-row" key={run.id}>
                  <div className="activity-header">
                    <div>
                      <h3>{run.workflow_id}</h3>
                      <p>
                        run {run.id} · version {run.workflow_version}
                      </p>
                    </div>
                    <span className={`health-pill ${run.status}`}>{run.status}</span>
                  </div>
                  <p className="activity-copy">
                    Created {formatTimestamp(run.created_at)} · events {run.event_count}
                  </p>
                  <Link className="activity-link" href={`/runs/${run.id}`}>
                    查看 run 诊断面板
                  </Link>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Run Events</p>
              <h2>Event spine overview</h2>
            </div>
            <p className="section-copy">
              调试、流式输出和回放都会复用同一条 run events 事件流；首页只保留聚合信号，
              详细 payload 和节点级日志统一回到独立 run 诊断面板。
            </p>
          </div>

          <div className="event-type-strip">
            {Object.keys(activitySummary.event_types).length === 0 ? (
              <p className="empty-state compact">当前还没有可聚合的事件类型统计。</p>
            ) : (
              Object.entries(activitySummary.event_types).map(([eventType, count]) => (
                <span className="event-chip" key={eventType}>
                  {eventType} · {count}
                </span>
              ))
            )}
          </div>

          <div className="summary-strip">
            <article className="summary-card">
              <span>Recent events</span>
              <strong>{activitySummary.recent_event_count}</strong>
            </article>
            <article className="summary-card">
              <span>Event types</span>
              <strong>{Object.keys(activitySummary.event_types).length}</strong>
            </article>
          </div>

          <div className="entry-card">
            <p className="entry-card-title">详细日志查看</p>
            <p className="section-copy entry-copy">
              从最近 run 进入独立诊断页后，可以继续看节点输入输出、错误信息和完整事件 payload。
            </p>
            {latestRun ? (
              <Link className="inline-link" href={`/runs/${latestRun.id}`}>
                打开最新 run 诊断面板
              </Link>
            ) : (
              <p className="empty-state compact">当前还没有可打开的 run 诊断记录。</p>
            )}
          </div>
        </article>
      </section>

      <section className="roadmap">
        <div>
          <p className="eyebrow">Signal Discipline</p>
          <h2>测试结果与应用日志都应该是可见的开发信号</h2>
          <p className="hero-text">
            目录同步、服务健康和运行事件已经接入首页诊断区。后续继续推进时，会沿着同一条思路把
            验证结果、调试信息和用户可优化的运行日志保持在可追踪、可复用的位置上。
          </p>
        </div>
        <ul className="roadmap-list">
          <li>让插件目录直接进入 workflow 的 tool 节点绑定链路</li>
          <li>把更多调试信息继续统一收敛到 run events</li>
          <li>继续扩展独立 run 诊断面板、发布诊断视图和节点配置</li>
          <li>继续保持每轮开发的验证结果和开发记录留痕</li>
        </ul>
      </section>
    </main>
  );
}

function readFirstSearchParam(value: string | string[] | undefined) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return "";
}
