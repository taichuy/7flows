import type { SandboxReadinessCheck } from "@/lib/get-system-overview";

type SandboxReadinessPanelProps = {
  readiness: SandboxReadinessCheck;
};

const capabilityLabels = [
  {
    enabled: "supports_builtin_package_sets",
    label: "builtin package sets"
  },
  {
    enabled: "supports_backend_extensions",
    label: "backend extensions"
  },
  {
    enabled: "supports_network_policy",
    label: "network policy"
  },
  {
    enabled: "supports_filesystem_policy",
    label: "filesystem policy"
  }
] as const satisfies Array<{
  enabled: keyof Pick<
    SandboxReadinessCheck,
    | "supports_builtin_package_sets"
    | "supports_backend_extensions"
    | "supports_network_policy"
    | "supports_filesystem_policy"
  >;
  label: string;
}>;

export function SandboxReadinessPanel({ readiness }: SandboxReadinessPanelProps) {
  const availableClasses = readiness.execution_classes
    .filter((entry) => entry.available)
    .map((entry) => entry.execution_class);
  const capabilityChips = capabilityLabels
    .filter((entry) => readiness[entry.enabled])
    .map((entry) => entry.label);

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
          <span>Healthy / degraded</span>
          <strong>
            {readiness.healthy_backend_count} / {readiness.degraded_backend_count}
          </strong>
        </article>
        <article className="summary-card">
          <span>Available classes</span>
          <strong>{availableClasses.length ? availableClasses.join(" / ") : "none"}</strong>
        </article>
      </div>

      <div className="activity-list">
        {readiness.execution_classes.map((entry) => (
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
          </article>
        ))}
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
