import type { SensitiveAccessInboxEntry } from "@/lib/get-sensitive-access";
import type {
  WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem,
  WorkflowPublishedEndpointLegacyAuthGovernanceChecklistKey,
  WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot,
  WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem
} from "@/lib/workflow-publish-types";

const CHECKLIST_ORDER: WorkflowPublishedEndpointLegacyAuthGovernanceChecklistKey[] = [
  "draft_cleanup",
  "published_follow_up",
  "offline_inventory"
];

function pickWorkflowSummary(
  snapshot: WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot
): WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem | null {
  return snapshot.workflows[0] ?? null;
}

function appendBindings(
  target: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem[],
  items: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem[]
) {
  for (const item of items) {
    target.push(item);
  }
}

export function buildSensitiveAccessInboxLegacyAuthGovernanceSnapshot(
  entries: SensitiveAccessInboxEntry[]
): WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot | null {
  const snapshotsByWorkflowId = new Map<
    string,
    WorkflowPublishedEndpointLegacyAuthGovernanceSnapshot
  >();

  for (const entry of entries) {
    const snapshot = entry.legacyAuthGovernance ?? null;
    if (!snapshot || snapshot.binding_count <= 0) {
      continue;
    }

    const workflow = pickWorkflowSummary(snapshot);
    if (!workflow || snapshotsByWorkflowId.has(workflow.workflow_id)) {
      continue;
    }

    snapshotsByWorkflowId.set(workflow.workflow_id, snapshot);
  }

  const snapshots = Array.from(snapshotsByWorkflowId.values()).sort((left, right) => {
    const leftWorkflow = pickWorkflowSummary(left);
    const rightWorkflow = pickWorkflowSummary(right);
    return (leftWorkflow?.workflow_name ?? "").localeCompare(rightWorkflow?.workflow_name ?? "");
  });

  if (snapshots.length === 0) {
    return null;
  }

  const checklistByKey = new Map<
    WorkflowPublishedEndpointLegacyAuthGovernanceChecklistKey,
    WorkflowPublishedEndpointLegacyAuthGovernanceChecklistItem
  >();
  const workflows: WorkflowPublishedEndpointLegacyAuthGovernanceWorkflowItem[] = [];
  const draftCandidates: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem[] = [];
  const publishedBlockers: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem[] = [];
  const offlineInventory: WorkflowPublishedEndpointLegacyAuthGovernanceBindingItem[] = [];

  let bindingCount = 0;
  let draftCandidateCount = 0;
  let publishedBlockerCount = 0;
  let offlineInventoryCount = 0;

  for (const snapshot of snapshots) {
    bindingCount += snapshot.binding_count;
    draftCandidateCount += snapshot.summary.draft_candidate_count;
    publishedBlockerCount += snapshot.summary.published_blocker_count;
    offlineInventoryCount += snapshot.summary.offline_inventory_count;
    workflows.push(...snapshot.workflows);
    appendBindings(draftCandidates, snapshot.buckets.draft_candidates);
    appendBindings(publishedBlockers, snapshot.buckets.published_blockers);
    appendBindings(offlineInventory, snapshot.buckets.offline_inventory);

    for (const item of snapshot.checklist) {
      const existing = checklistByKey.get(item.key);
      if (!existing) {
        checklistByKey.set(item.key, { ...item });
        continue;
      }

      checklistByKey.set(item.key, {
        ...existing,
        count: existing.count + item.count
      });
    }
  }

  return {
    generated_at: snapshots[0].generated_at,
    workflow_count: workflows.length,
    binding_count: bindingCount,
    summary: {
      draft_candidate_count: draftCandidateCount,
      published_blocker_count: publishedBlockerCount,
      offline_inventory_count: offlineInventoryCount
    },
    checklist: CHECKLIST_ORDER.flatMap((key) => {
      const item = checklistByKey.get(key);
      return item ? [item] : [];
    }),
    workflows,
    buckets: {
      draft_candidates: draftCandidates,
      published_blockers: publishedBlockers,
      offline_inventory: offlineInventory
    }
  };
}
