import { getSensitiveAccessInboxSnapshot } from "@/lib/get-sensitive-access";
import { getSystemOverview } from "@/lib/get-system-overview";

type SystemOverview = Awaited<ReturnType<typeof getSystemOverview>>;
type SensitiveAccessInboxSnapshot = Awaited<ReturnType<typeof getSensitiveAccessInboxSnapshot>>;
type SandboxReadiness = SystemOverview["sandbox_readiness"];
type SandboxExecutionClassReadiness = SandboxReadiness["execution_classes"][number];
type RuntimeActivity = SystemOverview["runtime_activity"];
type RuntimeActivitySummary = RuntimeActivity["summary"];
type RecentRun = RuntimeActivity["recent_runs"][number];
type RecentRunEvent = RuntimeActivity["recent_events"][number];
type CallbackWaitingAutomation = SystemOverview["callback_waiting_automation"];
type CallbackWaitingAutomationStep = CallbackWaitingAutomation["steps"][number];
type CallbackWaitingAutomationStepSchedulerHealth =
  CallbackWaitingAutomationStep["scheduler_health"];
type SensitiveAccessInboxEntry = SensitiveAccessInboxSnapshot["entries"][number];
type SensitiveAccessTicket = SensitiveAccessInboxEntry["ticket"];
type SensitiveAccessRequest = NonNullable<SensitiveAccessInboxEntry["request"]>;
type SensitiveAccessResource = NonNullable<SensitiveAccessInboxEntry["resource"]>;
type SensitiveAccessExecutionContext = NonNullable<SensitiveAccessInboxEntry["executionContext"]>;
type SensitiveAccessExecutionFocusNode = SensitiveAccessExecutionContext["focusNode"];
type SensitiveAccessSummary = SensitiveAccessInboxSnapshot["summary"];
type SensitiveAccessBlocker = NonNullable<SensitiveAccessSummary["blockers"]>[number];

type SandboxExecutionClassReadinessFixtureOverrides =
  Partial<SandboxExecutionClassReadiness>;

type SandboxReadinessFixtureOverrides = Omit<
  Partial<SandboxReadiness>,
  "execution_classes"
> & {
  execution_classes?: SandboxExecutionClassReadiness[];
};

type RecentRunFixtureOverrides = Partial<RecentRun>;

type RecentRunEventFixtureOverrides = Partial<RecentRunEvent>;

type RuntimeActivityFixtureOverrides = Omit<
  Partial<RuntimeActivity>,
  "summary" | "recent_runs" | "recent_events"
> & {
  summary?: Partial<RuntimeActivitySummary>;
  recent_runs?: RecentRun[];
  recent_events?: RecentRunEvent[];
};

type CallbackWaitingAutomationStepFixtureOverrides = Omit<
  Partial<CallbackWaitingAutomationStep>,
  "scheduler_health"
> & {
  scheduler_health?: Partial<CallbackWaitingAutomationStepSchedulerHealth>;
};

type CallbackWaitingAutomationFixtureOverrides = Omit<
  Partial<CallbackWaitingAutomation>,
  "steps"
> & {
  steps?: CallbackWaitingAutomationStep[];
};

type SensitiveAccessSummaryFixtureOverrides = Partial<SensitiveAccessSummary>;

type SensitiveAccessBlockerFixtureOverrides = Partial<SensitiveAccessBlocker>;

type SystemOverviewFixtureOverrides = Omit<
  Partial<SystemOverview>,
  "sandbox_readiness" | "runtime_activity" | "callback_waiting_automation"
> & {
  sandbox_readiness?: SandboxReadinessFixtureOverrides;
  runtime_activity?: RuntimeActivityFixtureOverrides;
  callback_waiting_automation?: CallbackWaitingAutomationFixtureOverrides;
};

type SensitiveAccessInboxSnapshotFixtureOverrides = Omit<
  Partial<SensitiveAccessInboxSnapshot>,
  "summary"
> & {
  summary?: SensitiveAccessSummaryFixtureOverrides;
};

