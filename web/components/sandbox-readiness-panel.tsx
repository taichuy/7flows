import type { SandboxReadinessCheck } from "@/lib/get-system-overview";
import {
  buildSandboxExecutionClassCapabilityChips,
  formatSandboxReadinessDetail,
  formatSandboxReadinessHeadline,
  listSandboxAvailableClasses,
  listSandboxBlockedClasses,
  listSandboxReadinessCapabilityChips
} from "@/lib/sandbox-readiness-presenters";

type SandboxReadinessPanelProps = {
  readiness: SandboxReadinessCheck;
};

export function SandboxReadinessPanel({ readiness }: SandboxReadinessPanelProps) {
  const availableClasses = listSandboxAvailableClasses(readiness);
  const blockedClasses = listSandboxBlockedClasses(readiness);
  const capabilityChips = listSandboxReadinessCapabilityChips(readiness);
  const readinessHeadline = formatSandboxReadinessHeadline(readiness);
  const readinessDetail = formatSandboxReadinessDetail(readiness);

  return (
    <article className="diagnostic-panel panel-span">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Sandbox</p>
          <h2>Isolation readiness</h2>
        </div>
        <p className="section-copy">
          用统一事实概览当前强隔离链路是否真的可用，避免作者和 operator 只看到配置声明，
          却看不到 backend 健康度、执行级别覆盖和能力缺口。
        </p>
      </div>

      <div className="summary-strip">
        <article className="summary-card">
          <span>Enabled backends</span>
          <strong>{readiness.enabled_backend_count}</strong>
        </article>
        <article className="summary-card">
          <span>Healthy / degraded / offline</span>
          <strong>
            {readiness.healthy_backend_count} / {readiness.degraded_backend_count} / {readiness.offline_backend_count}
          </strong>
        </article>
        <article className="summary-card">
          <span>Available classes</span>
          <strong>{availableClasses.length ? availableClasses.join(" / ") : "none"}</strong>
        </article>
        <article className="summary-card">
          <span>Blocked classes</span>
          <strong>
            {blockedClasses.length
              ? blockedClasses.map((entry) => entry.execution_class).join(" / ")
              : "none"}
          </strong>
        </article>
      </div>

      <article className="payload-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">Fail-closed signal</span>
        </div>
        <p className="section-copy entry-copy">{readinessHeadline}</p>
        {readinessDetail ? <p className="binding-meta">{readinessDetail}</p> : null}
      </article>

      <div className="activity-list">
        {readiness.execution_classes.map((entry) => {
          const classCapabilityChips = buildSandboxExecutionClassCapabilityChips(entry);

          return (
            <article className="activity-row" key={entry.execution_class}>
              <div className="activity-header">
                <div>
                  <h3>{entry.execution_class}</h3>
                  <p>
                    {entry.available
                      ? `ready via ${entry.backend_ids.join(", ")}`
                      : entry.reason || "No compatible backend is currently ready."}
                  </p>
                </div>
                <span className={`health-pill ${entry.available ? "healthy" : "failed"}`}>
                  {entry.available ? "ready" : "blocked"}
                </span>
              </div>
              {classCapabilityChips.length > 0 ? (
                <div className="event-type-strip">
                  {classCapabilityChips.map((capability) => (
                    <span
                      className="event-chip"
                      key={`${entry.execution_class}-capability-${capability}`}
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="event-type-strip">
        {readiness.supported_languages.length === 0 ? (
          <p className="empty-state compact">当前没有可供强隔离路径复用的语言能力。</p>
        ) : (
          readiness.supported_languages.map((language) => (
            <span className="event-chip" key={`lang-${language}`}>
              language {language}
            </span>
          ))
        )}
        {readiness.supported_profiles.map((profile) => (
          <span className="event-chip" key={`profile-${profile}`}>
            profile {profile}
          </span>
        ))}
        {readiness.supported_dependency_modes.map((mode) => (
          <span className="event-chip" key={`dependency-${mode}`}>
            dependency {mode}
          </span>
        ))}
        {capabilityChips.map((capability) => (
          <span className="event-chip" key={`capability-${capability}`}>
            {capability}
          </span>
        ))}
      </div>
    </article>
  );
}
