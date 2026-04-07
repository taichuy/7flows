"use client";

import { useEffect, useState } from "react";

import type { RunSnapshotWithId } from "@/app/actions/run-snapshot";
import { fetchRunSnapshotWithContext } from "@/app/actions/run-snapshot";
import type { RunDetail } from "@/lib/get-run-detail";
import type { RunTrace } from "@/lib/get-run-trace";
import { getWorkflowRuns, type WorkflowRunListItem } from "@/lib/get-workflow-runs";

import { fetchRunDetail, fetchRunTrace } from "./run-overlay";

type UseWorkflowRunOverlayOptions = {
  workflowId: string;
  recentRuns: WorkflowRunListItem[];
  enabled?: boolean;
};

export function useWorkflowRunOverlay({
  workflowId,
  recentRuns,
  enabled = true
}: UseWorkflowRunOverlayOptions) {
  const [availableRuns, setAvailableRuns] = useState(recentRuns);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(recentRuns[0]?.id ?? null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<RunDetail | null>(null);
  const [selectedRunSnapshot, setSelectedRunSnapshot] = useState<RunSnapshotWithId | null>(null);
  const [selectedRunTrace, setSelectedRunTrace] = useState<RunTrace | null>(null);
  const [runOverlayError, setRunOverlayError] = useState<string | null>(null);
  const [isLoadingRunOverlay, setIsLoadingRunOverlay] = useState(false);
  const [isRefreshingRuns, setIsRefreshingRuns] = useState(false);

  useEffect(() => {
    setAvailableRuns(recentRuns);
    setSelectedRunId(recentRuns[0]?.id ?? null);
    setSelectedRunDetail(null);
    setSelectedRunSnapshot(null);
    setSelectedRunTrace(null);
    setRunOverlayError(null);
    setIsLoadingRunOverlay(false);
    setIsRefreshingRuns(false);
  }, [recentRuns, workflowId]);

  useEffect(() => {
    let isCancelled = false;
    const shouldLoadSelectedRun = enabled || Boolean(selectedRunId);

    if (!selectedRunId || !shouldLoadSelectedRun) {
      setSelectedRunDetail(null);
      setSelectedRunSnapshot(null);
      setSelectedRunTrace(null);
      setRunOverlayError(null);
      setIsLoadingRunOverlay(false);
      return () => {
        isCancelled = true;
      };
    }

    setIsLoadingRunOverlay(true);

    void Promise.all([
      fetchRunDetail(selectedRunId),
      fetchRunSnapshotWithContext(selectedRunId),
      fetchRunTrace(selectedRunId)
    ]).then(([runDetail, runSnapshot, traceResult]) => {
        if (isCancelled) {
          return;
        }

        setSelectedRunDetail(runDetail);
        setSelectedRunSnapshot(runSnapshot);
        setSelectedRunTrace(traceResult.trace);
        setRunOverlayError(traceResult.errorMessage);
        setIsLoadingRunOverlay(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [enabled, selectedRunId]);

  const refreshRecentRuns = async () => {
    setIsRefreshingRuns(true);
    const refreshedRuns = await getWorkflowRuns(workflowId);
    setAvailableRuns(refreshedRuns);
    setSelectedRunId((currentRunId) => {
      if (currentRunId && refreshedRuns.some((run) => run.id === currentRunId)) {
        return currentRunId;
      }
      return refreshedRuns[0]?.id ?? null;
    });
    setIsRefreshingRuns(false);
  };

  return {
    availableRuns,
    selectedRunId,
    setSelectedRunId,
    selectedRunDetail,
    selectedRunSnapshot,
    selectedRunTrace,
    runOverlayError,
    isLoadingRunOverlay,
    isRefreshingRuns,
    refreshRecentRuns
  };
}
