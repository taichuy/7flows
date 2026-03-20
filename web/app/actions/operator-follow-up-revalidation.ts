"use server";

import { revalidatePath } from "next/cache";

import { fetchRunSnapshots, type RunSnapshotWithId } from "./run-snapshot";

type RevalidateOperatorFollowUpPathsInput = {
  runIds?: Array<string | null | undefined>;
  workflowIds?: Array<string | null | undefined>;
};

function normalizeIds(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))];
}

function extractWorkflowIds(samples: RunSnapshotWithId[]) {
  return normalizeIds(samples.map((item) => item.snapshot?.workflowId));
}

export async function revalidateOperatorFollowUpPaths({
  runIds = [],
  workflowIds = []
}: RevalidateOperatorFollowUpPathsInput) {
  revalidatePath("/");
  revalidatePath("/sensitive-access");

  for (const runId of normalizeIds(runIds)) {
    revalidatePath(`/runs/${runId}`);
  }

  for (const workflowId of normalizeIds(workflowIds)) {
    revalidatePath(`/workflows/${workflowId}`);
  }
}

export async function revalidateOperatorFollowUpByRunIds(
  runIds: Array<string | null | undefined>,
  options?: {
    sampledRuns?: RunSnapshotWithId[];
  }
) {
  const normalizedRunIds = normalizeIds(runIds);
  if (normalizedRunIds.length === 0) {
    await revalidateOperatorFollowUpPaths({});
    return;
  }

  const sampledRuns = (options?.sampledRuns ?? []).filter((item) =>
    normalizedRunIds.includes(item.runId)
  );
  const resolvedRunIds = new Set(
    sampledRuns
      .filter((item) => Boolean(item.snapshot?.workflowId?.trim()))
      .map((item) => item.runId)
  );
  const missingRunIds = normalizedRunIds.filter((runId) => !resolvedRunIds.has(runId));
  const fetchedRunSnapshots =
    missingRunIds.length > 0 ? await fetchRunSnapshots(missingRunIds, missingRunIds.length) : [];

  await revalidateOperatorFollowUpPaths({
    runIds: normalizedRunIds,
    workflowIds: [...extractWorkflowIds(sampledRuns), ...extractWorkflowIds(fetchedRunSnapshots)]
  });
}
