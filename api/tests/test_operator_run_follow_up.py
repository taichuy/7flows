from datetime import UTC, datetime

from app.models.run import NodeRun, Run, RunArtifact, RunEvent, ToolCallRecord
from app.schemas.operator_follow_up import (
    OperatorRunFollowUpSummary,
    OperatorRunSnapshot,
    OperatorRunSnapshotSample,
)
from app.services.callback_waiting_lifecycle import (
    build_callback_waiting_scheduled_resume,
    record_callback_resume_schedule,
    record_callback_ticket_issued,
)
from app.services.operator_run_follow_up import (
    build_operator_run_follow_up_summary,
    load_operator_run_snapshot,
    resolve_operator_run_snapshot_from_follow_up,
)


def test_build_operator_run_follow_up_summary_counts_all_affected_runs(
    sqlite_session,
    sample_workflow,
):
    runs = [
        Run(
            id="run-follow-up-waiting",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="waiting",
            current_node_id="mock_tool",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
        Run(
            id="run-follow-up-running",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="running",
            current_node_id="mock_tool",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
        Run(
            id="run-follow-up-succeeded",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="succeeded",
            current_node_id="endNode",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
        Run(
            id="run-follow-up-failed",
            workflow_id=sample_workflow.id,
            workflow_version=sample_workflow.version,
            compiled_blueprint_id=None,
            status="failed",
            current_node_id="mock_tool",
            input_payload={},
            checkpoint_payload={},
            created_at=datetime.now(UTC),
        ),
    ]
    sqlite_session.add_all(runs)
    sqlite_session.add_all(
        [
            NodeRun(
                id="node-run-follow-up-waiting",
                run_id="run-follow-up-waiting",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="toolNode",
                status="waiting",
                phase="waiting",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                waiting_reason="waiting approval",
                created_at=datetime.now(UTC),
            ),
            NodeRun(
                id="node-run-follow-up-running",
                run_id="run-follow-up-running",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="toolNode",
                status="running",
                phase="executing",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                created_at=datetime.now(UTC),
            ),
            NodeRun(
                id="node-run-follow-up-succeeded",
                run_id="run-follow-up-succeeded",
                node_id="endNode",
                node_name="endNode",
                node_type="endNode",
                status="succeeded",
                phase="completed",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                finished_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            ),
            NodeRun(
                id="node-run-follow-up-failed",
                run_id="run-follow-up-failed",
                node_id="mock_tool",
                node_name="Mock Tool",
                node_type="toolNode",
                status="failed",
                phase="failed",
                input_payload={},
                checkpoint_payload={},
                working_context={},
                finished_at=datetime.now(UTC),
                created_at=datetime.now(UTC),
            ),
        ]
    )
    sqlite_session.commit()

    summary = build_operator_run_follow_up_summary(
        sqlite_session,
        [run.id for run in runs],
        sample_limit=3,
    )

    assert summary.affected_run_count == 4
    assert summary.sampled_run_count == 3
    assert summary.waiting_run_count == 1
    assert summary.running_run_count == 1
    assert summary.succeeded_run_count == 1
    assert summary.failed_run_count == 1
    assert summary.unknown_run_count == 0
    assert [item.run_id for item in summary.sampled_runs] == [
        "run-follow-up-waiting",
        "run-follow-up-running",
        "run-follow-up-succeeded",
    ]
    assert summary.sampled_runs[0].snapshot is not None
    assert summary.sampled_runs[0].snapshot.waiting_reason == "waiting approval"
    assert summary.sampled_runs[0].snapshot.execution_focus_reason == "blocking_node_run"
    assert summary.sampled_runs[0].snapshot.execution_focus_node_id == "mock_tool"
    assert summary.sampled_runs[0].snapshot.execution_focus_node_run_id == (
        "node-run-follow-up-waiting"
    )
    assert summary.sampled_runs[0].snapshot.execution_focus_explanation.model_dump() == {
        "primary_signal": "等待原因：waiting approval",
        "follow_up": (
            "下一步：优先沿 waiting / callback 事实链排查，不要只盯单次 invocation 返回。"
        ),
    }
    assert summary.explanation is not None
    assert summary.explanation.model_dump() == {
        "primary_signal": (
            "本次影响 4 个 run；整体状态分布：waiting 1、running 1、succeeded 1、failed 1。"
            "已回读 3 个样本。"
        ),
        "follow_up": (
            "run run-follow-up-waiting：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：等待原因：waiting approval 后续动作："
            "下一步：优先沿 waiting / callback 事实链排查，"
            "不要只盯单次 invocation 返回。 "
            "run run-follow-up-running：当前 run 状态：running。 当前节点：mock_tool。 "
                "run run-follow-up-succeeded：当前 run 状态：succeeded。 当前节点：endNode。 "
            "其余 1 个 run 可继续到对应 run detail / inbox slice 查看后续推进。"
        ),
    }


def test_resolve_operator_run_snapshot_from_follow_up_matches_run_id_before_first_sample() -> None:
    primary_snapshot = resolve_operator_run_snapshot_from_follow_up(
        run_follow_up=OperatorRunFollowUpSummary(
            affected_run_count=2,
            sampled_run_count=2,
            sampled_runs=[
                OperatorRunSnapshotSample(
                    run_id="run-stale",
                    snapshot=OperatorRunSnapshot(
                        workflow_id="wf-stale",
                        status="waiting",
                        current_node_id="tool_wait",
                    ),
                ),
                OperatorRunSnapshotSample(
                    run_id="run-primary",
                    snapshot=OperatorRunSnapshot(
                        workflow_id="wf-primary",
                        status="succeeded",
                        current_node_id="endNode",
                    ),
                ),
            ],
        ),
        run_id="run-primary",
    )

    assert primary_snapshot is not None
    assert primary_snapshot.workflow_id == "wf-primary"
    assert primary_snapshot.status == "succeeded"

    fallback_snapshot = resolve_operator_run_snapshot_from_follow_up(
        run_follow_up=OperatorRunFollowUpSummary(
            affected_run_count=2,
            sampled_run_count=2,
            sampled_runs=[
                OperatorRunSnapshotSample(
                    run_id="run-stale",
                    snapshot=OperatorRunSnapshot(
                        workflow_id="wf-stale",
                        status="waiting",
                    ),
                ),
                OperatorRunSnapshotSample(
                    run_id="run-primary",
                    snapshot=OperatorRunSnapshot(
                        workflow_id="wf-primary",
                        status="succeeded",
                    ),
                ),
            ],
        ),
        run_id="run-missing",
    )

    assert fallback_snapshot is not None
    assert fallback_snapshot.workflow_id == "wf-stale"


def test_load_operator_run_snapshot_surfaces_execution_fallback_focus(
    sqlite_session,
    sample_workflow,
):
    run = Run(
        id="run-follow-up-fallback",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id=None,
        status="succeeded",
        current_node_id=None,
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-follow-up-fallback",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="toolNode",
        status="succeeded",
        phase="completed",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        finished_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all(
        [
            run,
            node_run,
            RunEvent(
                run_id=run.id,
                node_run_id=node_run.id,
                event_type="tool.execution.fallback",
                payload={
                    "node_id": node_run.node_id,
                    "requested_execution_class": "microvm",
                    "effective_execution_class": "inline",
                    "executor_ref": "runtime:inline-fallback:microvm",
                    "reason": "execution_class_not_implemented_for_node_type",
                },
                created_at=datetime.now(UTC),
            ),
        ]
    )
    sqlite_session.commit()

    snapshot = load_operator_run_snapshot(sqlite_session, run.id)

    assert snapshot is not None
    assert snapshot.workflow_id == sample_workflow.id
    assert snapshot.status == "succeeded"
    assert snapshot.current_node_id is None
    assert snapshot.waiting_reason is None
    assert snapshot.execution_focus_reason == "fallback_node"
    assert snapshot.execution_focus_node_id == "mock_tool"
    assert snapshot.execution_focus_node_run_id == "node-run-follow-up-fallback"
    assert snapshot.execution_focus_explanation.model_dump() == {
        "primary_signal": (
            "执行降级：当前节点尚未实现请求的 execution class，已临时回退到 inline。"
        ),
        "follow_up": (
            "下一步：如果这条节点需要受控执行或强隔离，应补齐对应 execution adapter；"
            "不要把当前 fallback 当成长期默认。"
        ),
    }


def test_load_operator_run_snapshot_surfaces_focus_evidence_samples(
    sqlite_session,
    sample_workflow,
):
    now = datetime.now(UTC)
    run = Run(
        id="run-follow-up-evidence",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id=None,
        status="succeeded",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=now,
    )
    artifact = RunArtifact(
        id="artifact-follow-up-evidence",
        run_id=run.id,
        node_run_id="node-run-follow-up-evidence",
        artifact_kind="tool_result",
        content_type="application/json",
        summary="sandbox tool raw payload",
        metadata_payload={},
        created_at=now,
    )
    node_run = NodeRun(
        id="node-run-follow-up-evidence",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="toolNode",
        status="succeeded",
        phase="completed",
        input_payload={},
        checkpoint_payload={},
        working_context={},
        artifact_refs=[f"artifact://{artifact.id}"],
        finished_at=now,
        created_at=now,
    )
    tool_call = ToolCallRecord(
        id="tool-call-follow-up-evidence",
        run_id=run.id,
        node_run_id=node_run.id,
        tool_id="mock_tool",
        tool_name="Mock Tool",
        phase="execute",
        status="succeeded",
        request_summary="call tool",
        execution_trace={
            "requested_execution_class": "microvm",
            "execution_source": "tool_policy",
            "requested_execution_profile": "risk-reviewed",
            "requested_execution_timeout_ms": 3000,
            "requested_network_policy": "isolated",
            "requested_filesystem_policy": "ephemeral",
            "requested_dependency_mode": "builtin",
            "requested_builtin_package_set": "research-default",
            "requested_backend_extensions": {
                "image": "python:3.12",
                "mount": "workspace",
            },
            "effective_execution_class": "microvm",
            "executor_ref": "tool:compat-adapter:dify-default",
            "sandbox_backend_id": "sandbox-default",
            "sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
            "sandbox_runner_kind": "container",
            "adapter_request_trace_id": "trace-follow-up-compat",
            "adapter_request_execution": {
                "class": "microvm",
                "source": "tool_policy",
                "profile": "risk-reviewed",
                "timeoutMs": 3000,
            },
            "adapter_request_execution_class": "microvm",
            "adapter_request_execution_source": "tool_policy",
            "adapter_request_execution_contract": {
                "kind": "tool_execution",
                "toolId": "mock_tool",
                "irVersion": "2026-03-10",
            },
        },
        response_summary="tool completed",
        response_content_type="application/json",
        response_meta={},
        raw_artifact_id=artifact.id,
        created_at=now,
        finished_at=now,
    )
    sqlite_session.add_all([run, artifact, node_run, tool_call])
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="tool.execution.dispatched",
            payload={
                "node_id": node_run.node_id,
                "requested_execution_class": "microvm",
                "effective_execution_class": "microvm",
                "executor_ref": "tool:compat-adapter:dify-default",
                "sandbox_backend_id": "sandbox-default",
                "sandbox_runner_kind": "container",
            },
            created_at=now,
        )
    )
    sqlite_session.add(
        RunEvent(
            run_id=run.id,
            node_run_id=node_run.id,
            event_type="agent.skill.references.loaded",
            payload={
                "node_id": node_run.node_id,
                "phase": "main_plan",
                "references": [
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-handoff",
                        "reference_name": "Operator Handoff",
                        "load_source": "skill_binding",
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/references/ref-handoff"
                            "?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-handoff",
                            "workspace_id": "default",
                        },
                    },
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-budget",
                        "reference_name": "Budget Control",
                        "load_source": "retrieval_query_match",
                        "fetch_reason": "Matched query terms: budget, guardrails",
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/references/ref-budget"
                            "?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-budget",
                            "workspace_id": "default",
                        },
                    },
                ],
            },
            created_at=now,
        )
    )
    sqlite_session.commit()

    snapshot = load_operator_run_snapshot(sqlite_session, run.id)

    assert snapshot is not None
    assert snapshot.execution_focus_node_name == "Mock Tool"
    assert snapshot.execution_focus_node_type == "toolNode"
    assert snapshot.execution_focus_artifact_count == 1
    assert snapshot.execution_focus_artifact_ref_count == 1
    assert snapshot.execution_focus_tool_call_count == 1
    assert snapshot.execution_focus_raw_ref_count == 1
    assert snapshot.execution_focus_artifact_refs == [f"artifact://{artifact.id}"]
    assert snapshot.execution_focus_artifacts[0].model_dump() == {
        "artifact_kind": "tool_result",
        "content_type": "application/json",
        "summary": "sandbox tool raw payload",
        "uri": f"artifact://{artifact.id}",
    }
    assert snapshot.execution_focus_tool_calls[0].model_dump() == {
        "id": tool_call.id,
        "tool_id": "mock_tool",
        "tool_name": "Mock Tool",
        "phase": "execute",
        "status": "succeeded",
        "requested_execution_class": "microvm",
        "requested_execution_source": "tool_policy",
        "requested_execution_profile": "risk-reviewed",
        "requested_execution_timeout_ms": 3000,
        "requested_execution_network_policy": "isolated",
        "requested_execution_filesystem_policy": "ephemeral",
        "requested_execution_dependency_mode": "builtin",
        "requested_execution_builtin_package_set": "research-default",
        "requested_execution_dependency_ref": None,
        "requested_execution_backend_extensions": {
            "image": "python:3.12",
            "mount": "workspace",
        },
        "effective_execution_class": "microvm",
        "execution_executor_ref": "tool:compat-adapter:dify-default",
        "execution_sandbox_backend_id": "sandbox-default",
        "execution_sandbox_backend_executor_ref": "sandbox-backend:sandbox-default",
        "execution_sandbox_runner_kind": "container",
        "adapter_request_trace_id": "trace-follow-up-compat",
        "adapter_request_execution": {
            "class": "microvm",
            "source": "tool_policy",
            "profile": "risk-reviewed",
            "timeoutMs": 3000,
        },
        "adapter_request_execution_class": "microvm",
        "adapter_request_execution_source": "tool_policy",
        "adapter_request_execution_contract": {
            "kind": "tool_execution",
            "toolId": "mock_tool",
            "irVersion": "2026-03-10",
        },
        "execution_blocking_reason": None,
        "execution_fallback_reason": None,
        "response_summary": "tool completed",
        "response_content_type": "application/json",
        "raw_ref": f"artifact://{artifact.id}",
    }
    assert snapshot.execution_focus_skill_trace is not None
    assert snapshot.execution_focus_skill_trace.model_dump() == {
        "reference_count": 2,
        "phase_counts": {"main_plan": 2},
        "source_counts": {
            "retrieval_query_match": 1,
            "skill_binding": 1,
        },
        "loads": [
            {
                "phase": "main_plan",
                "references": [
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-handoff",
                        "reference_name": "Operator Handoff",
                        "load_source": "skill_binding",
                        "fetch_reason": None,
                        "fetch_request_index": None,
                        "fetch_request_total": None,
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/"
                            "references/ref-handoff?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-handoff",
                            "workspace_id": "default",
                        },
                    },
                    {
                        "skill_id": "skill-research-brief",
                        "skill_name": "Research Brief",
                        "reference_id": "ref-budget",
                        "reference_name": "Budget Control",
                        "load_source": "retrieval_query_match",
                        "fetch_reason": "Matched query terms: budget, guardrails",
                        "fetch_request_index": None,
                        "fetch_request_total": None,
                        "retrieval_http_path": (
                            "/api/skills/skill-research-brief/"
                            "references/ref-budget?workspace_id=default"
                        ),
                        "retrieval_mcp_method": "skills.get_reference",
                        "retrieval_mcp_params": {
                            "skill_id": "skill-research-brief",
                            "reference_id": "ref-budget",
                            "workspace_id": "default",
                        },
                    },
                ],
            }
        ],
    }