function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item] = (counts[item] ?? 0) + 1;
    return counts;
  }, {});
}

export function buildSandboxExecutionClassReadinessFixture(
  overrides: SandboxExecutionClassReadinessFixtureOverrides = {}
): SandboxExecutionClassReadiness {
  return {
    execution_class: "sandbox",
    available: true,
    backend_ids: ["sandbox-default"],
    supported_languages: ["python"],
    supported_profiles: ["default"],
    supported_dependency_modes: ["none"],
    supports_tool_execution: true,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: true,
    supports_filesystem_policy: true,
    reason: null,
    ...overrides
  };
}

export function buildSandboxReadinessFixture(
  overrides: SandboxReadinessFixtureOverrides = {}
): SandboxReadiness {
  const executionClasses = overrides.execution_classes ?? [];
  const defaultSnapshot: SandboxReadiness = {
    enabled_backend_count: 0,
    healthy_backend_count: 0,
    degraded_backend_count: 0,
    offline_backend_count: 0,
    execution_classes: executionClasses,
    supported_languages: [],
    supported_profiles: [],
    supported_dependency_modes: [],
    supports_tool_execution: false,
    supports_builtin_package_sets: false,
    supports_backend_extensions: false,
    supports_network_policy: false,
    supports_filesystem_policy: false,
    affected_run_count: 0,
    affected_workflow_count: 0,
    primary_blocker_kind: null,
    recommended_action: null
  };

  return {
    ...defaultSnapshot,
    ...overrides
  };
}

export function buildRecentRunFixture(overrides: RecentRunFixtureOverrides = {}): RecentRun {
  return {
    id: "run-1",
    workflow_id: "workflow-1",
    workflow_version: "1.0.0",
    status: "waiting_callback",
    created_at: "2026-03-24T08:00:00Z",
    finished_at: null,
    event_count: 1,
    ...overrides
  };
}

export function buildRecentRunEventFixture(
  overrides: RecentRunEventFixtureOverrides = {}
): RecentRunEvent {
  return {
    id: 1,
    run_id: "run-1",
    node_run_id: "node-run-1",
    event_type: "callback_waiting",
    payload_keys: ["reason"],
    payload_preview: "callback waiting",
    payload_size: 16,
    created_at: "2026-03-24T08:00:10Z",
    ...overrides
  };
}

export function buildRuntimeActivityFixture(
  overrides: RuntimeActivityFixtureOverrides = {}
): RuntimeActivity {
  const recentRuns = overrides.recent_runs ?? [];
  const recentEvents = overrides.recent_events ?? [];
  const derivedSummary: RuntimeActivitySummary = {
    recent_run_count: recentRuns.length,
    recent_event_count: recentEvents.length,
    run_statuses: countBy(recentRuns.map((run) => run.status)),
    event_types: countBy(recentEvents.map((event) => event.event_type))
  };

  return {
    ...overrides,
    summary: {
      ...derivedSummary,
      ...overrides.summary,
      run_statuses: overrides.summary?.run_statuses ?? derivedSummary.run_statuses,
      event_types: overrides.summary?.event_types ?? derivedSummary.event_types
    },
    recent_runs: recentRuns,
    recent_events: recentEvents
  };
}

export function buildCallbackWaitingAutomationStepFixture(
  overrides: CallbackWaitingAutomationStepFixtureOverrides = {}
): CallbackWaitingAutomationStep {
  const { scheduler_health: schedulerHealthOverrides = {}, ...stepOverrides } = overrides;

  return {
    key: stepOverrides.key ?? "waiting_resume_monitor",
    label: stepOverrides.label ?? "Waiting resume monitor",
    task: stepOverrides.task ?? "resume",
    source: stepOverrides.source ?? "scheduler",
    enabled: stepOverrides.enabled ?? true,
    interval_seconds: stepOverrides.interval_seconds ?? 30,
    detail: stepOverrides.detail ?? "monitor overdue waiting resumes",
    scheduler_health: {
      health_status: schedulerHealthOverrides.health_status ?? "healthy",
      detail: schedulerHealthOverrides.detail ?? "healthy",
      last_status: schedulerHealthOverrides.last_status ?? "ok",
      last_started_at:
        schedulerHealthOverrides.last_started_at ?? "2026-03-24T08:00:00Z",
      last_finished_at:
        schedulerHealthOverrides.last_finished_at ?? "2026-03-24T08:00:10Z",
      matched_count: schedulerHealthOverrides.matched_count ?? 0,
      affected_count: schedulerHealthOverrides.affected_count ?? 0
    },
    ...stepOverrides
  };
}

