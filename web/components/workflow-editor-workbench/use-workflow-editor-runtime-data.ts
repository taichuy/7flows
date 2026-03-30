"use client";

import { useEffect, useState } from "react";

import { getCredentials, type CredentialItem } from "@/lib/get-credentials";
import { getWorkflowRuns, type WorkflowRunListItem } from "@/lib/get-workflow-runs";

type UseWorkflowEditorRuntimeDataOptions = {
  workflowId: string;
  initialCredentials?: CredentialItem[];
  initialRecentRuns?: WorkflowRunListItem[];
  loadCredentials?: boolean;
  loadRecentRuns?: boolean;
};

type RuntimeDataState = {
  credentials: CredentialItem[];
  recentRuns: WorkflowRunListItem[];
};

type IdleCallbackHandle = number;
type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;

function scheduleRuntimeDataLoad(callback: IdleCallback): IdleCallbackHandle {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 1200 });
  }

  return window.setTimeout(
    () =>
      callback({
        didTimeout: false,
        timeRemaining: () => 0
      }),
    0
  );
}

function cancelRuntimeDataLoad(handle: IdleCallbackHandle) {
  if (typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
}

export function useWorkflowEditorRuntimeData({
  workflowId,
  initialCredentials = [],
  initialRecentRuns = [],
  loadCredentials = true,
  loadRecentRuns = true
}: UseWorkflowEditorRuntimeDataOptions): RuntimeDataState {
  const [credentials, setCredentials] = useState(initialCredentials);
  const [recentRuns, setRecentRuns] = useState(initialRecentRuns);

  useEffect(() => {
    if (!loadCredentials) {
      return;
    }

    let active = true;
    const handle = scheduleRuntimeDataLoad(() => {
      void getCredentials(true).then((nextCredentials) => {
        if (!active) {
          return;
        }

        setCredentials(nextCredentials);
      });
    });

    return () => {
      active = false;
      cancelRuntimeDataLoad(handle);
    };
  }, [loadCredentials]);

  useEffect(() => {
    if (!loadRecentRuns) {
      return;
    }

    let active = true;
    const handle = scheduleRuntimeDataLoad(() => {
      void getWorkflowRuns(workflowId).then((nextRecentRuns) => {
        if (!active) {
          return;
        }

        setRecentRuns(nextRecentRuns);
      });
    });

    return () => {
      active = false;
      cancelRuntimeDataLoad(handle);
    };
  }, [loadRecentRuns, workflowId]);

  return {
    credentials,
    recentRuns
  };
}