def test_load_operator_run_snapshot_prefers_callback_waiting_explanation(
    sqlite_session,
    sample_workflow,
):
    scheduled_at = datetime(2026, 3, 20, 10, 0, tzinfo=UTC)
    requeued_at = datetime(2026, 3, 20, 10, 1, tzinfo=UTC)
    checkpoint_payload = record_callback_ticket_issued(
        {},
        reason="Waiting for external callback",
        issued_at=scheduled_at,
    )
    checkpoint_payload = record_callback_resume_schedule(
        checkpoint_payload,
        delay_seconds=30,
        reason="callback pending",
        source="callback_ticket_monitor",
        backoff_attempt=1,
    )
    checkpoint_payload = {
        **checkpoint_payload,
        "scheduled_resume": build_callback_waiting_scheduled_resume(
        delay_seconds=30,
        reason="callback pending",
        source="callback_ticket_monitor",
        waiting_status="waiting_callback",
        backoff_attempt=1,
        scheduled_at=scheduled_at,
        requeued_at=requeued_at,
        requeue_source="scheduler_waiting_resume_monitor",
    ),
    }

    run = Run(
        id="run-follow-up-callback-waiting",
        workflow_id=sample_workflow.id,
        workflow_version=sample_workflow.version,
        compiled_blueprint_id=None,
        status="waiting",
        current_node_id="mock_tool",
        input_payload={},
        checkpoint_payload={},
        created_at=datetime.now(UTC),
    )
    node_run = NodeRun(
        id="node-run-follow-up-callback-waiting",
        run_id=run.id,
        node_id="mock_tool",
        node_name="Mock Tool",
        node_type="toolNode",
        status="waiting",
        phase="waiting",
        input_payload={},
        checkpoint_payload=checkpoint_payload,
        working_context={},
        waiting_reason="Waiting for callback",
        created_at=datetime.now(UTC),
    )
    sqlite_session.add_all([run, node_run])
    sqlite_session.commit()

    summary = build_operator_run_follow_up_summary(sqlite_session, [run.id])

    snapshot = summary.sampled_runs[0].snapshot
    assert snapshot is not None
    assert snapshot.execution_focus_explanation is not None
    assert snapshot.execution_focus_explanation.model_dump() == {
        "primary_signal": "等待原因：Waiting for callback",
        "follow_up": (
            "下一步：当前节点已安排自动 resume（30.0s），预计在 2026-03-20T10:00:30Z 左右触发，"
            "优先观察调度补偿是否恢复。"
        ),
    }
    assert snapshot.callback_waiting_explanation is not None
    assert snapshot.callback_waiting_explanation.model_dump() == {
        "primary_signal": (
            "最近一次到期的 scheduled resume 已被重新入队，waiting 节点正在等待新的恢复尝试。"
        ),
        "follow_up": (
            "下一步：先观察 worker 是否消费这次 requeue。最近一次 due_at 为 "
            "2026-03-20T10:00:30Z。requeue 时间为 2026-03-20T10:01:00Z。"
            "来源为 scheduler_waiting_resume_monitor。若仍无推进，再考虑手动 resume。"
        ),
    }
    assert snapshot.scheduled_resume_delay_seconds == 30
    assert snapshot.scheduled_resume_reason == "callback pending"
    assert snapshot.scheduled_resume_source == "callback_ticket_monitor"
    assert snapshot.scheduled_waiting_status == "waiting_callback"
    assert snapshot.scheduled_resume_scheduled_at == scheduled_at
    assert snapshot.scheduled_resume_due_at == datetime(2026, 3, 20, 10, 0, 30, tzinfo=UTC)
    assert snapshot.scheduled_resume_requeued_at == requeued_at
    assert (
        snapshot.scheduled_resume_requeue_source
        == "scheduler_waiting_resume_monitor"
    )
    assert summary.explanation is not None
    assert summary.explanation.model_dump() == {
        "primary_signal": "本次影响 1 个 run；整体状态分布：waiting 1。已回读 1 个样本。",
        "follow_up": (
            "run run-follow-up-callback-waiting：当前 run 状态：waiting。 当前节点：mock_tool。 "
            "重点信号：最近一次到期的 scheduled resume 已被重新入队，"
            "waiting 节点正在等待新的恢复尝试。 "
            "后续动作：下一步：先观察 worker 是否消费这次 requeue。最近一次 due_at 为 "
            "2026-03-20T10:00:30Z。requeue 时间为 2026-03-20T10:01:00Z。"
            "来源为 scheduler_waiting_resume_monitor。若仍无推进，再考虑手动 resume。"
        ),
    }
    assert summary.recommended_action is not None
    assert summary.recommended_action.model_dump() == {
        "kind": "callback waiting",
        "entry_key": "runLibrary",
        "href": f"/runs/{run.id}",
        "label": "open run",
    }
