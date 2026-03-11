import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunDiagnosticsPanel } from "@/components/run-diagnostics-panel";
import { getRunDetail } from "@/lib/get-run-detail";
import {
  getRunEvidenceView,
  getRunExecutionView
} from "@/lib/get-run-views";
import {
  getRunTrace,
  parseRunTraceSearchParams
} from "@/lib/get-run-trace";

type RunDiagnosticsPageProps = {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params
}: RunDiagnosticsPageProps): Promise<Metadata> {
  const { runId } = await params;

  return {
    title: `Run ${runId} | 7Flows Studio`
  };
}

export default async function RunDiagnosticsPage({
  params,
  searchParams
}: RunDiagnosticsPageProps) {
  const { runId } = await params;
  const traceQuery = parseRunTraceSearchParams((await searchParams) ?? {});
  const [run, traceResult, executionView, evidenceView] = await Promise.all([
    getRunDetail(runId),
    getRunTrace(runId, traceQuery),
    getRunExecutionView(runId),
    getRunEvidenceView(runId)
  ]);

  if (!run) {
    notFound();
  }

  return (
    <RunDiagnosticsPanel
      run={run}
      trace={traceResult.trace}
      traceError={traceResult.errorMessage}
      traceQuery={traceQuery}
      executionView={executionView}
      evidenceView={evidenceView}
    />
  );
}
