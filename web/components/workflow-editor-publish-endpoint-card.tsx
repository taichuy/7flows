import { useEffect, useRef } from "react";

import {
  AUTH_MODES,
  PUBLISH_PROTOCOLS,
  assignOptionalString,
  parsePositiveInteger,
  stringifyJson,
  toEnumValue,
  toRecord,
  type WorkflowPublishedEndpointDraft
} from "./workflow-editor-publish-form-shared";

type WorkflowEditorPublishEndpointCardProps = {
  endpoint: WorkflowPublishedEndpointDraft;
  endpointIndex: number;
  workflowVersion: string;
  validationMessages: string[];
  highlighted?: boolean;
  highlightedFieldPath?: string | null;
  onUpdateEndpoint: (
    index: number,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  onDeleteEndpoint: (index: number) => void;
  onApplySchemaField: (
    endpointIndex: number,
    field: "inputSchema" | "outputSchema",
    value: string
  ) => void;
};

export function WorkflowEditorPublishEndpointCard({
  endpoint,
  endpointIndex,
  workflowVersion,
  validationMessages,
  highlighted = false,
  highlightedFieldPath = null,
  onUpdateEndpoint,
  onDeleteEndpoint,
  onApplySchemaField
}: WorkflowEditorPublishEndpointCardProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const versionChip = endpoint.workflowVersion
    ? `pinned ${endpoint.workflowVersion}`
    : `tracks current ${workflowVersion}`;

  useEffect(() => {
    if (!highlighted) {
      return;
    }

    const fieldKey = normalizePublishFieldKey(highlightedFieldPath);
    const target = sectionRef.current?.querySelector<HTMLElement>(
      `[data-validation-field="${fieldKey}"] input, ` +
        `[data-validation-field="${fieldKey}"] select, ` +
        `[data-validation-field="${fieldKey}"] textarea`
    );

    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus();
  }, [highlighted, highlightedFieldPath]);

  return (
    <section
      className={`entry-card compact-card ${highlighted ? "validation-focus-ring" : ""}`.trim()}
      ref={sectionRef}
    >
      <div className="binding-card-header">
        <div>
          <p className="status-meta">Endpoint draft</p>
          <h3>{endpoint.name}</h3>
        </div>
        <span className="event-chip">{endpoint.protocol}</span>
      </div>

      <div className="tool-badge-row">
        <span className="event-chip">id {endpoint.id}</span>
        <span className="event-chip">auth {endpoint.authMode}</span>
        <span className="event-chip">{endpoint.streaming ? "streaming" : "non-streaming"}</span>
        <span className="event-chip">{versionChip}</span>
      </div>

      {validationMessages.length > 0 ? (
        <div className="sync-message error">
          <ul className="roadmap-list compact-list">
            {validationMessages.map((message) => (
              <li key={`${endpoint.id}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="binding-field" data-validation-field="name">
        <span className="binding-label">Name</span>
        <input
          className="trace-text-input"
          value={endpoint.name}
          onChange={(event) =>
            onUpdateEndpoint(endpointIndex, (current) => {
              current.name = event.target.value.trimStart();
              return current;
            })
          }
        />
      </label>

      <label className="binding-field" data-validation-field="id">
        <span className="binding-label">Endpoint id</span>
        <input
          className="trace-text-input"
          value={endpoint.id}
          onChange={(event) =>
            onUpdateEndpoint(endpointIndex, (current) => {
              current.id = event.target.value.trim();
              return current;
            })
          }
        />
      </label>

      <div className="publish-meta-grid">
        <label className="binding-field" data-validation-field="alias">
          <span className="binding-label">Alias</span>
          <input
            className="trace-text-input"
            value={endpoint.alias ?? ""}
            placeholder={endpoint.id}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) =>
                assignOptionalString(current, "alias", event.target.value)
              )
            }
          />
        </label>

        <label className="binding-field" data-validation-field="path">
          <span className="binding-label">Path</span>
          <input
            className="trace-text-input"
            value={endpoint.path ?? ""}
            placeholder={`/${endpoint.id}`}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) =>
                assignOptionalString(current, "path", event.target.value)
              )
            }
          />
        </label>
      </div>

      <div className="publish-meta-grid">
        <label className="binding-field" data-validation-field="protocol">
          <span className="binding-label">Protocol</span>
          <select
            className="binding-select"
            value={endpoint.protocol}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) => {
                current.protocol = toEnumValue(event.target.value, PUBLISH_PROTOCOLS, "native");
                return current;
              })
            }
          >
            {PUBLISH_PROTOCOLS.map((protocol) => (
              <option key={`${endpoint.id}-${protocol}`} value={protocol}>
                {protocol}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field" data-validation-field="authMode">
          <span className="binding-label">Auth mode</span>
          <select
            className="binding-select"
            value={endpoint.authMode}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) => {
                current.authMode = toEnumValue(event.target.value, AUTH_MODES, "api_key");
                return current;
              })
            }
          >
            {AUTH_MODES.map((authMode) => (
              <option key={`${endpoint.id}-${authMode}`} value={authMode}>
                {authMode}
              </option>
            ))}
          </select>
        </label>

        <label className="binding-field" data-validation-field="workflowVersion">
          <span className="binding-label">Workflow version</span>
          <input
            className="trace-text-input"
            value={endpoint.workflowVersion ?? ""}
            placeholder={workflowVersion}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) =>
                assignOptionalString(current, "workflowVersion", event.target.value)
              )
            }
          />
        </label>
      </div>

      <p className="section-copy entry-copy">
        `workflowVersion` 留空时会跟随当前保存出来的 workflow version；只有填写语义版本时才会把 endpoint 固定到指定版本。
      </p>

      {endpoint.workflowVersion ? (
        <div className="binding-actions">
          <button
            className="sync-button secondary-button"
            type="button"
            onClick={() =>
              onUpdateEndpoint(endpointIndex, (current) => {
                delete current.workflowVersion;
                return current;
              })
            }
          >
            跟随当前 workflow 版本
          </button>
        </div>
      ) : null}

      <label className="binding-field" data-validation-field="streaming">
        <span className="binding-label">Streaming</span>
        <input
          type="checkbox"
          checked={endpoint.streaming}
          onChange={(event) =>
            onUpdateEndpoint(endpointIndex, (current) => {
              current.streaming = event.target.checked;
              return current;
            })
          }
        />
      </label>

      <label className="binding-field" data-validation-field="inputSchema">
        <span className="binding-label">Input schema JSON</span>
        <textarea
          key={`${endpoint.id}-input-schema-${JSON.stringify(endpoint.inputSchema)}`}
          className="editor-json-area"
          defaultValue={stringifyJson(endpoint.inputSchema)}
          onBlur={(event) => onApplySchemaField(endpointIndex, "inputSchema", event.target.value)}
        />
      </label>

      <label className="binding-field" data-validation-field="outputSchema">
        <span className="binding-label">Output schema JSON</span>
        <textarea
          key={`${endpoint.id}-output-schema-${JSON.stringify(endpoint.outputSchema ?? {})}`}
          className="editor-json-area"
          defaultValue={stringifyJson(endpoint.outputSchema ?? {})}
          onBlur={(event) => onApplySchemaField(endpointIndex, "outputSchema", event.target.value)}
        />
      </label>

      <div className="binding-field compact-stack">
        <span className="binding-label">Rate limit</span>
        <label>
          <input
            type="checkbox"
            checked={Boolean(endpoint.rateLimit)}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) => {
                if (!event.target.checked) {
                  delete current.rateLimit;
                  return current;
                }

                current.rateLimit = {
                  requests: 60,
                  windowSeconds: 60
                };
                return current;
              })
            }
          />
          <span>启用 rate limit</span>
        </label>

        {endpoint.rateLimit ? (
          <div className="publish-meta-grid">
            <label className="binding-field" data-validation-field="rateLimit.requests">
              <span className="binding-label">Requests</span>
              <input
                className="trace-text-input"
                inputMode="numeric"
                value={String(endpoint.rateLimit.requests)}
                onChange={(event) =>
                  onUpdateEndpoint(endpointIndex, (current) => {
                    const parsed = parsePositiveInteger(event.target.value);
                    const rateLimit = toRecord(current.rateLimit) ?? {};
                    rateLimit.requests = parsed ?? endpoint.rateLimit?.requests ?? 60;
                    current.rateLimit = rateLimit;
                    return current;
                  })
                }
              />
            </label>

            <label className="binding-field" data-validation-field="rateLimit.windowSeconds">
              <span className="binding-label">Window seconds</span>
              <input
                className="trace-text-input"
                inputMode="numeric"
                value={String(endpoint.rateLimit.windowSeconds)}
                onChange={(event) =>
                  onUpdateEndpoint(endpointIndex, (current) => {
                    const parsed = parsePositiveInteger(event.target.value);
                    const rateLimit = toRecord(current.rateLimit) ?? {};
                    rateLimit.windowSeconds = parsed ?? endpoint.rateLimit?.windowSeconds ?? 60;
                    current.rateLimit = rateLimit;
                    return current;
                  })
                }
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="binding-field compact-stack">
        <span className="binding-label">Cache</span>
        <label>
          <input
            type="checkbox"
            checked={Boolean(endpoint.cache)}
            onChange={(event) =>
              onUpdateEndpoint(endpointIndex, (current) => {
                if (!event.target.checked) {
                  delete current.cache;
                  return current;
                }

                current.cache = {
                  enabled: true,
                  ttl: 60,
                  maxEntries: 128,
                  varyBy: []
                };
                return current;
              })
            }
          />
          <span>启用 cache policy</span>
        </label>

        {endpoint.cache ? (
          <>
            <div className="publish-meta-grid">
              <label className="binding-field" data-validation-field="cache.enabled">
                <span className="binding-label">Enabled</span>
                <input
                  type="checkbox"
                  checked={endpoint.cache.enabled}
                  onChange={(event) =>
                    onUpdateEndpoint(endpointIndex, (current) => {
                      const cache = toRecord(current.cache) ?? {};
                      cache.enabled = event.target.checked;
                      current.cache = cache;
                      return current;
                    })
                  }
                />
              </label>

              <label className="binding-field" data-validation-field="cache.ttl">
                <span className="binding-label">TTL seconds</span>
                <input
                  className="trace-text-input"
                  inputMode="numeric"
                  value={String(endpoint.cache.ttl)}
                  onChange={(event) =>
                    onUpdateEndpoint(endpointIndex, (current) => {
                      const parsed = parsePositiveInteger(event.target.value);
                      const cache = toRecord(current.cache) ?? {};
                      cache.ttl = parsed ?? endpoint.cache?.ttl ?? 60;
                      current.cache = cache;
                      return current;
                    })
                  }
                />
              </label>

              <label className="binding-field" data-validation-field="cache.maxEntries">
                <span className="binding-label">Max entries</span>
                <input
                  className="trace-text-input"
                  inputMode="numeric"
                  value={String(endpoint.cache.maxEntries)}
                  onChange={(event) =>
                    onUpdateEndpoint(endpointIndex, (current) => {
                      const parsed = parsePositiveInteger(event.target.value);
                      const cache = toRecord(current.cache) ?? {};
                      cache.maxEntries = parsed ?? endpoint.cache?.maxEntries ?? 128;
                      current.cache = cache;
                      return current;
                    })
                  }
                />
              </label>
            </div>

            <label className="binding-field">
              <span className="binding-label">Vary by</span>
              <input
                className="trace-text-input"
                value={endpoint.cache.varyBy.join(", ")}
                placeholder="input.user_id, input.locale"
                onChange={(event) =>
                  onUpdateEndpoint(endpointIndex, (current) => {
                    const cache = toRecord(current.cache) ?? {};
                    cache.varyBy = event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean);
                    current.cache = cache;
                    return current;
                  })
                }
              />
            </label>
          </>
        ) : null}
      </div>

      <button
        className="editor-danger-button"
        type="button"
        onClick={() => onDeleteEndpoint(endpointIndex)}
      >
        删除此 publish endpoint
      </button>
    </section>
  );
}

function normalizePublishFieldKey(fieldPath: string | null | undefined) {
  if (!fieldPath) {
    return "name";
  }

  if (fieldPath.startsWith("inputSchema")) {
    return "inputSchema";
  }
  if (fieldPath.startsWith("outputSchema")) {
    return "outputSchema";
  }
  if (fieldPath.startsWith("rateLimit.requests")) {
    return "rateLimit.requests";
  }
  if (fieldPath.startsWith("rateLimit.windowSeconds")) {
    return "rateLimit.windowSeconds";
  }
  if (fieldPath.startsWith("cache.enabled")) {
    return "cache.enabled";
  }
  if (fieldPath.startsWith("cache.ttl")) {
    return "cache.ttl";
  }
  if (fieldPath.startsWith("cache.maxEntries")) {
    return "cache.maxEntries";
  }

  return fieldPath;
}