export function buildCallbackWaitingAutomationFixture(
  overrides: CallbackWaitingAutomationFixtureOverrides = {}
): CallbackWaitingAutomation {
  const steps = overrides.steps ?? [];
  const defaultSnapshot: CallbackWaitingAutomation = {
    status: "configured",
    scheduler_required: true,
    detail: "healthy",
    scheduler_health_status: "healthy",
    scheduler_health_detail: "healthy",
    steps,
    affected_run_count: 0,
    affected_workflow_count: 0,
    primary_blocker_kind: null,
    recommended_action: null
  };

  return {
    ...defaultSnapshot,
    ...overrides
  };
}

export function buildSensitiveAccessBlockerFixture(
  overrides: SensitiveAccessBlockerFixtureOverrides = {}
): SensitiveAccessBlocker {
  return {
    kind: "pending_approval",
    tone: "blocked",
    item_count: 1,
    affected_run_count: 1,
    affected_workflow_count: 1,
    ...overrides
  };
}

export function buildSensitiveAccessSummaryFixture(
  overrides: SensitiveAccessSummaryFixtureOverrides = {}
): SensitiveAccessSummary {
  const blockers = overrides.blockers ?? [];
  const defaultSnapshot: SensitiveAccessSummary = {
    ticket_count: 0,
    pending_ticket_count: 0,
    approved_ticket_count: 0,
    rejected_ticket_count: 0,
    expired_ticket_count: 0,
    waiting_ticket_count: 0,
    resumed_ticket_count: 0,
    failed_ticket_count: 0,
    pending_notification_count: 0,
    delivered_notification_count: 0,
    failed_notification_count: 0,
    affected_run_count: 0,
    affected_workflow_count: 0,
    primary_blocker_kind: null,
    blockers
  };

  return {
    ...defaultSnapshot,
    ...overrides
  };
}

export function buildSystemOverviewFixture(
  overrides: SystemOverviewFixtureOverrides = {}
): SystemOverview {
  const defaultSnapshot = {
    status: "ok",
    environment: "local",
    services: [],
    capabilities: [],
    plugin_adapters: [],
    sandbox_backends: [],
    sandbox_readiness: buildSandboxReadinessFixture(),
    plugin_tools: [],
    runtime_activity: buildRuntimeActivityFixture(),
    callback_waiting_automation: buildCallbackWaitingAutomationFixture()
  } satisfies SystemOverview;

  return {
    ...defaultSnapshot,
    ...overrides,
    services: overrides.services ?? defaultSnapshot.services,
    capabilities: overrides.capabilities ?? defaultSnapshot.capabilities,
    plugin_adapters: overrides.plugin_adapters ?? defaultSnapshot.plugin_adapters,
    sandbox_backends: overrides.sandbox_backends ?? defaultSnapshot.sandbox_backends,
    sandbox_readiness: buildSandboxReadinessFixture(overrides.sandbox_readiness),
    plugin_tools: overrides.plugin_tools ?? defaultSnapshot.plugin_tools,
    runtime_activity: buildRuntimeActivityFixture(overrides.runtime_activity),
    callback_waiting_automation: buildCallbackWaitingAutomationFixture(
      overrides.callback_waiting_automation
    )
  };
}

