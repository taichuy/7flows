"use client";

import { useState } from "react";

type WorkflowEditorPublishFormProps = {
  workflowVersion: string;
  publishEndpoints: Array<Record<string, unknown>>;
  onChange: (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => void;
};

type WorkflowPublishedEndpointDraft = {
  id: string;
  name: string;
  alias?: string;
  path?: string;
  protocol: "native" | "openai" | "anthropic";
  workflowVersion?: string;
  authMode: "api_key" | "token" | "internal";
  streaming: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  rateLimit?: {
    requests: number;
    windowSeconds: number;
  };
  cache?: {
    enabled: boolean;
    ttl: number;
    maxEntries: number;
    varyBy: string[];
  };
};

const PUBLISH_PROTOCOLS = ["native", "openai", "anthropic"] as const;
const AUTH_MODES = ["api_key", "token", "internal"] as const;

export function WorkflowEditorPublishForm({
  workflowVersion,
  publishEndpoints,
  onChange
}: WorkflowEditorPublishFormProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const normalizedEndpoints = publishEndpoints.map((endpoint, index) =>
    normalizePublishedEndpoint(endpoint, index)
  );

  const commit = (
    nextPublish: Array<Record<string, unknown>>,
    options?: { successMessage?: string }
  ) => {
    setFeedback(null);
    onChange(nextPublish, options);
  };

  const updateEndpoint = (
    index: number,
    updater: (current: Record<string, unknown>) => Record<string, unknown>
  ) => {
    commit(
      publishEndpoints.map((endpoint, endpointIndex) =>
        endpointIndex === index ? updater(cloneRecord(endpoint)) : cloneRecord(endpoint)
      )
    );
  };

  const handleAddEndpoint = () => {
    const nextId = createUniqueEndpointId(normalizedEndpoints.map((endpoint) => endpoint.id));
    const nextEndpoint: Record<string, unknown> = {
      id: nextId,
      name: `Endpoint ${normalizedEndpoints.length + 1}`,
      alias: nextId,
      path: `/${nextId}`,
      protocol: "native",
      workflowVersion,
      authMode: "api_key",
      streaming: true,
      inputSchema: {},
      outputSchema: {},
      rateLimit: {
        requests: 60,
        windowSeconds: 60
      }
    };

    commit([...publishEndpoints.map(cloneRecord), nextEndpoint], {
      successMessage: `已新增 publish endpoint ${nextId}。`
    });
  };

  const handleDeleteEndpoint = (index: number) => {
    const endpoint = normalizedEndpoints[index];
    commit(
      publishEndpoints
        .filter((_, endpointIndex) => endpointIndex !== index)
        .map(cloneRecord),
      {
        successMessage: `已移除 publish endpoint ${endpoint?.id ?? index + 1}。`
      }
    );
  };

  const applySchemaField = (
    endpointIndex: number,
    field: "inputSchema" | "outputSchema",
    value: string
  ) => {
    const normalized = value.trim();

    if (!normalized) {
      updateEndpoint(endpointIndex, (endpoint) => {
        if (field === "inputSchema") {
          endpoint.inputSchema = {};
        } else {
          delete endpoint.outputSchema;
        }
        return endpoint;
      });
      return;
    }

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (!isRecord(parsed)) {
        throw new Error(`${field} 必须是 JSON 对象。`);
      }
      updateEndpoint(endpointIndex, (endpoint) => {
        endpoint[field] = parsed;
        return endpoint;
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : `${field} 不是合法 JSON。`);
    }
  };

  return (
    <article className="diagnostic-panel editor-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Workflow publish</p>
          <h2>Published endpoints</h2>
        </div>
      </div>

      <p className="section-copy">
        直接在 workflow definition 里维护发布入口，先把协议、鉴权、schema 与缓存策略收敛到同一处；真正发布和 API key 治理仍走独立 publish 页面。
      </p>

      <div className="tool-badge-row">
        <span className="event-chip">draft count {normalizedEndpoints.length}</span>
        <span className="event-chip">current workflow version {workflowVersion}</span>
      </div>

      <div className="binding-actions">
        <button className="sync-button" type="button" onClick={handleAddEndpoint}>
          新增 publish endpoint
        </button>
      </div>

      {normalizedEndpoints.length > 0 ? (
        <div className="binding-form compact-stack">
          {normalizedEndpoints.map((endpoint, endpointIndex) => (
            <section className="entry-card compact-card" key={endpoint.id}>
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
                <span className="event-chip">
                  {endpoint.streaming ? "streaming" : "non-streaming"}
                </span>
              </div>

              <label className="binding-field">
                <span className="binding-label">Name</span>
                <input
                  className="trace-text-input"
                  value={endpoint.name}
                  onChange={(event) =>
                    updateEndpoint(endpointIndex, (current) => {
                      current.name = event.target.value;
                      return current;
                    })
                  }
                />
              </label>

              <label className="binding-field">
                <span className="binding-label">Endpoint id</span>
                <input
                  className="trace-text-input"
                  value={endpoint.id}
                  onChange={(event) =>
                    updateEndpoint(endpointIndex, (current) => {
                      current.id = event.target.value;
                      return current;
                    })
                  }
                />
              </label>

              <div className="publish-meta-grid">
                <label className="binding-field">
                  <span className="binding-label">Alias</span>
                  <input
                    className="trace-text-input"
                    value={endpoint.alias ?? ""}
                    placeholder={endpoint.id}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) =>
                        assignOptionalString(current, "alias", event.target.value)
                      )
                    }
                  />
                </label>

                <label className="binding-field">
                  <span className="binding-label">Path</span>
                  <input
                    className="trace-text-input"
                    value={endpoint.path ?? ""}
                    placeholder={`/${endpoint.id}`}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) =>
                        assignOptionalString(current, "path", event.target.value)
                      )
                    }
                  />
                </label>
              </div>

              <div className="publish-meta-grid">
                <label className="binding-field">
                  <span className="binding-label">Protocol</span>
                  <select
                    className="binding-select"
                    value={endpoint.protocol}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) => {
                        current.protocol = event.target.value;
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

                <label className="binding-field">
                  <span className="binding-label">Auth mode</span>
                  <select
                    className="binding-select"
                    value={endpoint.authMode}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) => {
                        current.authMode = event.target.value;
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

                <label className="binding-field">
                  <span className="binding-label">Workflow version</span>
                  <input
                    className="trace-text-input"
                    value={endpoint.workflowVersion ?? ""}
                    placeholder={workflowVersion}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) =>
                        assignOptionalString(current, "workflowVersion", event.target.value)
                      )
                    }
                  />
                </label>
              </div>

              <label className="binding-field">
                <span className="binding-label">Streaming</span>
                <input
                  type="checkbox"
                  checked={endpoint.streaming}
                  onChange={(event) =>
                    updateEndpoint(endpointIndex, (current) => {
                      current.streaming = event.target.checked;
                      return current;
                    })
                  }
                />
              </label>

              <label className="binding-field">
                <span className="binding-label">Input schema JSON</span>
                <textarea
                  key={`${endpoint.id}-input-schema-${JSON.stringify(endpoint.inputSchema)}`}
                  className="editor-json-area"
                  defaultValue={stringifyJson(endpoint.inputSchema)}
                  onBlur={(event) =>
                    applySchemaField(endpointIndex, "inputSchema", event.target.value)
                  }
                />
              </label>

              <label className="binding-field">
                <span className="binding-label">Output schema JSON</span>
                <textarea
                  key={`${endpoint.id}-output-schema-${JSON.stringify(endpoint.outputSchema ?? {})}`}
                  className="editor-json-area"
                  defaultValue={stringifyJson(endpoint.outputSchema ?? {})}
                  onBlur={(event) =>
                    applySchemaField(endpointIndex, "outputSchema", event.target.value)
                  }
                />
              </label>

              <div className="binding-field compact-stack">
                <span className="binding-label">Rate limit</span>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(endpoint.rateLimit)}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) => {
                        if (!event.target.checked) {
                          delete current.rateLimit;
                          return current;
                        }

                        current.rateLimit = endpoint.rateLimit ?? {
                          requests: 60,
                          windowSeconds: 60
                        };
                        return current;
                      })
                    }
                  />{" "}
                  enable rate limit
                </label>

                {endpoint.rateLimit ? (
                  <div className="publish-meta-grid">
                    <label className="binding-field">
                      <span className="binding-label">Requests</span>
                      <input
                        className="trace-text-input"
                        type="number"
                        min={1}
                        step={1}
                        value={String(endpoint.rateLimit.requests)}
                        onChange={(event) =>
                          updateEndpoint(endpointIndex, (current) => {
                            const rateLimit = toRecord(current.rateLimit) ?? {};
                            const nextValue = parsePositiveInteger(event.target.value);
                            if (nextValue !== undefined) {
                              rateLimit.requests = nextValue;
                            }
                            current.rateLimit = rateLimit;
                            return current;
                          })
                        }
                      />
                    </label>

                    <label className="binding-field">
                      <span className="binding-label">Window seconds</span>
                      <input
                        className="trace-text-input"
                        type="number"
                        min={1}
                        step={1}
                        value={String(endpoint.rateLimit.windowSeconds)}
                        onChange={(event) =>
                          updateEndpoint(endpointIndex, (current) => {
                            const rateLimit = toRecord(current.rateLimit) ?? {};
                            const nextValue = parsePositiveInteger(event.target.value);
                            if (nextValue !== undefined) {
                              rateLimit.windowSeconds = nextValue;
                            }
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
                <span className="binding-label">Cache policy</span>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(endpoint.cache)}
                    onChange={(event) =>
                      updateEndpoint(endpointIndex, (current) => {
                        if (!event.target.checked) {
                          delete current.cache;
                          return current;
                        }

                        current.cache = endpoint.cache ?? {
                          enabled: true,
                          ttl: 60,
                          maxEntries: 128,
                          varyBy: []
                        };
                        return current;
                      })
                    }
                  />{" "}
                  enable cache
                </label>

                {endpoint.cache ? (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={endpoint.cache.enabled}
                        onChange={(event) =>
                          updateEndpoint(endpointIndex, (current) => {
                            const cache = toRecord(current.cache) ?? {};
                            cache.enabled = event.target.checked;
                            current.cache = cache;
                            return current;
                          })
                        }
                      />{" "}
                      cache enabled
                    </label>

                    <div className="publish-meta-grid">
                      <label className="binding-field">
                        <span className="binding-label">TTL seconds</span>
                        <input
                          className="trace-text-input"
                          type="number"
                          min={1}
                          step={1}
                          value={String(endpoint.cache.ttl)}
                          onChange={(event) =>
                            updateEndpoint(endpointIndex, (current) => {
                              const cache = toRecord(current.cache) ?? {};
                              const nextValue = parsePositiveInteger(event.target.value);
                              if (nextValue !== undefined) {
                                cache.ttl = nextValue;
                              }
                              current.cache = cache;
                              return current;
                            })
                          }
                        />
                      </label>

                      <label className="binding-field">
                        <span className="binding-label">Max entries</span>
                        <input
                          className="trace-text-input"
                          type="number"
                          min={1}
                          step={1}
                          value={String(endpoint.cache.maxEntries)}
                          onChange={(event) =>
                            updateEndpoint(endpointIndex, (current) => {
                              const cache = toRecord(current.cache) ?? {};
                              const nextValue = parsePositiveInteger(event.target.value);
                              if (nextValue !== undefined) {
                                cache.maxEntries = nextValue;
                              }
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
                          updateEndpoint(endpointIndex, (current) => {
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
                onClick={() => handleDeleteEndpoint(endpointIndex)}
              >
                删除此 publish endpoint
              </button>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-state compact">
          当前 workflow definition 还没有 publish endpoint，先在这里补 draft，再到 publish 页面做正式发布和治理。
        </p>
      )}

      {feedback ? <p className="sync-message error">{feedback}</p> : null}
    </article>
  );
}

function normalizePublishedEndpoint(
  endpoint: Record<string, unknown>,
  index: number
): WorkflowPublishedEndpointDraft {
  const rateLimit = toRecord(endpoint.rateLimit);
  const cache = toRecord(endpoint.cache);

  return {
    id: toNonEmptyString(endpoint.id, `endpoint_${index + 1}`),
    name: toNonEmptyString(endpoint.name, `Endpoint ${index + 1}`),
    alias: toOptionalString(endpoint.alias),
    path: toOptionalString(endpoint.path),
    protocol: toEnumValue(endpoint.protocol, PUBLISH_PROTOCOLS, "native"),
    workflowVersion: toOptionalString(endpoint.workflowVersion),
    authMode: toEnumValue(endpoint.authMode, AUTH_MODES, "api_key"),
    streaming: typeof endpoint.streaming === "boolean" ? endpoint.streaming : true,
    inputSchema: toRecord(endpoint.inputSchema) ?? {},
    outputSchema: toRecord(endpoint.outputSchema) ?? undefined,
    rateLimit: rateLimit
      ? {
          requests: toPositiveInteger(rateLimit.requests, 60),
          windowSeconds: toPositiveInteger(rateLimit.windowSeconds, 60)
        }
      : undefined,
    cache: cache
      ? {
          enabled: typeof cache.enabled === "boolean" ? cache.enabled : true,
          ttl: toPositiveInteger(cache.ttl, 60),
          maxEntries: toPositiveInteger(cache.maxEntries, 128),
          varyBy: toStringArray(cache.varyBy)
        }
      : undefined
  };
}

function createUniqueEndpointId(existingIds: string[]) {
  const seen = new Set(existingIds.map((value) => value.trim()).filter(Boolean));
  let index = Math.max(existingIds.length, 0) + 1;
  let candidate = `endpoint_${index}`;

  while (seen.has(candidate)) {
    index += 1;
    candidate = `endpoint_${index}`;
  }

  return candidate;
}

function assignOptionalString(
  record: Record<string, unknown>,
  field: string,
  value: string
) {
  const normalized = value.trim();
  if (!normalized) {
    delete record[field];
    return record;
  }
  record[field] = normalized;
  return record;
}

function cloneRecord(value: Record<string, unknown>) {
  return structuredClone(value);
}

function toRecord(value: unknown) {
  return isRecord(value) ? { ...value } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toNonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function toPositiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function parsePositiveInteger(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function toEnumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number]
): T[number] {
  return typeof value === "string" && options.includes(value as T[number])
    ? (value as T[number])
    : fallback;
}
