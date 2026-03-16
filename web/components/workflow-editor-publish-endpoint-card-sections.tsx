import {
  parsePositiveInteger,
  toRecord,
  type WorkflowPublishedEndpointDraft
} from "./workflow-editor-publish-form-shared";

type PublishEndpointRecordUpdater = (
  index: number,
  updater: (current: Record<string, unknown>) => Record<string, unknown>
) => void;

type WorkflowEditorPublishEndpointRateLimitSectionProps = {
  endpoint: WorkflowPublishedEndpointDraft;
  endpointIndex: number;
  onUpdateEndpoint: PublishEndpointRecordUpdater;
};

export function WorkflowEditorPublishEndpointRateLimitSection({
  endpoint,
  endpointIndex,
  onUpdateEndpoint
}: WorkflowEditorPublishEndpointRateLimitSectionProps) {
  return (
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
  );
}

type WorkflowEditorPublishEndpointCacheSectionProps = {
  endpoint: WorkflowPublishedEndpointDraft;
  endpointIndex: number;
  onUpdateEndpoint: PublishEndpointRecordUpdater;
};

export function WorkflowEditorPublishEndpointCacheSection({
  endpoint,
  endpointIndex,
  onUpdateEndpoint
}: WorkflowEditorPublishEndpointCacheSectionProps) {
  return (
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
  );
}
