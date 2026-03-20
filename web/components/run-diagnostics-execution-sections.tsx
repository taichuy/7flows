import type {
  CallbackWaitingAutomationCheck,
  SandboxReadinessCheck
} from "@/lib/get-system-overview";
import type { RunEvidenceView, RunExecutionView } from "@/lib/get-run-views";

import { EvidenceNodeCard } from "@/components/run-diagnostics-execution/evidence-node-card";
import { ExecutionNodeCard } from "@/components/run-diagnostics-execution/execution-node-card";
import { RunDiagnosticsEvidenceOverview } from "@/components/run-diagnostics-execution/evidence-overview";
import { RunDiagnosticsExecutionOverview } from "@/components/run-diagnostics-execution/execution-overview";

type RunDiagnosticsExecutionSectionsProps = {
  executionView: RunExecutionView | null;
  evidenceView: RunEvidenceView | null;
  callbackWaitingAutomation: CallbackWaitingAutomationCheck;
  sandboxReadiness?: SandboxReadinessCheck | null;
};

export function RunDiagnosticsExecutionSections({
  executionView,
  evidenceView,
  callbackWaitingAutomation,
  sandboxReadiness = null
}: RunDiagnosticsExecutionSectionsProps) {
  return (
    <>
      <section className="diagnostics-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Execution View</p>
              <h2>Runtime facts by node</h2>
            </div>
            <p className="section-copy">
              This panel aggregates `run_artifacts`, tool calls, AI calls and callback tickets so the
              operator can see what actually happened during the run.
            </p>
          </div>

          <RunDiagnosticsExecutionOverview
            executionView={executionView}
            callbackWaitingAutomation={callbackWaitingAutomation}
            sandboxReadiness={sandboxReadiness}
          />
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Evidence View</p>
              <h2>Assistant distilled context</h2>
            </div>
            <p className="section-copy">
              This layer keeps the assistant summary and supporting refs visible without replaying every
              large raw payload in the same panel.
            </p>
          </div>

          <RunDiagnosticsEvidenceOverview evidenceView={evidenceView} />
        </article>
      </section>

      <section className="diagnostics-layout">
        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Execution Timeline</p>
              <h2>Artifacts, tool calls, approvals and callback lifecycle</h2>
            </div>
            <p className="section-copy">
              Each node row keeps execution policy, sensitive access decisions, callback waiting lifecycle
              and produced artifacts in a stable timeline layout.
            </p>
          </div>

          {!executionView ? (
            <p className="empty-state">Execution view is unavailable for this run.</p>
          ) : executionView.nodes.length === 0 ? (
            <p className="empty-state">No execution nodes are available for this run yet.</p>
          ) : (
            <div className="timeline-list">
              {executionView.nodes.map((node) => (
                <ExecutionNodeCard
                  key={node.node_run_id}
                  node={node}
                  runId={executionView.run_id}
                  callbackWaitingAutomation={callbackWaitingAutomation}
                  sandboxReadiness={sandboxReadiness}
                  skillTrace={executionView.skill_trace ?? null}
                />
              ))}
            </div>
          )}
        </article>

        <article className="diagnostic-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Evidence Nodes</p>
              <h2>Decision basis and supporting refs</h2>
            </div>
            <p className="section-copy">
              Evidence nodes surface summary, key points, unknowns and supporting refs so debugging can
              stay anchored on the assistant-facing decision basis.
            </p>
          </div>

          {!evidenceView ? (
            <p className="empty-state">Evidence view is unavailable for this run.</p>
          ) : evidenceView.nodes.length === 0 ? (
            <p className="empty-state">No evidence nodes are available for this run yet.</p>
          ) : (
            <div className="timeline-list">
              {evidenceView.nodes.map((node) => (
                <EvidenceNodeCard key={node.node_run_id} node={node} />
              ))}
            </div>
          )}
        </article>
      </section>
    </>
  );
}
