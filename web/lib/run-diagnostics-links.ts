import { buildRunDetailHref } from "@/lib/workbench-links";

export const RUN_DIAGNOSTICS_EXECUTION_VIEW_SECTION_ID = "run-diagnostics-execution-view";
export const RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID =
  "run-diagnostics-execution-timeline";

function buildRunDiagnosticsSectionHref(runId: string, sectionId: string) {
  return `${buildRunDetailHref(runId)}#${sectionId}`;
}

export function buildRunDiagnosticsExecutionViewHref(runId: string) {
  return buildRunDiagnosticsSectionHref(runId, RUN_DIAGNOSTICS_EXECUTION_VIEW_SECTION_ID);
}

export function buildRunDiagnosticsExecutionTimelineHref(runId: string) {
  return buildRunDiagnosticsSectionHref(runId, RUN_DIAGNOSTICS_EXECUTION_TIMELINE_SECTION_ID);
}
