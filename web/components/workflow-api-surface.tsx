import React from "react";
import Link from "next/link";

import { invokePublishedEndpointSample } from "@/app/actions/publish";
import {
  WorkflowStudioUtilityEmptyState,
  WorkflowStudioUtilityFrame,
  type WorkflowStudioUtilityAction,
  type WorkflowStudioUtilityMetric,
  type WorkflowStudioUtilityTag
} from "@/components/workflow-studio-utility-frame";
import type { WorkflowPublishedEndpointItem } from "@/lib/get-workflow-publish";
import {
  buildWorkflowApiBindingDoc,
  buildWorkflowApiSampleBlockedMessage,
  buildWorkflowApiSampleLogsHref,
  buildWorkflowApiSampleMonitorHref,
  type WorkflowApiSampleInvocationQueryScope,
  selectPublishedWorkflowBindings
} from "@/lib/workflow-api-surface";
import { buildRunDetailHref } from "@/lib/workbench-links";

type WorkflowApiSurfaceProps = {
  workflowId: string;
  bindings: WorkflowPublishedEndpointItem[];
  apiHref: string;
  publishHref: string;
  logsHref: string;
  monitorHref: string;
  sampleQueryScope: WorkflowApiSampleInvocationQueryScope;
};

function formatSampleSurfaceLabel(requestSurface: WorkflowApiSampleInvocationQueryScope["requestSurface"]) {
  switch (requestSurface) {
    case "openai.chat.completions":
      return "OpenAI chat.completions";
    case "anthropic.messages":
      return "Anthropic messages";
    case "native.alias":
      return "7Flows native alias";
    default:
      return "Published gateway";
  }
}

function formatAuthModeLabel(authMode: string) {
  switch (authMode) {
    case "api_key":
      return "API Key";
    case "internal":
      return "Internal auth";
    default:
      return authMode;
  }
}

function renderWorkflowApiSampleResult({
  bindingId,
  apiHref,
  logsHref,
  monitorHref,
  publishHref,
  sampleQueryScope
}: {
  bindingId: string;
  apiHref: string;
  logsHref: string;
  monitorHref: string;
  publishHref: string;
  sampleQueryScope: WorkflowApiSampleInvocationQueryScope;
}) {
  if (sampleQueryScope.status === "idle" || sampleQueryScope.bindingId !== bindingId) {
    return null;
  }

  const handoff = {
    bindingId: sampleQueryScope.bindingId,
    invocationId: sampleQueryScope.invocationId,
    runId: sampleQueryScope.runId
  };
  const hasTraceHandoff = Boolean(sampleQueryScope.invocationId || sampleQueryScope.runId);

  return (
    <div
      className="payload-card compact-card"
      data-component="workflow-api-sample-result"
      data-sample-status={sampleQueryScope.status}
    >
      <div className="payload-card-header">
        <span className="status-meta">
          {sampleQueryScope.status === "success" ? "Fresh sample ready" : "Fresh sample blocked"}
        </span>
        <div className="workflow-api-chip-row">
          <span className="event-chip">{formatSampleSurfaceLabel(sampleQueryScope.requestSurface)}</span>
          {sampleQueryScope.runStatus ? (
            <span className="event-chip">run {sampleQueryScope.runStatus}</span>
          ) : null}
          {sampleQueryScope.cleanup === "revoke_failed" ? (
            <span className="event-chip">temp key revoke failed</span>
          ) : null}
        </div>
      </div>

      {sampleQueryScope.message ? (
        <p className={`sync-message ${sampleQueryScope.status}`}>{sampleQueryScope.message}</p>
      ) : null}

      <dl className="compact-meta-list publish-key-meta">
        <div>
          <dt>Binding</dt>
          <dd>{bindingId}</dd>
        </div>
        <div>
          <dt>Invocation</dt>
          <dd>{sampleQueryScope.invocationId ?? "未回读到 fresh invocation"}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>{sampleQueryScope.runId ?? "未回读到 run id"}</dd>
        </div>
      </dl>

      <div className="binding-actions">
        {hasTraceHandoff ? (
          <Link
            className="workflow-studio-secondary-link"
            href={buildWorkflowApiSampleLogsHref(logsHref, handoff)}
          >
            前往日志与标注
          </Link>
        ) : null}
        {hasTraceHandoff ? (
          <Link
            className="workflow-studio-secondary-link"
            href={buildWorkflowApiSampleMonitorHref(monitorHref, handoff)}
          >
            前往监测报表
          </Link>
        ) : null}
        {sampleQueryScope.runId ? (
          <Link
            className="workflow-studio-secondary-link"
            href={buildRunDetailHref(sampleQueryScope.runId)}
          >
            查看 run 详情
          </Link>
        ) : null}
        <Link className="workflow-studio-secondary-link" href={publishHref}>
          查看发布治理
        </Link>
        <Link className="workflow-studio-secondary-link" href={apiHref}>
          清除结果
        </Link>
      </div>
    </div>
  );
}

