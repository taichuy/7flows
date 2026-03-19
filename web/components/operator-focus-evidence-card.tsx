import type {
  ExecutionFocusArtifactPreview,
  ExecutionFocusToolCallSummary
} from "@/lib/run-execution-focus-presenters";

type OperatorFocusEvidenceCardProps = {
  title?: string;
  artifactSummary?: string | null;
  artifactCount?: number;
  artifactRefCount?: number;
  toolCallCount?: number;
  toolCallSummaries: ExecutionFocusToolCallSummary[];
  artifacts: ExecutionFocusArtifactPreview[];
};

export function OperatorFocusEvidenceCard({
  title = "Focused tool execution",
  artifactSummary = null,
  artifactCount,
  artifactRefCount = 0,
  toolCallCount,
  toolCallSummaries,
  artifacts
}: OperatorFocusEvidenceCardProps) {
  if (!artifactSummary && toolCallSummaries.length === 0 && artifacts.length === 0) {
    return null;
  }

  const resolvedArtifactCount = artifactCount ?? artifacts.length;
  const resolvedToolCallCount = toolCallCount ?? toolCallSummaries.length;

  return (
    <div className="event-list">
      <div className="entry-card compact-card">
        <div className="payload-card-header">
          <span className="status-meta">{title}</span>
          {resolvedToolCallCount > 0 ? (
            <span className="event-chip">tool calls {resolvedToolCallCount}</span>
          ) : null}
          {artifactRefCount > 0 ? (
            <span className="event-chip">artifact refs {artifactRefCount}</span>
          ) : null}
          {resolvedArtifactCount > 0 ? (
            <span className="event-chip">artifacts {resolvedArtifactCount}</span>
          ) : null}
        </div>
        {artifactSummary ? <p className="section-copy entry-copy">{artifactSummary}</p> : null}
        {toolCallSummaries.length > 0 ? (
          <div className="event-list">
            {toolCallSummaries.map((toolCall) => (
              <article className="event-row compact-card" key={toolCall.id}>
                <div className="payload-card-header">
                  <span className="status-meta">{toolCall.title}</span>
                  {toolCall.rawRef ? <span className="event-chip">raw ref</span> : null}
                </div>
                {toolCall.badges.length > 0 ? (
                  <div className="tool-badge-row">
                    {toolCall.badges.map((badge) => (
                      <span className="event-chip" key={`${toolCall.id}:${badge}`}>
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="section-copy entry-copy">{toolCall.detail}</p>
                {toolCall.rawRef ? <p className="binding-meta">raw_ref {toolCall.rawRef}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
        {resolvedToolCallCount > toolCallSummaries.length && toolCallSummaries.length > 0 ? (
          <p className="binding-meta">
            当前仅展示前 {toolCallSummaries.length} 条 tool call 预览，其余 evidence 请回到 run detail。
          </p>
        ) : null}
        {artifacts.length > 0 ? (
          <div className="event-list">
            {artifacts.map((artifact) => (
              <article className="event-row compact-card" key={artifact.key}>
                <div className="event-meta">
                  <span>{artifact.artifactKind}</span>
                  <span>{artifact.contentType ?? "unknown"}</span>
                </div>
                {artifact.summary ? <p className="section-copy entry-copy">{artifact.summary}</p> : null}
                {artifact.uri ? <p className="binding-meta">{artifact.uri}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
        {resolvedArtifactCount > artifacts.length && artifacts.length > 0 ? (
          <p className="binding-meta">
            当前仅展示前 {artifacts.length} 条 artifact 预览，其余 evidence 请回到 run detail。
          </p>
        ) : null}
      </div>
    </div>
  );
}
