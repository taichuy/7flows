import { syncAdapterTools } from "@/app/actions";
import { AdapterSyncForm } from "@/components/adapter-sync-form";
import type {
  PluginAdapterRegistryItem,
  PluginToolRegistryItem
} from "@/lib/get-plugin-registry";

type PluginRegistryPanelProps = {
  adapters: PluginAdapterRegistryItem[];
  tools: PluginToolRegistryItem[];
};

export function PluginRegistryPanel({
  adapters,
  tools
}: PluginRegistryPanelProps) {
  return (
    <>
      <article className="diagnostic-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Compatibility</p>
            <h2>Adapter health and sync</h2>
          </div>
          <p className="section-copy">
            在这里可以看到 compat adapter 当前是否可达，并把 discovery 工具目录同步到
            API 的持久化注册表与运行时目录。
          </p>
        </div>

        <div className="diagnostic-list">
          {adapters.length === 0 ? (
            <p className="empty-state">当前还没有启用中的 compat adapter。</p>
          ) : (
            adapters.map((adapter) => (
              <article className="adapter-card" key={adapter.id}>
                <div className="adapter-header">
                  <div>
                    <p className="status-meta">Adapter</p>
                    <h3>{adapter.id}</h3>
                  </div>
                  <span className={`health-pill ${adapter.status}`}>{adapter.status}</span>
                </div>
                <p className="adapter-endpoint">{adapter.endpoint}</p>
                <p className="adapter-copy">
                  {adapter.detail ??
                    "目录同步会调用 adapter 的 /tools，并把返回结果写入 API 持久化目录。"}
                </p>
                <div className="adapter-meta-row">
                  <span className="event-chip">{adapter.ecosystem}</span>
                  <span className="event-chip">
                    {adapter.enabled ? "enabled" : "disabled"}
                  </span>
                  {adapter.plugin_kinds.map((kind) => (
                    <span className="event-chip" key={`${adapter.id}-${kind}`}>
                      {kind}
                    </span>
                  ))}
                </div>
                <AdapterSyncForm adapterId={adapter.id} action={syncAdapterTools} />
              </article>
            ))
          )}
        </div>
      </article>

      <article className="diagnostic-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>Plugin tool registry</h2>
          </div>
          <p className="section-copy">
            这里直接读取 `/api/plugins/tools`，展示目录来源、schema 和 compat runtime 线索，
            便于确认 sync 的结果真的可用于节点绑定。
          </p>
        </div>

        <div className="tool-list">
          {tools.length === 0 ? (
            <p className="empty-state">尚未同步任何 compat 工具。</p>
          ) : (
            tools.map((tool) => {
              const inputFields = getInputFieldNames(tool.input_schema);
              const origin = readPluginMetaString(tool.plugin_meta, "origin");
              const author = readPluginMetaString(tool.plugin_meta, "author");
              const runtimeBinding = readRuntimeBinding(tool.plugin_meta);

              return (
                <article className="tool-detail-card" key={tool.id}>
                  <div className="binding-card-header">
                    <div>
                      <p className="status-meta">Tool</p>
                      <h3>{tool.name}</h3>
                    </div>
                    <span className={`health-pill ${tool.callable ? "up" : "disabled"}`}>
                      {tool.callable ? "callable" : "unavailable"}
                    </span>
                  </div>
                  <p className="tool-id-line">{tool.id}</p>
                  <p className="adapter-copy">
                    {tool.description || "当前目录项还没有补充描述。"}
                  </p>

                  <div className="tool-badge-row">
                    <span className="event-chip">{tool.ecosystem}</span>
                    <span className="event-chip">{tool.source}</span>
                    {origin ? <span className="event-chip">origin {origin}</span> : null}
                    {author ? <span className="event-chip">author {author}</span> : null}
                  </div>

                  <div className="tool-detail-grid">
                    <div className="payload-card compact-card">
                      <div className="payload-card-header">
                        <span className="status-meta">Input fields</span>
                      </div>
                      {inputFields.length === 0 ? (
                        <p className="empty-state compact">当前 schema 没有声明字段。</p>
                      ) : (
                        <div className="tool-badge-row">
                          {inputFields.map((fieldName) => (
                            <span className="event-chip" key={`${tool.id}-${fieldName}`}>
                              {fieldName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="payload-card compact-card">
                      <div className="payload-card-header">
                        <span className="status-meta">Compat runtime</span>
                      </div>
                      {runtimeBinding ? (
                        <dl className="compact-meta-list">
                          <div>
                            <dt>Provider</dt>
                            <dd>{runtimeBinding.provider}</dd>
                          </div>
                          <div>
                            <dt>Plugin</dt>
                            <dd>{runtimeBinding.plugin_id}</dd>
                          </div>
                          <div>
                            <dt>Tool</dt>
                            <dd>{runtimeBinding.tool_name}</dd>
                          </div>
                        </dl>
                      ) : (
                        <p className="empty-state compact">当前目录项没有 compat runtime 提示。</p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </article>
    </>
  );
}

function getInputFieldNames(inputSchema: Record<string, unknown>) {
  const properties = inputSchema.properties;
  if (!properties || typeof properties !== "object") {
    return [];
  }

  return Object.keys(properties as Record<string, unknown>);
}

function readPluginMetaString(
  pluginMeta: PluginToolRegistryItem["plugin_meta"],
  key: string
) {
  const value = pluginMeta?.[key];
  return typeof value === "string" ? value : "";
}

function readRuntimeBinding(pluginMeta: PluginToolRegistryItem["plugin_meta"]) {
  const rawBinding = pluginMeta?.dify_runtime;
  if (!rawBinding || typeof rawBinding !== "object") {
    return null;
  }

  const plugin_id =
    typeof (rawBinding as Record<string, unknown>).plugin_id === "string"
      ? String((rawBinding as Record<string, unknown>).plugin_id)
      : "";
  const provider =
    typeof (rawBinding as Record<string, unknown>).provider === "string"
      ? String((rawBinding as Record<string, unknown>).provider)
      : "";
  const tool_name =
    typeof (rawBinding as Record<string, unknown>).tool_name === "string"
      ? String((rawBinding as Record<string, unknown>).tool_name)
      : "";

  if (!plugin_id && !provider && !tool_name) {
    return null;
  }

  return {
    plugin_id: plugin_id || "-",
    provider: provider || "-",
    tool_name: tool_name || "-"
  };
}