export function WorkflowApiSurface({
  workflowId,
  bindings,
  apiHref,
  publishHref,
  logsHref,
  monitorHref,
  sampleQueryScope
}: WorkflowApiSurfaceProps) {
  const publishedBindings = selectPublishedWorkflowBindings(bindings);
  const nonPublishedCount = Math.max(bindings.length - publishedBindings.length, 0);
  const docs = publishedBindings.map((binding) => buildWorkflowApiBindingDoc(binding));
  const sharedActions: WorkflowStudioUtilityAction[] = [
    {
      key: "publish",
      href: publishHref,
      label: "查看发布治理",
      variant: "primary"
    },
    {
      key: "logs",
      href: logsHref,
      label: "查看请求日志"
    },
    {
      key: "monitor",
      href: monitorHref,
      label: "打开监测报表"
    }
  ];

  if (publishedBindings.length === 0) {
    const hasDraftBindings = bindings.some((binding) => binding.lifecycle_status === "draft");

    return (
      <div className="workflow-api-surface" data-component="workflow-api-surface">
        <WorkflowStudioUtilityEmptyState
          actions={[
            {
              key: "publish",
              href: publishHref,
              label: "前往发布治理",
              variant: "primary"
            },
            {
              key: "runs",
              href: "/runs",
              label: "查看运行诊断"
            }
          ]}
          dataComponent="workflow-api-empty-state"
          description="访问 API 只消费 workflow 已发布 binding 的真实 contract，不会把 draft / offline 定义伪装成可调用 endpoint。"
          emptyDescription={
            hasDraftBindings
              ? "当前 workflow 只有 draft / offline publish definition；请先到发布治理完成正式发布，再回来查看可对接的 API contract。"
              : "当前 workflow 还没有 published binding；请先完成发布治理，再把真实 contract 暴露给外部调用方。"
          }
          eyebrow="Published contract"
          surface="api"
          title="访问 API"
        />
      </div>
    );
  }

  const overviewMetrics: WorkflowStudioUtilityMetric[] = [
    {
      key: "published-bindings",
      label: "Published bindings",
      value: publishedBindings.length
    },
    {
      key: "other-definitions",
      label: "Other definitions",
      value: nonPublishedCount
    },
    {
      key: "contract-scope",
      label: "Contract scope",
      value: "只展示 active published bindings",
      detail: "draft / offline definition 继续留在发布治理处理，不会在这里伪装成已可调用 API。",
      wide: true
    }
  ];
  const overviewTags: WorkflowStudioUtilityTag[] = [
    {
      key: "sample-seam",
      label: "本地样例请求",
      color: "processing"
    },
    {
      key: "docs-mode",
      label: "调用方文档目录",
      color: "blue"
    }
  ];
  const accessChecklist = [
    `先从 ${publishedBindings.length} 个已发布 binding 中选一个协议入口，锁定 endpoint alias 与 request path。`,
    "复制 Base URL、鉴权 header 和最小请求示例；published API key 只建议保存在服务端或受控代理。",
    "在当前页运行一次本地样例请求，把 fresh invocation / run 继续 handoff 到日志、监测报表和 run 详情。"
  ];

  return (
    <div className="workflow-api-surface" data-component="workflow-api-surface">
      <WorkflowStudioUtilityFrame
        actions={sharedActions}
        description="这里把 workflow 已发布 binding 收口成调用方文档工作台：先确认鉴权与 Base URL，再复制最小请求示例，最后用样例请求把结果接到日志、监测报表和 run 详情。"
        eyebrow="Published contract"
        metrics={overviewMetrics}
        notice="目录只覆盖 active published bindings；draft / offline definition 继续回发布治理处理，样例请求仍走本地 published gateway。"
        surface="api"
        tags={overviewTags}
        title="访问 API"
      >
        <div className="workflow-api-layout">
          <div className="workflow-api-doc-list">
            {docs.map((doc) => {
              const binding = publishedBindings.find((item) => item.id === doc.bindingId);
              const blockedMessage = binding ? buildWorkflowApiSampleBlockedMessage(binding) : null;

              return (
                <article
                  className="workspace-panel workflow-api-doc-card"
                  data-binding-id={doc.bindingId}
                  data-component="workflow-api-binding-doc"
                  id={doc.anchorId}
                  key={doc.bindingId}
                >
                  <div className="workflow-api-doc-header">
                    <div>
                      <p className="workflow-studio-placeholder-eyebrow">调用入口</p>
                      <h3>{doc.title}</h3>
                      <p>{doc.endpointSummary}</p>
                    </div>
                    <div className="workflow-api-chip-row">
                      {doc.protocolChips.map((chip) => (
                        <span className="event-chip" key={`${doc.bindingId}-${chip}`}>
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="workspace-overview-strip workflow-api-meta-strip">
                    <article className="workspace-stat-card">
                      <span>协议</span>
                      <strong>{doc.protocolLabel}</strong>
                    </article>
                    <article className="workspace-stat-card">
                      <span>鉴权</span>
                      <strong>{formatAuthModeLabel(doc.authModeLabel)}</strong>
                    </article>
                    <article className="workspace-stat-card workspace-stat-card-wide">
                      <span>Base URL</span>
                      <strong>{doc.baseUrl}</strong>
                      <p className="workspace-stat-copy">Request path: {doc.requestPath}</p>
                    </article>
                  </div>

                  <div className="entry-card compact-card" data-component="workflow-api-sample-card">
                    <p className="entry-card-title">样例请求与排障接力</p>
                    <p className="section-copy entry-copy">
                      先用当前 binding 的真实 contract 发一次最小样例请求。执行完成后，结果会直接回写到当前页，
                      并生成跳到 `/logs`、`/monitor` 与 run 详情的直达 handoff。
                    </p>

                    {blockedMessage ? (
                      <div data-component="workflow-api-sample-blocked">
                        <p className="sync-message error">{blockedMessage}</p>
                        <div className="binding-actions">
                          <Link className="workflow-studio-secondary-link" href={publishHref}>
                            去发布治理调整鉴权
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <form
                        action={invokePublishedEndpointSample}
                        className="binding-actions"
                        data-component="workflow-api-sample-form"
                      >
                        <input type="hidden" name="workflowId" value={workflowId} />
                        <input type="hidden" name="bindingId" value={doc.bindingId} />
                        <input type="hidden" name="apiHref" value={`${apiHref}#${doc.anchorId}`} />
                        <button className="sync-button" type="submit">
                          运行本地样例请求
                        </button>
                        <Link className="workflow-studio-secondary-link" href={publishHref}>
                          查看发布治理
                        </Link>
                      </form>
                    )}

                    {renderWorkflowApiSampleResult({
                      bindingId: doc.bindingId,
                      apiHref,
                      logsHref,
                      monitorHref,
                      publishHref,
                      sampleQueryScope
                    })}
                  </div>

                  <div className="workflow-api-doc-grid">
                    {doc.sections.map((section) => (
                      <section
                        className="workflow-api-section-card"
                        data-component="workflow-api-doc-section"
                        data-section-id={section.id}
                        id={section.id}
                        key={section.id}
                      >
                        <div className="workflow-api-section-heading">
                          <p className="workflow-studio-placeholder-eyebrow">{section.eyebrow}</p>
                          <h4>{section.title}</h4>
                        </div>

                        <p className="section-copy">{section.description}</p>

                        {section.metaRows?.length ? (
                          <dl className="workflow-api-meta-list">
                            {section.metaRows.map((row) => (
                              <div key={`${section.id}-${row.label}`}>
                                <dt>{row.label}</dt>
                                <dd>{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}

                        {section.bulletItems?.length ? (
                          <ul className="workflow-api-bullet-list">
                            {section.bulletItems.map((item) => (
                              <li key={`${section.id}-${item}`}>{item}</li>
                            ))}
                          </ul>
                        ) : null}

                        {section.codeBlock ? (
                          <div className="workflow-api-code-card">
                            <div className="workflow-api-code-header">{section.codeLabel ?? "Code"}</div>
                            <pre className="workflow-api-code-block">{section.codeBlock}</pre>
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="workspace-panel workflow-api-directory" data-component="workflow-api-directory">
            <section className="workflow-api-directory-group" data-component="workflow-api-onboarding">
              <p className="workflow-studio-placeholder-eyebrow">Quick start</p>
              <h3>调用方接入步骤</h3>
              <ol className="workflow-api-bullet-list">
                {accessChecklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>

            <section className="workflow-api-directory-group" data-component="workflow-api-handoff-guide">
              <p className="workflow-studio-placeholder-eyebrow">Trace handoff</p>
              <h3>调用后怎么继续排查</h3>
              <p>
                如果还没打样例请求，可以先看 workflow 级别的日志与监测报表；一旦当前页拿到 fresh
                invocation / run，就会把链接升级成指向这次调用的直达 handoff。
              </p>
              <div className="binding-actions">
                <Link className="workflow-studio-secondary-link" href={logsHref}>
                  打开 workflow 日志
                </Link>
                <Link className="workflow-studio-secondary-link" href={monitorHref}>
                  打开监测报表
                </Link>
              </div>
            </section>

            <div className="workflow-api-directory-header">
              <p className="workflow-studio-placeholder-eyebrow">Directory</p>
              <h3>调用方文档目录</h3>
              <p>
                先选一个 binding，再依次查看鉴权、Base URL、请求入口、最小请求示例和协议差异。
              </p>
            </div>

            <nav aria-label="Workflow API 目录" className="workflow-api-directory-nav">
              {docs.map((doc) => (
                <div
                  className="workflow-api-directory-group"
                  data-component="workflow-api-directory-group"
                  key={doc.bindingId}
                >
                  <a className="workflow-api-directory-binding" href={`#${doc.anchorId}`}>
                    <span>{doc.title}</span>
                    <small>
                      {doc.protocolLabel} · {formatAuthModeLabel(doc.authModeLabel)} · {doc.requestPath}
                    </small>
                  </a>

                  <div className="workflow-api-directory-links">
                    {doc.sections.map((section) => (
                      <a className="workflow-api-directory-link" href={`#${section.id}`} key={section.id}>
                        {section.navLabel}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      </WorkflowStudioUtilityFrame>
    </div>
  );
}