export function buildSensitiveAccessInboxSnapshotFixture(
  overrides: SensitiveAccessInboxSnapshotFixtureOverrides = {}
): SensitiveAccessInboxSnapshot {
  const defaultSnapshot = {
    channels: [],
    resources: [],
    requests: [],
    notifications: [],
    summary: buildSensitiveAccessSummaryFixture(),
    entries: []
  } satisfies SensitiveAccessInboxSnapshot;

  return {
    ...defaultSnapshot,
    ...overrides,
    channels: overrides.channels ?? defaultSnapshot.channels,
    resources: overrides.resources ?? defaultSnapshot.resources,
    requests: overrides.requests ?? defaultSnapshot.requests,
    notifications: overrides.notifications ?? defaultSnapshot.notifications,
    summary: buildSensitiveAccessSummaryFixture(overrides.summary),
    entries: overrides.entries ?? defaultSnapshot.entries
  };
}

export function buildSensitiveAccessTicketFixture(
  overrides: Partial<SensitiveAccessTicket> = {}
): SensitiveAccessTicket {
  return {
    id: "ticket-1",
    access_request_id: "request-1",
    run_id: "run-1",
    node_run_id: "node-run-1",
    status: "pending",
    waiting_status: "waiting",
    created_at: "2026-03-24T08:00:00Z",
    decided_at: null,
    expires_at: null,
    approved_by: null,
    ...overrides
  };
}

export function buildSensitiveAccessRequestFixture(
  overrides: Partial<SensitiveAccessRequest> = {}
): SensitiveAccessRequest {
  return {
    id: "request-1",
    run_id: "run-1",
    node_run_id: "node-run-1",
    requester_type: "workflow",
    requester_id: "workflow-1",
    resource_id: "resource-1",
    action_type: "read",
    decision: "require_approval",
    decision_label: "require approval",
    reason_code: "approval_required",
    reason_label: "approval required",
    policy_summary: null,
    created_at: "2026-03-24T08:00:00Z",
    decided_at: null,
    purpose_text: null,
    ...overrides
  };
}

export function buildSensitiveAccessResourceFixture(
  overrides: Partial<SensitiveAccessResource> = {}
): SensitiveAccessResource {
  return {
    id: "resource-1",
    label: "Sandbox secret",
    description: null,
    sensitivity_level: "L2",
    source: "workflow_context",
    metadata: {},
    created_at: "2026-03-24T08:00:00Z",
    updated_at: "2026-03-24T08:00:00Z",
    ...overrides
  };
}

export function buildSensitiveAccessExecutionFocusNodeFixture(
  overrides: Partial<SensitiveAccessExecutionFocusNode> = {}
): SensitiveAccessExecutionFocusNode {
  return {
    node_run_id: "node-run-1",
    node_id: "node-1",
    node_name: "Approval Node",
    node_type: "tool",
    waiting_reason: null,
    scheduled_resume_delay_seconds: null,
    scheduled_resume_due_at: null,
    callback_tickets: [],
    sensitive_access_entries: [],
    execution_fallback_count: 0,
    execution_blocked_count: 0,
    execution_unavailable_count: 0,
    execution_blocking_reason: null,
    execution_fallback_reason: null,
    artifact_refs: [],
    artifacts: [],
    tool_calls: [],
    ...overrides
  };
}

export function buildSensitiveAccessExecutionContextFixture(
  overrides: Partial<SensitiveAccessExecutionContext> = {}
): SensitiveAccessExecutionContext {
  return {
    runId: "run-1",
    focusNode: buildSensitiveAccessExecutionFocusNodeFixture(),
    focusReason: "current_node",
    focusExplanation: null,
    focusMatchesEntry: true,
    entryNodeRunId: "node-run-1",
    skillTrace: null,
    ...overrides
  };
}

export function buildSensitiveAccessInboxEntryFixture(
  overrides: Partial<SensitiveAccessInboxEntry> = {}
): SensitiveAccessInboxEntry {
  return {
    ticket: buildSensitiveAccessTicketFixture(),
    request: buildSensitiveAccessRequestFixture(),
    resource: buildSensitiveAccessResourceFixture(),
    notifications: [],
    runSnapshot: null,
    runFollowUp: null,
    legacyAuthGovernance: null,
    callbackWaitingContext: null,
    executionContext: null,
    ...overrides
  };
}
