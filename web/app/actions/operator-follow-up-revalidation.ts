"use server";

import { revalidatePath } from "next/cache";

import { fetchRunSnapshots } from "./run-snapshot";

type RevalidateOperatorFollowUpPathsInput = {
  runIds?: Array<string | null | undefined>;
  workflowIds?: Array<string | null | undefined>;
};

function normalizeIds(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => item?.trim()).filter(Boolean))];
}

export function revalidateOperatorFollowUpPaths({
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
  runIds: Array<string | null | undefined>
) {
  const normalizedRunIds = normalizeIds(runIds);
  if (normalizedRunIds.length === 0) {
    revalidateOperatorFollowUpPaths({});
    return;
  }

  const runSnapshots = await fetchRunSnapshots(normalizedRunIds, normalizedRunIds.length);
  revalidateOperatorFollowUpPaths({
    runIds: normalizedRunIds,
    workflowIds: runSnapshots.map((item) => item.snapshot?.workflowId)
  });
}
